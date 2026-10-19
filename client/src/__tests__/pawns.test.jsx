import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as THREE from "three";
import { ManifestError, normalizeManifest } from "../manifest/manifest";
import { applyAction, initialState } from "../state/actions";
import { footprint } from "../state/footprint";
import { findObject, objectHeight, pieceDef } from "../state/objects";
import { pawnOutline } from "../state/pawnShapes";
import { visibleSide } from "../state/visibility";
import { buildPawn } from "../table/pawns";
import { PawnIcon } from "../ui/PawnIcon";

const raw = (pieces, containers = []) => ({
  formatVersion: 1, id: "test", name: "Test", table: { size: [90, 90] },
  layers: [{ id: "pieces", thickness: 0.03 }],
  pieces, containers,
});
const load = (pieces, containers) => normalizeManifest(raw(pieces, containers), "https://example.com/m.json");

describe("pawn manifests", () => {
  it("defaults to a classic pawn, 1.6 times as tall as it's wide", () => {
    const manifest = load([{ id: "p", kind: "pawn", size: [2], position: [10, 10] }]);
    expect(pieceDef(manifest, "p")).toMatchObject({ kind: "pawn", shape: "classic", size: [2, 2], height: 3.2, color: "#f4f1ea", face: null });
  });

  it("takes a shape, a color, and a height", () => {
    const manifest = load([
      { id: "m", kind: "pawn", shape: "meeple", color: "#27ae60", size: [2.5], position: [10, 10] },
      { id: "c", kind: "pawn", shape: "cone", size: [2, 4], position: [20, 10] },
    ]);
    expect(pieceDef(manifest, "m")).toMatchObject({ shape: "meeple", color: "#27ae60", size: [2.5, 1], height: 2.5 });
    expect(pieceDef(manifest, "c")).toMatchObject({ shape: "cone", height: 4 });
  });

  it("refuses an unknown shape or a color that isn't hex", () => {
    expect(() => load([{ id: "p", kind: "pawn", shape: "rook", size: [2], position: [1, 1] }])).toThrow(ManifestError);
    expect(() => load([{ id: "p", kind: "pawn", color: "red", size: [2], position: [1, 1] }])).toThrow(/hex color/);
  });
});

describe("pawns on the table", () => {
  const manifest = load(
    [
      { id: "p", kind: "pawn", size: [2], position: [10, 10] },
      { id: "m", kind: "pawn", shape: "meeple", size: [2], position: [30, 10] },
      { id: "q", kind: "pawn", color: "#c0392b", size: [2] },
    ],
    [{ id: "bag", kind: "bag", position: [60, 60], size: [8, 8], members: ["q"] }]
  );
  const act = (state, action) => applyAction(manifest, state, { playerId: "me", ...action });

  it("covers a circle, or a meeple's base", () => {
    expect(footprint(pieceDef(manifest, "p"), 10, 10, 0)).toEqual({ circle: { x: 10, y: 10, r: 1 } });
    expect(footprint(pieceDef(manifest, "m"), 30, 10, 0).polygon).toHaveLength(4);
    expect(objectHeight(findObject(manifest, initialState(manifest), "p"))).toBeCloseTo(3.2);
  });

  it("moves and goes in bags, but doesn't flip", () => {
    let state = initialState(manifest);
    expect(act(state, { type: "flip", id: "p" }).reason).toMatch(/don't flip/);
    state = act(state, { type: "grab", id: "p" }).state;
    state = act(state, { type: "drop", id: "p", x: 60, y: 60 }).state;
    expect(state.containers.bag.members).toEqual(["q", "p"]);
  });

  it("magnifies as its shape in its color, alone or in a bag", () => {
    const state = initialState(manifest);
    expect(visibleSide(manifest, state, "m")).toEqual({ pawn: { shape: "meeple", color: "#f4f1ea" } });
    expect(visibleSide(manifest, state, "bag").contents).toEqual([
      expect.objectContaining({ count: 1, side: { pawn: { shape: "classic", color: "#c0392b" } } }),
    ]);
  });
});

describe("a supply of pawns", () => {
  it("hands out new pawns from an infinite bag", () => {
    const manifest = normalizeManifest({
      ...raw([]),
      pieceTypes: { red: { kind: "pawn", shape: "simple", color: "#c0392b", size: [1.8] } },
      containers: [{ id: "reds", kind: "bag", position: [50, 50], size: [6, 6], infinite: "red" }],
    }, "https://example.com/m.json");
    const { ok, state } = applyAction(manifest, initialState(manifest), { type: "draw", id: "reds", playerId: "me" });
    expect(ok).toBe(true);
    const [id] = Object.keys(state.pieces);
    expect(pieceDef(manifest, id)).toMatchObject({ kind: "pawn", shape: "simple", color: "#c0392b" });
  });
});

describe("pawn shapes", () => {
  it("stand as tall and as wide as their piece", () => {
    const manifest = load([
      { id: "p", kind: "pawn", size: [2], position: [10, 10] },
      { id: "m", kind: "pawn", shape: "meeple", size: [3], position: [20, 10] },
    ]);
    for (const id of ["p", "m"]) {
      const def = pieceDef(manifest, id);
      const box = new THREE.Box3().setFromObject(buildPawn(def).children[0]);
      const size = box.getSize(new THREE.Vector3());
      // A meeple's beveled corners stick out a little past its outline.
      expect(size.x / def.size[0]).toBeCloseTo(1, 1);
      expect(size.y / def.height).toBeCloseTo(1, 1);
      expect(size.z / def.size[1]).toBeCloseTo(1, 1);
      expect(box.min.y).toBeCloseTo(0, 5);
    }
  });

  it("outline as a mirrored silhouette", () => {
    const outline = pawnOutline("classic");
    expect(outline[0]).toEqual([0, 0]);
    const side = (sign) => outline.filter(([x]) => sign * x > 1e-9).map(([x, y]) => [Math.abs(x), y]);
    expect(side(-1).reverse()).toEqual(side(1));
    const { container } = render(<PawnIcon pawn={{ shape: "cone", color: "#8e44ad" }} />);
    expect(container.querySelector("polygon").getAttribute("fill")).toBe("#8e44ad");
  });
});
