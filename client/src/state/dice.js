// Built-in dice and what a die's faces are. A die's value is an index into
// its faces.

const range = (from, to, step = 1) => Array.from({ length: (to - from) / step + 1 }, (_, i) => String(from + i * step));

export const BUILT_IN_DICE = {
  d4: { sides: 4, labels: range(1, 4) },
  d6: { sides: 6, labels: range(1, 6) },
  d6pips: { sides: 6, labels: range(1, 6), pips: true },
  d8: { sides: 8, labels: range(1, 8) },
  d10: { sides: 10, labels: range(1, 10) },
  d10z: { sides: 10, labels: range(0, 9) },
  d10t: { sides: 10, labels: ["00", ...range(10, 90, 10)] },
  d12: { sides: 12, labels: range(1, 12) },
  d20: { sides: 20, labels: range(1, 20) },
};

export const DIE_SIDES = [4, 6, 8, 10, 12, 20];

// A tetrahedron looks small next to other dice of the same width, so a d4
// grows by this much.
export const D4_SCALE = 1.5;

// How tall a die's number is, as a share of the width its label art spans.
// A d10's kite is long and narrow, so its numbers shrink to fit.
export function labelSize(label, sides) {
  const size = sides === 4 ? 0.3 : label.length > 1 ? 0.36 : 0.46;
  return sides === 10 ? size * 0.62 : size;
}

// Where a pipped die's pips sit for a label, as [x, y] shares of the face's
// width from its middle, and how big they are.
const PIP_OFFSET = 0.27;
export const PIP_RADIUS = 0.09;
const PIP_LAYOUTS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

export function pipSpots(label) {
  return PIP_LAYOUTS[label].map(([x, y]) => [x * PIP_OFFSET, y * PIP_OFFSET]);
}

// A random face for each die, picked by the client that rolls.
export function rollValues(dieDefs, random = Math.random) {
  return Object.fromEntries(dieDefs.map((def) => [def.id, Math.floor(random() * def.die.sides)]));
}
