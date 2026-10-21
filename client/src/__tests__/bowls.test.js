import { describe, expect, it } from "vitest";
import { applyAction, initialState } from "../state/actions";
import { normalizeManifest } from "../manifest/manifest";
import { findObject } from "../state/objects";
import { fits, hasRoom } from "../state/trays";
import * as THREE from "three";
import { buildBowl, faceBowlCounter, placeBowl } from "../table/bowls";

const manifest = normalizeManifest({
  formatVersion: 1,
  id: "bowls",
  name: "Bowls",
  table: { size: [60, 40] },
  layers: [{ id: "pieces", thickness: 0.5 }],
  pieceTypes: { seed: { kind: "token", shape: "circle", size: [1], face: "seed.svg" } },
  pieces: [
    ...[1, 2, 3, 4].map((n) => ({ id: `seed-${n}`, type: "seed" })),
    { id: "loose", type: "seed", position: [50, 30] },
  ],
  containers: [
    { id: "pit", kind: "bowl", position: [15, 20], size: [6], fixed: true, members: ["seed-1", "seed-2", "seed-3", "seed-4"] },
    { id: "store", kind: "bowl", position: [35, 20], size: [8, 16], color: "#6b4a2f", fixed: true },
  ],
}, "https://example.com/manifest.json");

const act = (state, action) => applyAction(manifest, state, { playerId: "me", ...action });

describe("bowls", () => {
  it("are round with one size and oval with two, and lay their pieces out inside", () => {
    const pit = findObject(manifest, initialState(manifest), "pit");
    expect(pit.def).toMatchObject({ size: [6, 6], shape: "circle" });
    expect(findObject(manifest, initialState(manifest), "store").def).toMatchObject({ size: [8, 16], shape: "oval" });
    const { spots } = pit.state;
    expect(Object.keys(spots).sort()).toEqual(["seed-1", "seed-2", "seed-3", "seed-4"]);
    for (const [x, y] of Object.values(spots)) expect(Math.hypot(x, y)).toBeLessThanOrEqual(2.5 + 1e-9);
  });

  it("let you take out any one piece, and drop one into another", () => {
    let state = act(initialState(manifest), { type: "grab", id: "seed-3" }).state;
    state = act(state, { type: "drop", id: "seed-3", x: 35, y: 21 }).state;
    expect(state.containers.pit.members).toEqual(["seed-1", "seed-2", "seed-4"]);
    expect(state.containers.pit.spots["seed-3"]).toBeUndefined();
    expect(state.containers.store.members).toEqual(["seed-3"]);
    expect(state.pieces["seed-3"]).toMatchObject({ containerId: "store", heldBy: null });
    state = act(state, { type: "grab", id: "loose" }).state;
    state = act(state, { type: "drop", id: "loose", x: 15, y: 20 }).state;
    expect(state.containers.pit.members).toContain("loose");
  });

  it("fill an oval, not its corners, and only so full", () => {
    const store = findObject(manifest, initialState(manifest), "store").def;
    const seed = { size: [1] };
    expect(fits(store, [], seed, [0, 7])).toBe(true);
    expect(fits(store, [], seed, [3.4, 7])).toBe(false);
    const many = Array(80).fill(seed);
    expect(hasRoom(store, many.slice(0, 40), seed)).toBe(true);
    expect(hasRoom(store, many, seed)).toBe(false);
  });

  it("draws as a dish with its count on the camera's side of the rim", () => {
    const state = initialState(manifest);
    const pit = findObject(manifest, state, "pit");
    const group = buildBowl("pit", pit.def);
    placeBowl(group, pit.def, pit.state);
    group.updateMatrixWorld();
    expect(group.userData.counter.visible).toBe(true);
    faceBowlCounter(group, new THREE.Vector3(15, 30, -5));
    // The camera is toward the near edge, which is +z in three.
    expect(group.userData.counter.position.z).toBeGreaterThan(3);
    expect(Math.abs(group.userData.counter.position.x)).toBeLessThan(1e-9);
  });
});
