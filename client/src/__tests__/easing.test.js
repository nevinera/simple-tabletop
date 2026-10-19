import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Easing } from "../table/easing";

const placed = (object, x) => {
  object.position.set(x, 0, 0);
  return object;
};

describe("Easing", () => {
  it("slides a moved object over about 150 ms", () => {
    const easing = new Easing();
    const card = placed(new THREE.Object3D(), 0);
    easing.settle(card, false);
    easing.settle(placed(card, 10), false);
    expect(card.position.x).toBe(0);
    easing.step(0.05);
    expect(card.position.x).toBeCloseTo(6.32, 1);
    easing.step(0.2);
    expect(card.position.x).toBe(10);
  });

  it("moves what you drive, and what just appeared, straight there", () => {
    const easing = new Easing();
    const card = placed(new THREE.Object3D(), 0);
    easing.settle(card, false);
    easing.settle(placed(card, 10), true);
    expect(card.position.x).toBe(10);
    card.visible = false;
    easing.settle(card, false);
    card.visible = true;
    easing.settle(placed(card, 20), false);
    expect(card.position.x).toBe(20);
  });

  it("carries on from where it is when the target moves again", () => {
    const easing = new Easing();
    const card = placed(new THREE.Object3D(), 0);
    easing.settle(card, false);
    easing.settle(placed(card, 10), false);
    easing.step(0.05);
    const midway = card.position.x;
    easing.settle(placed(card, 20), false);
    expect(card.position.x).toBe(midway);
  });
});
