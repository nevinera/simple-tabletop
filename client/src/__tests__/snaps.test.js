import { describe, expect, it } from "vitest";
import { applyAction, initialState } from "../state/actions";
import { normalizeManifest } from "../manifest/manifest";
import { snapSpot } from "../state/snaps";

const raw = (overrides = {}) => ({
  formatVersion: 1, id: "t", name: "T", table: { size: [60, 60] },
  layers: [{ id: "pieces", thickness: 0.03 }],
  snaps: [
    { radius: 2, grid: { origin: [10, 10], step: [5, 5], count: [3, 2] } },
    { radius: 4, accepts: [{ kind: "card" }], points: [[40, 40]] },
  ],
  pieces: [
    { id: "pawn", kind: "pawn", size: [2], position: [50, 10] },
    { id: "card", kind: "card", size: [6, 9], face: "c.svg", position: [50, 30] },
  ],
  ...overrides,
});
const manifest = normalizeManifest(raw(), "https://example.com/m.json");
const def = (id) => manifest.pieces.find((piece) => piece.id === id);

describe("snaps", () => {
  it("lays out a grid of points", () => {
    expect(manifest.snaps[0].points).toEqual([[10, 10], [15, 10], [20, 10], [10, 15], [15, 15], [20, 15]]);
  });

  it("snaps to the nearest point within its radius, among groups that take the piece", () => {
    expect(snapSpot(manifest, def("pawn"), 14, 11)).toEqual([15, 10]);
    expect(snapSpot(manifest, def("pawn"), 17.6, 12.5)).toBeNull();
    expect(snapSpot(manifest, def("pawn"), 39, 39)).toBeNull();
    expect(snapSpot(manifest, def("card"), 37, 39)).toEqual([40, 40]);
  });

  it("lands a dropped piece on its snap point", () => {
    let state = applyAction(manifest, initialState(manifest), { type: "grab", id: "pawn", playerId: "me" }).state;
    state = applyAction(manifest, state, { type: "drop", id: "pawn", x: 19.2, y: 14.1, playerId: "me" }).state;
    expect(state.pieces.pawn).toMatchObject({ x: 20, y: 15 });
  });

  it("refuses groups without a radius, or with neither points nor a grid", () => {
    const load = (snaps) => () => normalizeManifest(raw({ snaps }), "https://example.com/m.json");
    expect(load([{ points: [[1, 1]] }])).toThrow(/radius/);
    expect(load([{ radius: 1 }])).toThrow(/points or a grid/);
    expect(load([{ radius: 1, grid: { origin: [0, 0], step: [1, 1], count: [0, 2] } }])).toThrow(/grid/);
  });
});
