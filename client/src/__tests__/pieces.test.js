import { describe, expect, it } from "vitest";
import { HELD_LIFT, placement } from "../table/pieces";

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
