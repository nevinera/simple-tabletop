import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cornerSections, orientation, restHeight, solid, topFace } from "../table/diceGeometry";

const SIDES = [4, 6, 8, 10, 12, 20];
const CORNERS = { 4: 3, 6: 4, 8: 3, 10: 4, 12: 5, 20: 3 };

describe("dice solids", () => {
  it.each(SIDES)("a d%i has the right faces, and is 1 across", (sides) => {
    const shape = solid(sides);
    expect(shape.faces).toHaveLength(sides);
    for (const face of shape.faces) expect(face.corners).toHaveLength(CORNERS[sides]);
    expect(Math.max(...shape.vertices.map((v) => v.length()))).toBeCloseTo(0.5);
    expect(restHeight(sides)).toBeGreaterThan(0);
  });

  it.each(SIDES.filter((sides) => sides !== 4))("turns each d%i value's face to the top, label reading away from you", (sides) => {
    for (let value = 0; value < sides; value++) {
      const q = orientation(sides, value);
      const face = solid(sides).faces[value];
      const normal = face.normal.clone().applyQuaternion(q);
      expect(normal.y).toBeCloseTo(1);
      const up = face.up.clone().applyQuaternion(q);
      expect(up.z).toBeCloseTo(-1);
    }
  });

  it("points a d4's rolled vertex up", () => {
    for (let value = 0; value < 4; value++) {
      const top = solid(4).vertices[value].clone().applyQuaternion(orientation(4, value));
      expect(top.x).toBeCloseTo(0);
      expect(top.z).toBeCloseTo(0);
      expect(top.y).toBeCloseTo(0.5);
    }
  });

  it("yaws with the piece's rotation", () => {
    const up = solid(6).faces[0].up.clone().applyQuaternion(orientation(6, 0, -Math.PI / 2));
    // A quarter turn clockwise from above points the label's top to +x.
    expect(up.x).toBeCloseTo(1);
  });

  it("splits a d4 face into three corner sections, one per vertex it touches", () => {
    const face = solid(4).faces[0];
    const sections = cornerSections(face);
    expect(sections.map((section) => section.vertex).sort()).toEqual([...face.corners].sort());
    expect(face.corners).not.toContain(0);
    expect(sections[0].polygon[2]).toBe(face.center);
    expect(sections[0].polygon[0]).toBeInstanceOf(THREE.Vector3);
  });
});

describe("topFace", () => {
  it("lays a d20's rolled face flat with its label upright", () => {
    const face = topFace(20, 7);
    expect(face.outline).toHaveLength(3);
    expect(face.regions).toEqual([expect.objectContaining({ label: 7 })]);
    expect(face.regions[0].turn).toBeCloseTo(0);
  });

  it("shows a d4 face with the rolled corner on top, its three corners labeled", () => {
    const face = topFace(4, 2);
    // Face 3 is the one opposite corner 3, so it touches corners 0, 1, and 2.
    expect(face.regions.map((r) => r.label).sort()).toEqual([0, 1, 2]);
    const top = face.regions.find((r) => r.label === 2);
    expect(top).toBeDefined();
    // The rolled corner's section sits highest (y runs down) and reads upright.
    expect(Math.min(...face.regions.map((r) => r.center[1]))).toBe(top.center[1]);
    expect(top.turn).toBeCloseTo(0);
  });
});
