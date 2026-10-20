import { describe, expect, it } from "vitest";
import { applyAction, initialState } from "../state/actions";
import { ManifestError, normalizeManifest } from "../manifest/manifest";
import { pieceDef } from "../state/objects";
import { visibleSide } from "../state/visibility";
import { createTableStore } from "../state/store";
import { PieceInteraction } from "../table/interaction";

const BASE = "https://example.com/m.json";
const raw = (overrides = {}) => ({
  formatVersion: 1,
  id: "test",
  name: "Test",
  table: { size: [90, 60] },
  layers: [{ id: "pieces", thickness: 0.03 }],
  hands: true,
  seats: [{ id: "south", name: "South", side: "south" }],
  pieceTypes: {
    strike: {
      kind: "card",
      size: [6, 9],
      back: "back.svg",
      states: [{ name: "Normal", face: "strike.svg" }, { name: "Upgraded", face: "strike-plus.svg" }],
    },
  },
  pieces: [
    { id: "s1", type: "strike", position: [10, 10] },
    { id: "s2", type: "strike" },
    { id: "s3", type: "strike" },
  ],
  containers: [{ id: "draw", kind: "deck", position: [40, 30], size: [6, 9], faceUp: true, members: ["s2", "s3"] }],
  ...overrides,
});
const manifest = normalizeManifest(raw(), BASE);
const act = (state, action) => applyAction(manifest, state, { playerId: "me", ...action });
const seated = () => act(initialState(manifest), { type: "join", seatId: "south" }).state;

describe("card states", () => {
  it("reads each state's images, falling back on the card's own", () => {
    const def = pieceDef(manifest, "s1");
    expect(def.states.map((state) => state.name)).toEqual(["Normal", "Upgraded"]);
    expect(def.states[1].face.url).toBe("https://example.com/strike-plus.svg");
    expect(def.states[1].back.url).toBe("https://example.com/back.svg");
    expect(def.face.url).toBe("https://example.com/strike.svg");
  });

  it("refuses states that aren't on a card, too few, or unnamed", () => {
    const withStates = (piece) => () => normalizeManifest(raw({ pieces: [piece] }), BASE);
    expect(withStates({ id: "t", kind: "token", size: [2], position: [5, 5], states: [{ name: "a", face: "a.svg" }, { name: "b", face: "b.svg" }] }))
      .toThrow(/isn't a card/);
    expect(withStates({ id: "c", kind: "card", size: [6, 9], position: [5, 5], states: [{ name: "a", face: "a.svg" }] }))
      .toThrow(ManifestError);
    expect(withStates({ id: "c", kind: "card", size: [6, 9], position: [5, 5], states: [{ face: "a.svg" }, { name: "b", face: "b.svg" }] }))
      .toThrow(/needs a name/);
    expect(withStates({ id: "c", kind: "card", size: [6, 9], position: [5, 5], states: [{ name: "a" }, { name: "b", face: "b.svg" }] }))
      .toThrow(/needs a face/);
  });

  it("changes a loose card's state, and shows its new face", () => {
    const state = act(initialState(manifest), { type: "changeState", id: "s1", index: 1 }).state;
    expect(state.pieces.s1.stateIndex).toBe(1);
    expect(visibleSide(manifest, state, "s1", "south").image.url).toBe("https://example.com/strike-plus.svg");
  });

  it("keeps a card's state in a deck, and shows it on top", () => {
    let state = act(initialState(manifest), { type: "changeState", id: "s1", index: 1 }).state;
    state = act(act(state, { type: "grab", id: "s1" }).state, { type: "drop", id: "s1", x: 40, y: 30 }).state;
    expect(state.containers.draw.members[0]).toBe("s1");
    expect(state.pieces.s1.stateIndex).toBe(1);
    expect(visibleSide(manifest, state, "draw", "south").image.url).toBe("https://example.com/strike-plus.svg");
  });

  it("changes a card in your hand, but not one inside a closed deck", () => {
    let state = act(seated(), { type: "draw", id: "draw", toHand: true }).state;
    expect(state.pieces.s2.containerId).toBe("hand-south");
    expect(act(state, { type: "changeState", id: "s2", index: 1 }).state.pieces.s2.stateIndex).toBe(1);
    expect(act(state, { type: "changeState", id: "s3", index: 1 }).ok).toBe(false);
  });

  it("refuses bad indexes, locked cards, and pieces without states", () => {
    const state = initialState(manifest);
    expect(act(state, { type: "changeState", id: "s1", index: 2 }).ok).toBe(false);
    expect(act(state, { type: "changeState", id: "s1" }).ok).toBe(false);
    expect(act(act(state, { type: "lock", id: "s1" }).state, { type: "changeState", id: "s1", index: 1 }).reason).toMatch(/locked/);
    expect(act(state, { type: "changeState", id: "draw", index: 1 }).reason).toMatch(/no states/);
  });

  it("cycles through states from the menu's interaction", () => {
    const store = createTableStore(manifest);
    const interaction = new PieceInteraction({
      store, manifest, playerId: "me",
      pick: () => null, tablePoint: () => null, clampToTable: (p) => p,
      setCameraEnabled: () => {}, setCursor: () => {},
    });
    expect(interaction.describe("s1")).toMatchObject({ states: ["Normal", "Upgraded"], stateIndex: 0 });
    interaction.nextState("s1");
    expect(store.getState().pieces.s1.stateIndex).toBe(1);
    interaction.nextState("s1");
    expect(store.getState().pieces.s1.stateIndex).toBe(0);
    expect(interaction.describe("draw").states).toBeNull();
  });
});
