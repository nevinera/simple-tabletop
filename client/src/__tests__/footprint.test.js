import { describe, expect, it } from "vitest";
import { footprint, overlaps } from "../state/footprint";

const card = { shape: "rect", size: [6, 9] };
const coin = { shape: "circle", size: [4, 4] };

describe("footprint", () => {
  it("turns rectangles clockwise from above", () => {
    const corners = footprint(card, 0, 0, 90).polygon.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    // Turned a quarter, the card is 9 wide and 6 deep.
    expect(Math.max(...corners.map(([x]) => x))).toBeCloseTo(4.5);
    expect(Math.max(...corners.map(([, y]) => y))).toBeCloseTo(3);
  });
});

describe("overlaps", () => {
  it("spots overlapping rectangles, but not ones that only touch", () => {
    expect(overlaps(footprint(card, 0, 0, 0), footprint(card, 5, 0, 0))).toBe(true);
    expect(overlaps(footprint(card, 0, 0, 0), footprint(card, 6, 0, 0))).toBe(false);
  });

  it("accounts for rotation", () => {
    // Side by side, 7cm apart: clear when upright, overlapping when one turns.
    expect(overlaps(footprint(card, 0, 0, 0), footprint(card, 7, 0, 0))).toBe(false);
    expect(overlaps(footprint(card, 0, 0, 0), footprint(card, 7, 0, 90))).toBe(true);
  });

  it("handles circles against circles and rectangles", () => {
    expect(overlaps(footprint(coin, 0, 0, 0), footprint(coin, 3.9, 0, 0))).toBe(true);
    expect(overlaps(footprint(coin, 0, 0, 0), footprint(coin, 4, 0, 0))).toBe(false);
    expect(overlaps(footprint(coin, 0, 0, 0), footprint(card, 4.9, 0, 0))).toBe(true);
    expect(overlaps(footprint(coin, 0, 0, 0), footprint(card, 5, 0, 0))).toBe(false);
    // Near a corner, the circle can clear the rectangle's bounding box corner.
    expect(overlaps(footprint(coin, 0, 0, 0), footprint(card, 4.5, 6, 0))).toBe(false);
  });
});

describe("shaped footprints", () => {
  // Flat-topped hexes 2 across, and a tile of two neighbors: one at the
  // middle and one up and to its right.
  const rise = Math.sqrt(3) / 2;
  const hex = (cx, cy) => [0, 60, 120, 180, 240, 300].map((deg) => [cx + Math.cos((deg * Math.PI) / 180), cy + Math.sin((deg * Math.PI) / 180)]);
  const pair = { kind: "tile", shape: "rect", size: [3.5, 2.6], outline: [hex(0, 0), hex(1.5, rise)] };

  it("covers only its parts, so tiles fit together where their boxes would overlap", () => {
    // Another pair 3 to the right: its lower hex meets this one's upper hex edge to edge.
    const a = footprint(pair, 10, 10, 0);
    const b = footprint(pair, 13, 10, 0);
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(footprint({ shape: "rect", size: [3.5, 2.6] }, 10.75, 10.4, 0), footprint({ shape: "rect", size: [3.5, 2.6] }, 13.75, 10.4, 0))).toBe(true);
    expect(overlaps(a, footprint(pair, 12, 10, 0))).toBe(true);
  });

  it("turns its parts with the piece", () => {
    const ys = footprint(pair, 0, 0, 90).parts.flat().map(([, y]) => y);
    expect(Math.max(...ys)).toBeCloseTo(1);
    expect(Math.min(...ys)).toBeCloseTo(-2.5);
  });

  it("overlaps circles part by part", () => {
    expect(overlaps(footprint(pair, 0, 0, 0), footprint({ shape: "circle", size: [1] }, 1.6, -0.7, 0))).toBe(false);
    expect(overlaps(footprint(pair, 0, 0, 0), footprint({ shape: "circle", size: [1] }, 0, 0, 0))).toBe(true);
  });
});
