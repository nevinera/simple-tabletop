// Footprints of objects on the table, for keeping objects on one layer from
// overlapping. Objects whose edges touch don't count as overlapping.

import { accepts, findObject, looseObjects } from "./objects";

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

// Where object `id` would land at (x, y), facing `rotation`:
//   { into: containerId }  a piece over a deck that takes it
//   { blocked: [ids] }     overlapping other objects on its layer
//   {}                     open table
// Held objects count at their saved spot.
export function landing(manifest, state, id, x, y, rotation) {
  const object = findObject(manifest, state, id);
  const mine = footprint(object.def, x, y, rotation);
  const others = looseObjects(manifest, state).filter((other) => other.id !== id && other.def.layer.id === object.def.layer.id);

  if (object.kind === "piece") {
    const under = others.find((other) =>
      other.def.kind === "deck" && contains(footprint(other.def, other.state.x, other.state.y, other.state.rotation).polygon, x, y));
    if (under) return !under.state.heldBy && accepts(under.def, object.def) ? { into: under.id } : { blocked: [under.id] };
  }

  const blocked = others
    .filter((other) => overlaps(mine, footprint(other.def, other.state.x, other.state.y, other.state.rotation)))
    .map((other) => other.id);
  return blocked.length ? { blocked } : {};
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
