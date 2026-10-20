import { describe, expect, it } from "vitest";
import { applyAction, initialState } from "../state/actions";
import { normalizeManifest } from "../manifest/manifest";
import { landing } from "../state/footprint";
import { findObject, objectHeight } from "../state/objects";
import { visibleSide } from "../state/visibility";
import { createTableStore } from "../state/store";
import { PieceInteraction } from "../table/interaction";

const BASE = "https://example.com/m.json";
const raw = (overrides = {}) => ({
  formatVersion: 1,
  id: "test",
  name: "Test",
  table: { size: [90, 60] },
  layers: [{ id: "board", thickness: 0.4 }, { id: "pieces", thickness: 0.03 }],
  pieceTypes: {
    gold: { kind: "chip", size: [2], face: "gold.svg" },
    silver: { kind: "chip", size: [2], face: "silver.svg" },
  },
  pieces: [
    { id: "g1", type: "gold", position: [10, 10] },
    { id: "g2", type: "gold", position: [20, 10] },
    { id: "s1", type: "silver", position: [30, 10] },
    { id: "plain-a", kind: "token", size: [2], face: "t.svg", position: [40, 10] },
    { id: "plain-b", kind: "token", size: [2], face: "t.svg", position: [44, 10] },
    ...[3, 4, 5, 6, 7, 8].map((n) => ({ id: `g${n}`, type: "gold" })),
    { id: "card", kind: "card", size: [6, 9], face: "c.svg", position: [60, 30] },
  ],
  containers: [{ id: "pile", kind: "stack", position: [10, 40], members: ["g3", "g4", "g5", "g6", "g7", "g8"] }],
  ...overrides,
});
const manifest = normalizeManifest(raw(), BASE);
const act = (state, action) => applyAction(manifest, state, { playerId: "me", ...action });
const move = (state, id, x, y) => act(act(state, { type: "grab", id }).state, { type: "drop", id, x, y });

describe("stacks", () => {
  it("forms when a piece drops on one just like it", () => {
    let state = initialState(manifest);
    expect(landing(manifest, act(state, { type: "grab", id: "g1" }).state, "g1", 20, 10, 0, "me")).toEqual({ onto: "g2" });
    state = move(state, "g1", 20, 10).state;
    const [id] = Object.keys(state.containers).filter((key) => key.startsWith("#stack-"));
    expect(state.containers[id]).toMatchObject({ x: 20, y: 10, members: ["g1", "g2"], spec: { kind: "stack" } });
    expect(findObject(manifest, state, id).def).toMatchObject({ kind: "stack", shape: "circle", size: [2, 2] });
    expect(state.pieces.g2).toMatchObject({ containerId: id, x: null });
  });

  it("matches untyped pieces by their look, and won't mix different ones", () => {
    let state = initialState(manifest);
    expect(landing(manifest, act(state, { type: "grab", id: "plain-a" }).state, "plain-a", 44, 10, 0, "me")).toEqual({ onto: "plain-b" });
    state = act(state, { type: "grab", id: "g1" }).state;
    expect(landing(manifest, state, "g1", 30, 10, 0, "me").z).toBeGreaterThan(0);
  });

  it("takes more of the same on top, and holds anything else up", () => {
    let state = move(initialState(manifest), "g1", 10, 40).state;
    expect(state.containers.pile.members).toEqual(["g1", "g3", "g4", "g5", "g6", "g7", "g8"]);
    state = act(state, { type: "grab", id: "s1" }).state;
    expect(landing(manifest, state, "s1", 10, 40, 0, "me").z).toBeCloseTo(objectHeight(findObject(manifest, state, "pile")));
  });

  it("grows a piece taller per piece, up to five", () => {
    const height = (count) => objectHeight({ kind: "container", def: findObject(manifest, initialState(manifest), "pile").def, state: { members: Array(count) } });
    expect(height(2)).toBeCloseTo(0.4);
    expect(height(5)).toBeCloseTo(1);
    expect(height(6)).toBeCloseTo(1);
  });

  it("hands out its top piece, and stops being a stack at one", () => {
    let state = initialState(manifest);
    for (const [i, id] of ["g3", "g4", "g5", "g6", "g7"].entries()) {
      state = act(state, { type: "draw", id: "pile" }).state;
      expect(state.pieces[id]).toMatchObject({ heldBy: "me", x: 10, y: 40 });
      state = act(state, { type: "drop", id, x: 50 + i * 3, y: 50 }).state;
    }
    expect(state.containers.pile).toBeUndefined();
    expect(state.pieces.g8).toMatchObject({ containerId: null, x: 10, y: 40 });
  });

  it("magnifies to its top piece", () => {
    expect(visibleSide(manifest, initialState(manifest), "pile").image.url).toBe("https://example.com/gold.svg");
  });

  it.each([
    ["one member", ["x1"], /two/],
    ["mixed members", ["x1", "x2"], /alike/],
    ["cards", ["c1", "c2"], /tiles, chips, and tokens/],
  ])("rejects a manifest stack with %s", (_name, members, message) => {
    const extras = [
      { id: "x1", type: "gold" },
      { id: "x2", type: "silver" },
      { id: "c1", kind: "card", size: [6, 9], face: "c.svg" },
      { id: "c2", kind: "card", size: [6, 9], face: "c.svg" },
    ].filter((piece) => members.includes(piece.id));
    const containers = [...raw().containers, { id: "bad", kind: "stack", position: [0, 0], members }];
    expect(() => normalizeManifest(raw({ pieces: [...raw().pieces, ...extras], containers }), BASE)).toThrow(message);
  });
});

describe("stacking up a selection", () => {
  const cards = normalizeManifest(raw({
    pieceTypes: {
      gold: { kind: "chip", size: [2], face: "gold.svg" },
      silver: { kind: "chip", size: [2], face: "silver.svg" },
      spade: { kind: "card", size: [6, 9], face: "s.svg", back: "b.svg" },
    },
    pieces: [
      { id: "g1", type: "gold", position: [10, 10] },
      { id: "g2", type: "gold", position: [20, 10] },
      { id: "g3", type: "gold", position: [30, 10] },
      { id: "s1", type: "silver", position: [40, 10] },
      { id: "c1", type: "spade", position: [10, 40] },
      { id: "c2", type: "spade", position: [30, 40], faceUp: false },
    ],
    containers: [],
  }), BASE);
  const act = (state, action) => applyAction(cards, state, { playerId: "me", ...action });

  it("piles alike chips into a stack where the first lies, the last on top", () => {
    const state = act(initialState(cards), { type: "stackUp", id: "g1", others: ["g2", "g3"] }).state;
    const [stackId] = Object.keys(state.containers);
    expect(state.containers[stackId]).toMatchObject({ x: 10, y: 10, members: ["g3", "g2", "g1"], spec: { kind: "stack" } });
    expect(state.pieces.g2).toMatchObject({ containerId: stackId, x: null, heldBy: null });
  });

  it("piles cards of a type into a deck facing the way the first one does", () => {
    const state = act(initialState(cards), { type: "stackUp", id: "c1", others: ["c2"] }).state;
    const deck = Object.values(state.containers)[0];
    expect(deck).toMatchObject({ x: 10, y: 40, faceUp: true, members: ["c2", "c1"], spec: { kind: "deck" } });
    expect(state.pieces.c2.faceUp).toBe(true);
  });

  it("refuses pieces that don't pile together, or a pile of one", () => {
    expect(act(initialState(cards), { type: "stackUp", id: "g1", others: ["s1"] }).reason).toMatch(/don't stack/);
    expect(act(initialState(cards), { type: "stackUp", id: "g1", others: [] }).ok).toBe(false);
    expect(act(initialState(cards), { type: "stackUp", id: "g1", others: ["g1"] }).ok).toBe(false);
  });

  it("stacks up what you hold from the interaction, when it all piles together", () => {
    const store = createTableStore(cards);
    const interaction = new PieceInteraction({
      store, manifest: cards, playerId: "me", pick: () => null, tablePoint: () => null, clampToTable: (p) => p,
      setCameraEnabled: () => {}, setCursor: () => {},
    });
    interaction.toggleSelect("g1");
    expect(interaction.describe("g1").canStackUp).toBe(false);
    interaction.toggleSelect("g2");
    expect(interaction.describe("g1").canStackUp).toBe(true);
    interaction.toggleSelect("s1");
    expect(interaction.describe("g1").canStackUp).toBe(false);
    interaction.toggleSelect("s1");
    interaction.stackUp();
    expect(store.getState().pieces.g1.containerId).toMatch(/^#stack-/);
    expect(interaction.selectedIds()).toEqual([]);
  });
});
