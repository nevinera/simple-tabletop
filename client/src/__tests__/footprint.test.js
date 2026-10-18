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
