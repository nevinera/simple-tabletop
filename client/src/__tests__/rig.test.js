import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyMotion, clampTarget, orbit, pan, sumMotions } from "../table/rig";

const LIMITS = { minPolarAngle: 0.01, maxPolarAngle: Math.PI / 2 - 0.05, minDistance: 5, maxDistance: 400 };

// Camera 10 units back along +z and 10 up, looking at the origin.
function camera() {
  return { position: new THREE.Vector3(0, 10, 10), target: new THREE.Vector3(0, 0, 0) };
}

describe("pan", () => {
  it("moves forward along the table, toward where the camera faces", () => {
    const { position, target } = camera();
    pan(position, target, 0, 2);
    expect(target.toArray()).toEqual([0, 0, -2]);
    expect(position.toArray()).toEqual([0, 10, 8]);
  });

  it("moves right relative to the camera", () => {
    const { position, target } = camera();
    pan(position, target, 3, 0);
    expect(target.x).toBeCloseTo(3);
    expect(target.z).toBeCloseTo(0);
  });
});

describe("orbit", () => {
  it("turning left swings the camera to its right around the target", () => {
    const { position, target } = camera();
    orbit(position, target, { turn: Math.PI / 2 }, LIMITS);
    expect(position.x).toBeCloseTo(10);
    expect(position.z).toBeCloseTo(0);
  });

  it("tilting toward top-down raises the camera, within limits", () => {
    const { position, target } = camera();
    orbit(position, target, { tilt: 10 }, LIMITS);
    expect(Math.acos(position.y / position.length())).toBeCloseTo(LIMITS.minPolarAngle);
  });

  it("clamps zoom distance", () => {
    const { position, target } = camera();
    orbit(position, target, { zoom: 0.001 }, LIMITS);
    expect(position.distanceTo(target)).toBeCloseTo(LIMITS.minDistance);
  });
});

describe("applyMotion", () => {
  it("scales pan speed with distance and time", () => {
    const { position, target } = camera();
    const distance = position.distanceTo(target);
    applyMotion(position, target, { pan: [0, 1], turn: 0, tilt: 0, zoom: 0 }, 0.5, LIMITS);
    expect(target.z).toBeCloseTo(-distance * 0.8 * 0.5);
  });

  it("zooms in for positive zoom", () => {
    const { position, target } = camera();
    const before = position.distanceTo(target);
    applyMotion(position, target, { pan: [0, 0], turn: 0, tilt: 0, zoom: 1 }, 0.1, LIMITS);
    expect(position.distanceTo(target)).toBeLessThan(before);
  });
});

describe("clampTarget", () => {
  it("pulls the target back over the table and brings the camera along", () => {
    const { position, target } = camera();
    target.set(50, 0, 0);
    position.set(50, 10, 10);
    clampTarget(position, target, { minX: -5, maxX: 20, minZ: -20, maxZ: 5 });
    expect(target.toArray()).toEqual([20, 0, 0]);
    expect(position.toArray()).toEqual([20, 10, 10]);
  });
});

describe("sumMotions", () => {
  it("adds motions from every input, capped at full speed", () => {
    expect(sumMotions([{ pan: [1, 0], zoom: 1 }, { pan: [1, 1], turn: -1 }, { zoom: 1 }])).toEqual({
      pan: [1, 1], turn: -1, tilt: 0, zoom: 1,
    });
  });
});
