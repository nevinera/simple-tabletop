// Outlines for the built-in pawn shapes, in a unit box: x runs -0.5 to 0.5
// across the pawn's width, and y runs 0 at its base to 1 at its top. Round
// shapes list the right half of their profile, which the scene spins into a
// solid. A meeple lists its whole silhouette, which the scene extrudes.

export const PAWN_SHAPES = ["classic", "simple", "meeple", "cone"];

// Height as a multiple of width, when the manifest doesn't give one.
export const PAWN_HEIGHTS = { classic: 1.6, simple: 1.4, meeple: 1, cone: 1.5 };

// A meeple's thickness, front to back, as a multiple of its width.
export const MEEPLE_DEPTH = 0.4;

const arc = (cx, cy, r, from, to, steps) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const angle = from + ((to - from) * i) / steps;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });

// Drawn in widths at each shape's default height, so heads come out round,
// then squeezed into the unit box.
const unitBox = (points, height) => points.map(([x, y]) => [x, y / height]);

const PROFILES = {
  classic: unitBox([
    [0, 0], [0.5, 0], [0.5, 0.1], [0.44, 0.16], [0.44, 0.22], [0.34, 0.3], [0.21, 0.67], [0.16, 0.95],
    [0.27, 0.99], [0.27, 1.04], [0.13, 1.09],
    ...arc(0, 1.435, 0.165, -1.2, Math.PI / 2, 10),
  ], PAWN_HEIGHTS.classic),
  // A smooth bell narrowing to a round head, like a Parcheesi pawn.
  simple: unitBox([
    [0, 0], [0.5, 0], [0.5, 0.05], [0.48, 0.12], [0.43, 0.24], [0.35, 0.4], [0.26, 0.6], [0.19, 0.78],
    [0.15, 0.9], ...arc(0, 1.19, 0.21, -1.25, Math.PI / 2, 10),
  ], PAWN_HEIGHTS.simple),
  cone: unitBox([
    [0, 0], [0.5, 0], [0.5, 0.07], [0.1, 1.3], ...arc(0, 1.39, 0.11, -0.4, Math.PI / 2, 6),
  ], PAWN_HEIGHTS.cone),
};

const MEEPLE = [
  [-0.42, 0], [-0.12, 0], [0, 0.2], [0.12, 0], [0.42, 0], [0.28, 0.38], [0.5, 0.5], [0.47, 0.63], [0.15, 0.66],
  ...arc(0, 0.83, 0.17, -0.85, Math.PI + 0.85, 12),
  [-0.15, 0.66], [-0.47, 0.63], [-0.5, 0.5], [-0.28, 0.38],
];

// The right half of a round shape's profile, or null for a meeple.
export function pawnProfile(shape) {
  return PROFILES[shape] || null;
}

// The pawn's silhouette from the front, all the way around.
export function pawnOutline(shape) {
  if (shape === "meeple") return MEEPLE;
  const half = PROFILES[shape];
  return [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
}
