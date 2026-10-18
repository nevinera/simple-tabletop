import { describe, expect, it } from "vitest";
import { applyAction, initialState } from "../state/actions";
import { normalizeManifest } from "../manifest/manifest";

const manifest = normalizeManifest({
  formatVersion: 1,
  id: "test",
  name: "Test",
  table: { size: [90, 90] },
  layers: [{ id: "board", thickness: 0.3 }, { id: "pieces", thickness: 0.03 }],
  seats: [{ id: "south", name: "South" }],
  pieceTypes: { card: { shape: "rect", size: [6.3, 8.8], back: "back.svg" } },
  pieces: [
    { id: "mat", shape: "circle", size: [40], layer: "board", face: "mat.svg", position: [45, 45], fixed: true },
    { id: "AS", type: "card", face: "AS.svg", position: [10, 20] },
    { id: "AH", type: "card", face: "AH.svg", position: [30, 20], rotation: 90, faceUp: false },
    { id: "KS", type: "card", face: "KS.svg" },
  ],
  containers: [{ id: "deck", kind: "deck", position: [60, 60], members: ["KS"] }],
}, "https://example.com/manifest.json");

const act = (state, action) => applyAction(manifest, state, { playerId: "p1", ...action });

function held(pieceId = "AS", playerId = "p1") {
  return applyAction(manifest, initialState(manifest), { type: "grab", pieceId, playerId }).state;
}

describe("initialState", () => {
  it("places pieces from the manifest, stacked in manifest order per layer", () => {
    const state = initialState(manifest);
    expect(state.sequence).toBe(0);
    expect(state.pieces.AS).toEqual({
      x: 10, y: 20, rotation: 0, faceUp: true, stackOrder: 0, containerId: null, heldBy: null, drag: null,
    });
    expect(state.pieces.AH).toMatchObject({ rotation: 90, faceUp: false, stackOrder: 1 });
    expect(state.pieces.mat.stackOrder).toBe(0);
  });

  it("puts container members in their container, without a position", () => {
    const state = initialState(manifest);
    expect(state.pieces.KS).toMatchObject({ x: null, y: null, containerId: "deck" });
    expect(state.containers.deck).toEqual({ x: 60, y: 60, rotation: 0, members: ["KS"], heldBy: null });
  });
});

describe("applyAction", () => {
  it("grabs a free piece and saves the change", () => {
    const result = act(initialState(manifest), { type: "grab", pieceId: "AS" });
    expect(result.ok).toBe(true);
    expect(result.state.pieces.AS.heldBy).toBe("p1");
    expect(result.state.sequence).toBe(1);
  });

  it("won't grab a piece someone else holds", () => {
    const result = act(held("AS", "p2"), { type: "grab", pieceId: "AS" });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/Someone else/) });
  });

  it("drags without saving", () => {
    const state = held();
    const result = act(state, { type: "drag", pieceId: "AS", x: 50, y: 50 });
    expect(result.state.pieces.AS.drag).toEqual({ x: 50, y: 50 });
    expect(result.state.pieces.AS.x).toBe(10);
    expect(result.state.sequence).toBe(state.sequence);
  });

  it("drops on top of its layer and lets go", () => {
    const dragged = act(held(), { type: "drag", pieceId: "AS", x: 50, y: 50 }).state;
    const result = act(dragged, { type: "drop", pieceId: "AS", x: 51, y: 52 });
    expect(result.state.pieces.AS).toMatchObject({ x: 51, y: 52, stackOrder: 2, heldBy: null, drag: null });
    expect(result.state.sequence).toBe(dragged.sequence + 1);
  });

  it("releases without moving", () => {
    const dragged = act(held(), { type: "drag", pieceId: "AS", x: 50, y: 50 }).state;
    const result = act(dragged, { type: "release", pieceId: "AS" });
    expect(result.state.pieces.AS).toMatchObject({ x: 10, y: 20, heldBy: null, drag: null });
  });

  it.each(["drag", "drop", "release"])("won't %s a piece you don't hold", (type) => {
    expect(act(initialState(manifest), { type, pieceId: "AS", x: 0, y: 0 }).ok).toBe(false);
    expect(act(held("AS", "p2"), { type, pieceId: "AS", x: 0, y: 0 }).ok).toBe(false);
  });

  it("flips and rotates a piece nobody holds", () => {
    const flipped = act(initialState(manifest), { type: "flip", pieceId: "AS" }).state;
    expect(flipped.pieces.AS.faceUp).toBe(false);
    const rotated = act(flipped, { type: "rotate", pieceId: "AH", degrees: -135 }).state;
    expect(rotated.pieces.AH.rotation).toBe(315);
  });

  it("won't flip or rotate a piece someone else holds", () => {
    expect(act(held("AS", "p2"), { type: "flip", pieceId: "AS" }).ok).toBe(false);
    expect(act(held("AS", "p2"), { type: "rotate", pieceId: "AS", degrees: 45 }).ok).toBe(false);
  });

  it("refuses fixed pieces, pieces in containers, and unknown pieces or actions", () => {
    const state = initialState(manifest);
    expect(act(state, { type: "grab", pieceId: "mat" }).reason).toMatch(/fixed/);
    expect(act(state, { type: "flip", pieceId: "KS" }).reason).toMatch(/container/);
    expect(act(state, { type: "grab", pieceId: "nope" }).reason).toMatch(/Unknown piece/);
    expect(act(state, { type: "shuffle", pieceId: "AS" }).reason).toMatch(/Unknown action/);
  });

  it("leaves the old state untouched", () => {
    const state = initialState(manifest);
    act(state, { type: "flip", pieceId: "AS" });
    expect(state.pieces.AS.faceUp).toBe(true);
    expect(state.sequence).toBe(0);
  });
});
