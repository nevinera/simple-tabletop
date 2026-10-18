import { describe, expect, it } from "vitest";
import { HELD_LIFT, applyPlacement, buildPiece, placement } from "../table/pieces";

const def = { layer: { base: 0.3, thickness: 0.04 } };
const state = { x: 10, y: 20, rotation: 90, faceUp: true, containerId: null, heldBy: null, drag: null };

describe("placement", () => {
  it("rests on its layer, with table y mapped to Three's -z", () => {
    const place = placement(def, state);
    expect(place.position[0]).toBe(10);
    expect(place.position[1]).toBeCloseTo(0.32);
    expect(place.position[2]).toBe(-20);
    expect(place.rotation[1]).toBeCloseTo(-Math.PI / 2);
    expect(place.rotation[2]).toBe(0);
  });

  it("turns face-down pieces over", () => {
    expect(placement(def, { ...state, faceUp: false }).rotation[2]).toBe(Math.PI);
  });

  it("lifts held pieces and follows the drag", () => {
    const place = placement(def, { ...state, heldBy: "p1", drag: { x: 50, y: 60 } });
    expect(place.position[0]).toBe(50);
    expect(place.position[1]).toBeCloseTo(0.32 + HELD_LIFT);
    expect(place.position[2]).toBe(-60);
  });

  it("hides pieces inside containers", () => {
    expect(placement(def, { ...state, containerId: "deck" })).toBeNull();
  });
});

describe("applyPlacement", () => {
  const piece = { id: "card", shape: "rect", size: [6, 9], layer: def.layer, face: "f.png", back: "b.png" };
  const textures = { get: async () => null };

  it("leaves a ghost at the resting spot while the piece is dragged", async () => {
    const mesh = await buildPiece(piece, textures);
    const { ghost } = mesh.userData;

    applyPlacement(mesh, def, { ...state, heldBy: "p1" }, 0);
    expect(ghost.visible).toBe(false);

    applyPlacement(mesh, def, { ...state, heldBy: "p1", drag: { x: 50, y: 60 } }, 0);
    expect(ghost.visible).toBe(true);
    expect(ghost.position.toArray()).toEqual(placement(def, state).position);
    for (const material of ghost.material) {
      expect(material.transparent).toBe(true);
      expect(material.alphaTest).toBeLessThan(material.opacity);
    }
    expect(mesh.position.x).toBe(50);

    applyPlacement(mesh, def, state, 0);
    expect(ghost.visible).toBe(false);
  });

  it("keeps the ghost's orientation from when the piece was picked up", async () => {
    const mesh = await buildPiece(piece, textures);
    const { ghost } = mesh.userData;

    applyPlacement(mesh, def, { ...state, heldBy: "p1" }, 0);
    applyPlacement(mesh, def, { ...state, heldBy: "p1", faceUp: false, rotation: 135, drag: { x: 50, y: 60 } }, 0);
    expect(ghost.rotation.toArray().slice(0, 3)).toEqual(placement(def, state).rotation);
    expect(mesh.rotation.z).toBe(Math.PI);

    // Picked up again later, it starts from its new orientation.
    applyPlacement(mesh, def, { ...state, faceUp: false }, 0);
    applyPlacement(mesh, def, { ...state, faceUp: false, heldBy: "p1", drag: { x: 50, y: 60 } }, 0);
    expect(ghost.rotation.z).toBe(Math.PI);
  });
});
