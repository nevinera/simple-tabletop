import { describe, expect, it } from "vitest";
import { applyAction, initialState } from "../state/actions";
import { normalizeManifest } from "../manifest/manifest";
import { findObject } from "../state/objects";

const manifest = normalizeManifest({
  formatVersion: 1,
  id: "test",
  name: "Test",
  table: { size: [90, 90] },
  layers: [{ id: "board", thickness: 0.3 }, { id: "pieces", thickness: 0.03 }],
  seats: [{ id: "south", name: "South", side: "south" }],
  pieceTypes: { card: { kind: "card", size: [6.3, 8.8], back: "back.svg" } },
  pieces: [
    { id: "mat", kind: "board", shape: "circle", size: [40], layer: "board", face: "mat.svg", position: [45, 45], fixed: true },
    { id: "AS", type: "card", face: "AS.svg", position: [10, 20] },
    { id: "AH", type: "card", face: "AH.svg", position: [30, 20], rotation: 90, faceUp: false },
    { id: "KS", type: "card", face: "KS.svg" },
    { id: "coin", kind: "chip", size: [2], face: "coin.svg", position: [80, 80] },
    { id: "pawn", kind: "pawn", size: [3], position: [80, 40] },
  ],
  containers: [{ id: "deck", kind: "deck", position: [60, 60], size: [6.3, 8.8], members: ["KS"] }],
}, "https://example.com/manifest.json");

const act = (state, action) => applyAction(manifest, state, { playerId: "p1", ...action });

function held(id = "AS", playerId = "p1") {
  return applyAction(manifest, initialState(manifest), { type: "grab", id, playerId }).state;
}

describe("initialState", () => {
  it("places pieces from the manifest, stacked in manifest order per layer", () => {
    const state = initialState(manifest);
    expect(state.sequence).toBe(0);
    expect(state.pieces.AS).toEqual({
      x: 10, y: 20, rotation: 0, faceUp: true, stackOrder: 0, containerId: null, heldBy: null, drag: null, locked: false,
    });
    expect(state.pieces.AH).toMatchObject({ rotation: 90, faceUp: false, stackOrder: 1 });
    expect(state.pieces.mat).toMatchObject({ stackOrder: 0, locked: true });
  });

  it("puts container members in their container, without a position", () => {
    const state = initialState(manifest);
    expect(state.pieces.KS).toMatchObject({ x: null, y: null, containerId: "deck" });
    expect(state.containers.deck).toEqual({
      x: 60, y: 60, rotation: 0, faceUp: false, members: ["KS"], heldBy: null, drag: null, locked: false,
      splay: null, splayDistance: null,
    });
  });
});

describe("applyAction", () => {
  it("grabs a free piece and saves the change", () => {
    const result = act(initialState(manifest), { type: "grab", id: "AS" });
    expect(result.ok).toBe(true);
    expect(result.state.pieces.AS.heldBy).toBe("p1");
    expect(result.state.sequence).toBe(1);
  });

  it("won't grab a piece someone else holds", () => {
    const result = act(held("AS", "p2"), { type: "grab", id: "AS" });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/Someone else/) });
  });

  it("drags without saving", () => {
    const state = held();
    const result = act(state, { type: "drag", id: "AS", x: 50, y: 50 });
    expect(result.state.pieces.AS.drag).toEqual({ x: 50, y: 50 });
    expect(result.state.pieces.AS.x).toBe(10);
    expect(result.state.sequence).toBe(state.sequence);
  });

  it("drops on top of its layer and lets go", () => {
    const dragged = act(held(), { type: "drag", id: "AS", x: 50, y: 50 }).state;
    const result = act(dragged, { type: "drop", id: "AS", x: 51, y: 52 });
    expect(result.state.pieces.AS).toMatchObject({ x: 51, y: 52, stackOrder: 5, heldBy: null, drag: null });
    expect(result.state.sequence).toBe(dragged.sequence + 1);
  });

  it("rests a piece dropped onto another on top of it", () => {
    const result = act(held(), { type: "drop", id: "AS", x: 24, y: 21 });
    expect(result.ok).toBe(true);
    expect(result.state.pieces.AS).toMatchObject({ x: 24, y: 21, z: 0.03, heldBy: null });
  });

  it("won't drop onto something that can't hold it up", () => {
    const result = act(held(), { type: "drop", id: "AS", x: 81, y: 41 });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/overlap/) });
    expect(result.state.pieces.AS).toMatchObject({ x: 10, y: 20, heldBy: "p1" });
  });

  it("drops right up against another piece", () => {
    // AH is turned 90°, so it reaches 4.4cm to either side of x 30.
    const result = act(held(), { type: "drop", id: "AS", x: 30 - 4.4 - 3.15, y: 20 });
    expect(result.ok).toBe(true);
  });

  it("releases without moving", () => {
    const dragged = act(held(), { type: "drag", id: "AS", x: 50, y: 50 }).state;
    const result = act(dragged, { type: "release", id: "AS" });
    expect(result.state.pieces.AS).toMatchObject({ x: 10, y: 20, heldBy: null, drag: null });
  });

  it.each(["drag", "drop", "release"])("won't %s a piece you don't hold", (type) => {
    expect(act(initialState(manifest), { type, id: "AS", x: 0, y: 0 }).ok).toBe(false);
    expect(act(held("AS", "p2"), { type, id: "AS", x: 0, y: 0 }).ok).toBe(false);
  });

  it("flips and rotates a piece nobody holds", () => {
    const flipped = act(initialState(manifest), { type: "flip", id: "AS" }).state;
    expect(flipped.pieces.AS.faceUp).toBe(false);
    const rotated = act(flipped, { type: "rotate", id: "AH", degrees: -135 }).state;
    expect(rotated.pieces.AH.rotation).toBe(315);
  });

  it("won't rotate a resting piece into a pawn, but will rotate a held one", () => {
    // The pawn reaches left to x 78.5. Upright at x 75, AS reaches right to
    // 78.15; turned a quarter, it would reach 79.4.
    const state = initialState(manifest);
    const crowded = { ...state, pieces: { ...state.pieces, AS: { ...state.pieces.AS, x: 75, y: 40 } } };
    expect(act(crowded, { type: "rotate", id: "AS", degrees: 180 }).ok).toBe(true);
    expect(act(crowded, { type: "rotate", id: "AS", degrees: 90 })).toMatchObject({ ok: false, blocked: true });
    const grabbed = act(crowded, { type: "grab", id: "AS" }).state;
    expect(act(grabbed, { type: "rotate", id: "AS", degrees: 90 }).ok).toBe(true);
  });

  it("won't flip or rotate a piece someone else holds", () => {
    expect(act(held("AS", "p2"), { type: "flip", id: "AS" }).ok).toBe(false);
    expect(act(held("AS", "p2"), { type: "rotate", id: "AS", degrees: 45 }).ok).toBe(false);
  });

  it("refuses locked pieces, pieces in containers, and unknown objects or actions", () => {
    const state = initialState(manifest);
    expect(act(state, { type: "grab", id: "mat" }).reason).toMatch(/locked/);
    expect(act(state, { type: "flip", id: "KS" }).reason).toMatch(/container/);
    expect(act(state, { type: "grab", id: "nope" }).reason).toMatch(/Unknown object/);
    expect(act(state, { type: "juggle", id: "AS" }).reason).toMatch(/Unknown action/);
  });

  it("locks and unlocks, putting a held piece back first", () => {
    const dragged = act(held(), { type: "drag", id: "AS", x: 50, y: 50 }).state;
    const locked = act(dragged, { type: "lock", id: "AS" }).state;
    expect(locked.pieces.AS).toMatchObject({ x: 10, y: 20, locked: true, heldBy: null, drag: null });
    expect(act(locked, { type: "grab", id: "AS" }).ok).toBe(false);
    expect(act(locked, { type: "rotate", id: "AS", degrees: 45 }).ok).toBe(false);
    const unlocked = act(locked, { type: "lock", id: "AS" }).state;
    expect(act(unlocked, { type: "grab", id: "AS" }).ok).toBe(true);
    expect(act(initialState(manifest), { type: "lock", id: "mat" }).state.pieces.mat.locked).toBe(false);
  });

  it("leaves the old state untouched", () => {
    const state = initialState(manifest);
    act(state, { type: "flip", id: "AS" });
    expect(state.pieces.AS.faceUp).toBe(true);
    expect(state.sequence).toBe(0);
  });
});

describe("decks", () => {
  const draw = (state = initialState(manifest)) => act(state, { type: "draw", id: "deck" });

  it("draws the top card, held by the drawer, facing the way the deck does", () => {
    const result = draw();
    expect(result.state.containers.deck.members).toEqual([]);
    expect(result.state.pieces.KS).toMatchObject({
      containerId: null, x: 60, y: 60, faceUp: false, heldBy: "p1", stackOrder: 5,
    });
    expect(draw(result.state).reason).toMatch(/empty/);
  });

  it("draws from a locked deck, but not one someone else holds", () => {
    const locked = act(initialState(manifest), { type: "lock", id: "deck" }).state;
    expect(draw(locked).ok).toBe(true);
    const grabbed = applyAction(manifest, initialState(manifest), { type: "grab", id: "deck", playerId: "p2" }).state;
    expect(draw(grabbed).ok).toBe(false);
  });

  it("takes a card dropped onto it, on top, turned to match", () => {
    const result = act(held("AS"), { type: "drop", id: "AS", x: 61, y: 59 });
    expect(result.ok).toBe(true);
    expect(result.state.containers.deck.members).toEqual(["AS", "KS"]);
    expect(result.state.pieces.AS).toMatchObject({ containerId: "deck", x: null, y: null, faceUp: false, heldBy: null });
  });

  it("holds up a piece it doesn't accept", () => {
    const coin = act(held("coin"), { type: "drop", id: "coin", x: 60, y: 60 });
    expect(coin.ok).toBe(true);
    expect(coin.state.containers.deck.members).toEqual(["KS"]);
    expect(coin.state.pieces.coin).toMatchObject({ containerId: null, z: 0.8 });
  });

  it("moves and rotates like a piece", () => {
    const grabbed = act(initialState(manifest), { type: "grab", id: "deck" }).state;
    const moved = act(grabbed, { type: "drop", id: "deck", x: 70, y: 70 }).state;
    expect(moved.containers.deck).toMatchObject({ x: 70, y: 70, heldBy: null });
    expect(act(moved, { type: "rotate", id: "deck", degrees: 90 }).state.containers.deck.rotation).toBe(90);
  });

  it("flips over, bringing its bottom card to the top", () => {
    let state = initialState(manifest);
    state = act(act(state, { type: "grab", id: "AS" }).state, { type: "drop", id: "AS", x: 60, y: 60 }).state;
    expect(state.containers.deck).toMatchObject({ members: ["AS", "KS"], faceUp: false });
    state = act(state, { type: "flip", id: "deck" }).state;
    expect(state.containers.deck).toMatchObject({ members: ["KS", "AS"], faceUp: true });
    state = act(state, { type: "lock", id: "deck" }).state;
    expect(act(state, { type: "flip", id: "deck" }).reason).toMatch(/locked/);
  });

  it("rests on a card, but won't move onto a pawn", () => {
    const grabbed = act(initialState(manifest), { type: "grab", id: "deck" }).state;
    expect(act(grabbed, { type: "drop", id: "deck", x: 12, y: 21 }).state.containers.deck).toMatchObject({ x: 12, z: 0.03 });
    expect(act(grabbed, { type: "drop", id: "deck", x: 80, y: 43 })).toMatchObject({ ok: false, blocked: true });
  });

  it("shuffles to the order it's given, if that's the same cards", () => {
    const state = act(held("AS"), { type: "drop", id: "AS", x: 60, y: 60 }).state;
    expect(act(state, { type: "shuffle", id: "deck", order: ["KS", "AS"] }).state.containers.deck.members)
      .toEqual(["KS", "AS"]);
    expect(act(state, { type: "shuffle", id: "deck", order: ["KS", "AH"] }).ok).toBe(false);
  });

  it("makes a deck from a card", () => {
    const result = act(initialState(manifest), { type: "makeDeck", id: "AH", deckId: "deck-1" });
    expect(result.state.containers["deck-1"]).toMatchObject({
      x: 30, y: 20, rotation: 90, faceUp: false, members: ["AH"],
      spec: { kind: "deck", card: "AH" },
    });
    expect(findObject(manifest, result.state, "deck-1").def).toMatchObject({ size: [6.3, 8.8], accepts: [{ type: "card" }] });
    expect(result.state.pieces.AH).toMatchObject({ containerId: "deck-1", x: null });
    expect(act(result.state, { type: "draw", id: "deck-1" }).state.pieces.AH).toMatchObject({ x: 30, y: 20, rotation: 90 });
    expect(act(initialState(manifest), { type: "makeDeck", id: "AS", deckId: "deck" }).ok).toBe(false);
  });
});

describe("resting on things", () => {
  const move = (state, id, x, y) => act(act(state, { type: "grab", id }).state, { type: "drop", id, x, y });
  // The coin on AS, which sits at (10, 20).
  const coinOnCard = () => move(initialState(manifest), "coin", 11, 22).state;

  it("carries what rests on a piece when it moves", () => {
    const state = move(coinOnCard(), "AS", 40, 70).state;
    expect(state.pieces.AS).toMatchObject({ x: 40, y: 70 });
    expect(state.pieces.coin).toMatchObject({ x: 41, y: 72, z: 0.03 });
  });

  it("carries what rests on it up onto whatever it lands on", () => {
    // Half over the deck, which reaches left to x 56.85, with its middle off it.
    const state = move(coinOnCard(), "AS", 55, 60).state;
    expect(state.pieces.AS.z).toBeCloseTo(0.8);
    expect(state.pieces.coin).toMatchObject({ x: 56, y: 62 });
    expect(state.pieces.coin.z).toBeCloseTo(0.83);
  });

  it("swings what rests on a piece around with it when it turns", () => {
    const state = act(coinOnCard(), { type: "rotate", id: "AS", degrees: 90 }).state;
    // One right and two away from the middle, turned a quarter clockwise:
    // two right and one toward you.
    expect(state.pieces.coin.x).toBeCloseTo(12);
    expect(state.pieces.coin.y).toBeCloseTo(19);
    expect(state.pieces.coin.rotation).toBe(90);
  });

  it("keeps what a held piece carries up while it's held", () => {
    let state = act(coinOnCard(), { type: "grab", id: "AS" }).state;
    expect(state.pieces.AS.carrying).toEqual(["coin"]);
    state = act(state, { type: "flip", id: "AH", playerId: "p2" }).state;
    expect(state.pieces.coin.z).toBeCloseTo(0.03);
    state = act(state, { type: "drop", id: "AS", x: 40, y: 70 }).state;
    expect(state.pieces.coin).toMatchObject({ x: 41, y: 72 });
    expect(state.pieces.AS.carrying).toBeNull();
  });

  it("carries nothing along with a card drawn from under it", () => {
    let state = move(initialState(manifest), "coin", 60, 60).state;
    state = act(state, { type: "draw", id: "deck" }).state;
    state = act(state, { type: "drop", id: "KS", x: 30, y: 70 }).state;
    expect(state.pieces.KS).toMatchObject({ x: 30, y: 70 });
    expect(state.pieces.coin).toMatchObject({ x: 60, y: 60, z: 0 });
  });

  it("leaves locked things behind, and lets them down", () => {
    let state = act(coinOnCard(), { type: "lock", id: "coin" }).state;
    state = move(state, "AS", 40, 70).state;
    expect(state.pieces.coin).toMatchObject({ x: 11, y: 22, z: 0 });
  });

  it("refuses a move that would carry something onto what can't hold it", () => {
    // AS at (78, 30) would reach the pawn at (80, 40), but the coin, two
    // further away, would land on it.
    const result = move(coinOnCard(), "AS", 78, 30);
    expect(result.ok).toBe(true);
    const blocked = move(coinOnCard(), "AS", 79, 36);
    expect(blocked).toMatchObject({ ok: false, blocked: true });
  });

  it("drops what rested on a piece when the piece goes into a container", () => {
    const state = move(coinOnCard(), "AS", 60, 60).state;
    expect(state.containers.deck.members).toEqual(["AS", "KS"]);
    expect(state.pieces.coin).toMatchObject({ x: 11, y: 22, z: 0 });
  });

  it("lowers what rests on a deck as it's drawn down", () => {
    let state = move(initialState(manifest), "coin", 60, 60).state;
    expect(state.pieces.coin.z).toBeCloseTo(0.8);
    state = act(state, { type: "draw", id: "deck" }).state;
    expect(state.pieces.coin.z).toBe(0);
  });

  it("raises what rests on a deck as it grows", () => {
    let state = move(initialState(manifest), "coin", 59, 63).state;
    const before = state.pieces.coin.z;
    state = move(state, "AS", 60, 59).state;
    expect(state.containers.deck.members).toHaveLength(2);
    expect(state.pieces.coin.z).toBeGreaterThan(before);
  });

  it("starts pieces the manifest lays over others resting on them", () => {
    const stacked = normalizeManifest({
      formatVersion: 1, id: "s", name: "S", table: { size: [50, 50] },
      layers: [{ id: "pieces", thickness: 0.03 }],
      pieces: [
        { id: "card", kind: "card", size: [6, 9], face: "c.svg", position: [10, 10] },
        { id: "token", kind: "token", size: [2], face: "t.svg", position: [10, 11] },
        { id: "loose", kind: "token", size: [2], face: "t.svg", position: [30, 30] },
      ],
    }, "https://example.com/manifest.json");
    const state = initialState(stacked);
    expect(state.pieces.token.z).toBeCloseTo(0.03);
    expect(state.pieces.loose.z).toBeUndefined();
    expect(state.pieces.card.z).toBeUndefined();
  });
});
