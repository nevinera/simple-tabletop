// Footprints of pieces on the table, for keeping pieces on one layer from
// overlapping. Pieces whose edges touch don't count as overlapping.

const TOUCH_CM = 0.01; // overlaps shallower than this are just touching

// The piece's outline on the table at (x, y) with the given rotation:
// { circle: { x, y, r } } or { polygon: [[x, y], ...] }.
export function footprint(def, x, y, rotation) {
  const [width, depth] = def.size;
  if (def.shape === "circle") return { circle: { x, y, r: width / 2 } };

  // Clockwise from above, with y running away from you.
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const lx = (sx * width) / 2;
    const ly = (sy * depth) / 2;
    return [x + lx * cos + ly * sin, y - lx * sin + ly * cos];
  });
  return { polygon: corners };
}

export function overlaps(a, b) {
  if (a.circle && b.circle) {
    const distance = Math.hypot(a.circle.x - b.circle.x, a.circle.y - b.circle.y);
    return distance < a.circle.r + b.circle.r - TOUCH_CM;
  }
  if (a.circle) return circleOverlapsPolygon(a.circle, b.polygon);
  if (b.circle) return circleOverlapsPolygon(b.circle, a.polygon);
  return polygonsOverlap(a.polygon, b.polygon);
}

// The ids of loose pieces on def's layer that pieceId would overlap at
// (x, y), facing `rotation`. Pieces rest at their saved spot while held.
export function blockers(manifest, pieces, pieceId, x, y, rotation) {
  const def = manifest.pieces.find((p) => p.id === pieceId);
  const mine = footprint(def, x, y, rotation);
  return manifest.pieces
    .filter((other) => {
      if (other.id === pieceId || other.layer.id !== def.layer.id) return false;
      const state = pieces[other.id];
      if (state.containerId || state.x == null) return false;
      return overlaps(mine, footprint(other, state.x, state.y, state.rotation));
    })
    .map((other) => other.id);
}

// Separating axis test: two convex polygons overlap unless some edge's
// normal separates their projections.
function polygonsOverlap(a, b) {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const [x1, y1] = polygon[i];
      const [x2, y2] = polygon[(i + 1) % polygon.length];
      const length = Math.hypot(x2 - x1, y2 - y1);
      const axis = [(y1 - y2) / length, (x2 - x1) / length];
      const [minA, maxA] = project(a, axis);
      const [minB, maxB] = project(b, axis);
      if (maxA <= minB + TOUCH_CM || maxB <= minA + TOUCH_CM) return false;
    }
  }
  return true;
}

function project(polygon, [ax, ay]) {
  const dots = polygon.map(([x, y]) => x * ax + y * ay);
  return [Math.min(...dots), Math.max(...dots)];
}

function circleOverlapsPolygon(circle, polygon) {
  if (contains(polygon, circle.x, circle.y)) return true;
  for (let i = 0; i < polygon.length; i++) {
    const distance = distanceToSegment(circle.x, circle.y, polygon[i], polygon[(i + 1) % polygon.length]);
    if (distance < circle.r - TOUCH_CM) return true;
  }
  return false;
}

function contains(polygon, x, y) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegment(x, y, [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
