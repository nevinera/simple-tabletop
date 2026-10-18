import { describe, expect, it } from "vitest";
import { applyAction, initialState } from "../state/actions";
import { normalizeManifest } from "../manifest/manifest";
import { deckHeight, findObject, looseObjects } from "../state/objects";
import { activeSeats, handPlacement, openSeats, seatName } from "../state/seats";
import { magnifiable, visibleSide } from "../state/visibility";
import { reachBounds } from "../state/footprint";

const raw = (overrides = {}) => ({
  formatVersion: 1,
  id: "test",
  name: "Test",
  table: { size: [90, 60] },
  layers: [{ id: "pieces", thickness: 0.03 }],
  hands: true,
  pieceTypes: { card: { shape: "rect", size: [6, 9], back: "back.svg" } },
  pieces: [
    { id: "AS", type: "card", face: "AS.svg", position: [20, 20] },
    { id: "AH", type: "card", face: "AH.svg", position: [40, 20] },
    { id: "KS", type: "card", face: "KS.svg" },
  ],
  containers: [{ id: "deck", kind: "deck", position: [60, 30], size: [6, 9], members: ["KS"] }],
  ...overrides,
});
const manifest = normalizeManifest(raw(), "https://example.com/m.json");

function run(state, ...actions) {
  return actions.reduce((current, action) => {
    const result = applyAction(manifest, current, action);
    if (!result.ok) throw new Error(`${action.type}: ${result.reason}`);
    return result.state;
  }, state);
}
const join = (playerId, seatId) => ({ type: "join", playerId, seatId });
const seated = () => run(initialState(manifest), join("me", "south-left"), join("you", "north-left"));
const hand = (state, seatId) => state.containers[`hand-${seatId}`].members;

describe("seats", () => {
  it("opens one seat per side, then splits when a fifth player joins", () => {
    let state = initialState(manifest);
    expect(openSeats(manifest, state).map((seat) => seatName(manifest, state, seat)))
      .toEqual(["South", "North", "East", "West"]);
    state = run(state, ...["south-left", "north-left", "east-left", "west-left"].map((seat, i) => join(`p${i}`, seat)));
    expect(openSeats(manifest, state).map((seat) => seat.id))
      .toEqual(["south-right", "north-right", "east-right", "west-right"]);

    state = run(state, join("p4", "east-right"));
    expect(state.seating).toBe("eight");
    expect(activeSeats(manifest, state)).toHaveLength(8);
    expect(seatName(manifest, state, manifest.seats[0])).toBe("South left");

    // It stays split after players leave.
    state = run(state, { type: "leave", playerId: "p4" }, { type: "leave", playerId: "p3" });
    expect(state.seating).toBe("eight");
  });

  it("won't seat two players in one seat, and caps seats at maxSeats", () => {
    const state = run(initialState(manifest), join("me", "south-left"));
    expect(applyAction(manifest, state, join("you", "south-left")).ok).toBe(false);
    const three = normalizeManifest(raw({ maxSeats: 3 }), "https://example.com/m.json");
    expect(openSeats(three, initialState(three)).map((seat) => seat.id)).toEqual(["south-left", "north-left", "east-left"]);
  });

  it("puts hand trays just off each seat's edge, facing its player, half-width when split", () => {
    const state = initialState(manifest);
    const south = handPlacement(manifest, state, manifest.seats[0]);
    expect(south).toMatchObject({ rotation: 0, size: [60, expect.closeTo(12.6)] });
    expect(south.position[0]).toBe(45);
    expect(south.position[1]).toBeLessThan(0);
    const east = handPlacement(manifest, state, manifest.seats[2]);
    expect(east).toMatchObject({ rotation: 270 });
    expect(east.position[0]).toBeGreaterThan(90);

    const split = { ...state, seating: "eight" };
    const southLeft = handPlacement(manifest, split, manifest.seats[0]);
    expect(southLeft.position[0]).toBeCloseTo(22.5);
    expect(southLeft.size[0]).toBeCloseTo(36);
  });
});

describe("hands", () => {
  it("takes a card dropped on its tray, face-up, in order", () => {
    let state = seated();
    const tray = findObject(manifest, state, "hand-south-left").def;
    const [x, y] = tray.position;
    state = run(state,
      { type: "grab", id: "AS", playerId: "me" }, { type: "drop", id: "AS", playerId: "me", x, y },
      { type: "grab", id: "AH", playerId: "me" }, { type: "drop", id: "AH", playerId: "me", x: x - 10, y });
    expect(hand(state, "south-left")).toEqual(["AH", "AS"]);
    expect(state.pieces.AH).toMatchObject({ containerId: "hand-south-left", faceUp: true, x: null });
  });

  it("lets its player reorder and play cards, but nobody else", () => {
    let state = run(seated(), { type: "draw", id: "deck", playerId: "me", toHand: true });
    state = run(state, { type: "grab", id: "AS", playerId: "me" }, { type: "drop", id: "AS", playerId: "me", into: "hand-south-left", index: 0 });
    expect(hand(state, "south-left")).toEqual(["AS", "KS"]);
    expect(applyAction(manifest, state, { type: "grab", id: "KS", playerId: "you" }).ok).toBe(false);

    state = run(state, { type: "grab", id: "KS", playerId: "me" }, { type: "drop", id: "KS", playerId: "me", x: 45, y: 30 });
    expect(hand(state, "south-left")).toEqual(["AS"]);
    expect(state.pieces.KS).toMatchObject({ containerId: null, x: 45, y: 30, rotation: 0, faceUp: true });
  });

  it("passes cards into someone else's hand, unless the module says not to", () => {
    const tray = (state) => findObject(manifest, state, "hand-north-left").def.position;
    const pass = (m, state) => {
      const [x, y] = findObject(m, state, "hand-north-left").def.position;
      const grabbed = applyAction(m, state, { type: "grab", id: "AS", playerId: "me" }).state;
      return applyAction(m, grabbed, { type: "drop", id: "AS", playerId: "me", x, y });
    };
    expect(tray(seated())[1]).toBeGreaterThan(60);
    expect(hand(pass(manifest, seated()).state, "north-left")).toEqual(["AS"]);

    const closed = normalizeManifest(raw({ hands: { passing: false } }), "https://example.com/m.json");
    const state = [join("me", "south-left"), join("you", "north-left")]
      .reduce((s, action) => applyAction(closed, s, action).state, initialState(closed));
    expect(pass(closed, state)).toMatchObject({ ok: false, blocked: true });
  });

  it("won't drop a card off the table except into a hand", () => {
    const state = run(seated(), { type: "grab", id: "AS", playerId: "me" });
    expect(applyAction(manifest, state, { type: "drop", id: "AS", playerId: "me", x: 45, y: -40 }))
      .toMatchObject({ ok: false, blocked: true });
  });

  it("shows your own hand's faces and everyone else's backs", () => {
    const state = run(seated(), { type: "draw", id: "deck", playerId: "me", toHand: true });
    expect(visibleSide(manifest, state, "KS", "south-left").image.url).toMatch(/KS\.svg$/);
    expect(visibleSide(manifest, state, "KS", "north-left").image.url).toMatch(/back\.svg$/);
    expect(visibleSide(manifest, state, "AS", "north-left").image.url).toMatch(/AS\.svg$/);
  });

  it("only has trays at occupied seats, and lets drags reach them", () => {
    const state = run(initialState(manifest), join("me", "south-left"));
    const trays = looseObjects(manifest, state).filter((object) => object.def.kind === "hand");
    expect(trays.map((tray) => tray.id)).toEqual(["hand-south-left"]);
    const bounds = reachBounds(manifest, state);
    expect(bounds.minY).toBeLessThan(-10);
    expect(bounds).toMatchObject({ minX: 0, maxX: 90, maxY: 60 });
  });

  it("magnifies cards, not boards", () => {
    const boards = normalizeManifest(raw({
      layers: [{ id: "board", thickness: 0.3 }, { id: "pieces", thickness: 0.03 }],
      pieces: [...raw().pieces, { id: "mat", shape: "rect", size: [40, 40], layer: "board", face: "mat.svg", position: [45, 30] }],
    }), "https://example.com/m.json");
    const state = initialState(boards);
    expect(magnifiable(boards, state, "AS")).toBe(true);
    expect(magnifiable(boards, state, "mat")).toBe(false);
  });

  it("makes decks at least twice as tall as the board layer, and at most six times that", () => {
    const boards = normalizeManifest(raw({
      layers: [{ id: "board", thickness: 0.4 }, { id: "pieces", thickness: 0.03 }],
    }), "https://example.com/m.json");
    const deck = findObject(boards, initialState(boards), "deck").def;
    expect(deckHeight(deck, 0)).toBeCloseTo(0.8);
    expect(deckHeight(deck, 1)).toBeCloseTo(0.8);
    expect(deckHeight(deck, 52)).toBeGreaterThan(3);
    expect(deckHeight(deck, 1000)).toBeCloseTo(4.8);
  });
});
