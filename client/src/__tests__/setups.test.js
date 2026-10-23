import { describe, expect, it } from "vitest";
import { applyAction, initialState } from "../state/actions";
import { normalizeManifest } from "../manifest/manifest";

const raw = {
  formatVersion: 1,
  id: "test",
  name: "Test",
  table: { size: [100, 100] },
  layers: [{ id: "board", thickness: 0.3 }, { id: "pieces", thickness: 0.03 }],
  hands: true,
  seats: [{ id: "south", name: "South", side: "south" }],
  pieceTypes: {
    card: { kind: "card", size: [6, 9], back: "back.svg" },
    gem: { kind: "token", size: [1.5], face: "gem.svg" },
  },
  pieces: [
    { id: "map", kind: "board", size: [30, 20], layer: "board", position: [50, 80], fixed: true,
      states: [{ name: "North", face: "n.svg" }, { name: "South", face: "s.svg" }] },
    { id: "n1", type: "card", face: "n1.svg", categories: ["north"] },
    { id: "n2", type: "card", face: "n2.svg", categories: ["north"] },
    { id: "s1", type: "card", face: "s1.svg", categories: ["south"] },
    { id: "s2", type: "card", face: "s2.svg", categories: ["south"] },
    { id: "q1", type: "card", face: "q1.svg" },
    { id: "q2", type: "card", face: "q2.svg" },
    { id: "q3", type: "card", face: "q3.svg" },
    { id: "boss", type: "gem", categories: ["north"] },
  ],
  containers: [
    { id: "north-box", kind: "bag", position: [10, 95], size: [6, 6], members: ["n1", "n2", "boss"] },
    { id: "south-box", kind: "bag", position: [20, 95], size: [6, 6], members: ["s1", "s2"] },
    { id: "region-deck", kind: "deck", position: [80, 50], size: [6, 9], members: [] },
    { id: "quests", kind: "deck", position: [90, 50], size: [6, 9], members: ["q1", "q2", "q3"] },
    { id: "enemies", kind: "bag", position: [80, 20], size: [6, 6], members: [] },
  ],
  setups: [
    { id: "north", name: "The North", steps: [
      { reset: { category: "south" } },
      { reset: { in: "region-deck" } },
      { reset: { in: "enemies" } },
      { state: "map", to: "North" },
      { move: ["n1", "n2"], into: "region-deck" },
      { shuffle: "region-deck" },
      { move: "boss", into: "enemies" },
      { deal: "quests", to: [[40, 40], [50, 40]] },
    ] },
    { id: "south", steps: [
      { reset: { category: "north" } },
      { reset: ["q1", "q2", "q3"] },
      { state: "map", to: "South" },
      { move: { category: "south" }, into: "region-deck" },
      { move: "quests", to: [10, 10], faceUp: true },
    ] },
  ],
};
const manifest = normalizeManifest(raw, "https://example.com/manifest.json");
const run = (state, setupId, seed = "s") => applyAction(manifest, state, { type: "setup", playerId: "p1", setupId, seed });

describe("setups", () => {
  it("lays out a region in one change", () => {
    const { ok, state } = run(initialState(manifest), "north");
    expect(ok).toBe(true);
    expect(state.sequence).toBe(1);
    expect(state.pieces.map.stateIndex).toBe(0);
    expect([...state.containers["region-deck"].members].sort()).toEqual(["n1", "n2"]);
    expect(state.containers.enemies.members).toEqual(["boss"]);
    expect(state.containers.quests.members).toEqual(["q3"]);
    expect(state.pieces.q1).toMatchObject({ x: 40, y: 40, containerId: null, faceUp: true });
    expect(state.pieces.q2).toMatchObject({ x: 50, y: 40 });
  });

  it("shuffles the same way for the same seed", () => {
    const order = (seed) => run(initialState(manifest), "north", seed).state.containers["region-deck"].members.join();
    expect(order("a")).toBe(order("a"));
    const orders = new Set(["a", "b", "c", "d", "e", "f"].map(order));
    expect(orders.size).toBe(2);
  });

  it("clears away the region before", () => {
    const north = run(initialState(manifest), "north").state;
    const { state } = run(north, "south");
    expect(state.pieces.map.stateIndex).toBe(1);
    expect(state.containers["north-box"].members).toEqual(["n1", "n2", "boss"]);
    expect(state.containers.enemies.members).toEqual([]);
    expect(state.containers["region-deck"].members).toEqual(["s1", "s2"]);
    expect(state.containers.quests.members).toEqual(["q1", "q2", "q3"]);
    expect(state.containers.quests).toMatchObject({ x: 10, y: 10, faceUp: true });
    expect(state.pieces.q1.faceUp).toBe(true);
  });

  it("leaves what's in a hand alone", () => {
    let state = applyAction(manifest, initialState(manifest), { type: "join", playerId: "p1", seatId: "south" }).state;
    state = run(state, "north").state;
    state = applyAction(manifest, state, { type: "grab", id: "q1", playerId: "p1" }).state;
    state = applyAction(manifest, state, { type: "drop", id: "q1", playerId: "p1", into: "hand-south", index: 0 }).state;
    state = run(state, "south").state;
    expect(state.pieces.q1.containerId).toBe("hand-south");
    expect(state.containers.quests.members).toEqual(["q2", "q3"]);
  });

  it("refuses an unknown setup or a missing seed", () => {
    expect(run(initialState(manifest), "west").ok).toBe(false);
    expect(applyAction(manifest, initialState(manifest), { type: "setup", playerId: "p1", setupId: "north" }).ok).toBe(false);
  });

  it("checks setups when the manifest loads", () => {
    const bad = (steps) => () => normalizeManifest({ ...raw, setups: [{ id: "x", steps }] }, "https://example.com/m.json");
    expect(bad([{ reset: "nope" }])).toThrow('unknown piece or container "nope"');
    expect(bad([{ reset: { category: "east" } }])).toThrow('unknown category "east"');
    expect(bad([{ move: "n1" }])).toThrow("either to or into");
    expect(bad([{ shuffle: "n1" }])).toThrow('unknown container "n1"');
    expect(bad([{ state: "map", to: "West" }])).toThrow('no state of "map" called "West"');
    expect(bad([{ reset: "n1", shuffle: "quests" }])).toThrow("exactly one of");
    expect(normalizeManifest({ ...raw, setups: undefined }, "https://example.com/m.json").setups).toEqual([]);
  });
});
