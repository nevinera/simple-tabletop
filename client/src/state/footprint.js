// Footprints of objects on the table, for keeping objects on one layer from
// overlapping. Objects whose edges touch don't count as overlapping.

import { accepts, canStack, findObject, looseObjects, pieceDef, restingSpot, stackKey } from "./objects";
import { hasRoom } from "./trays";
import { seatOf } from "./seats";

const TOUCH_CM = 0.01; // overlaps shallower than this are just touching

// The piece's outline on the table at (x, y) with the given rotation:
// { circle: { x, y, r } } or { polygon: [[x, y], ...] }.
export function footprint(def, x, y, rotation) {
  // A standee covers only its holder.
  const [width, depth] = def.holder || def.size;
  if (def.shape === "circle" || def.shape === "die") return { circle: { x, y, r: width / 2 } };

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

// Where object `id` would land at (x, y), facing `rotation`, when
// `playerId` lets go of it:
//   { into: containerId }  a piece over a container that takes it
//   { stack: pieceId }     a piece over a loose one just like it, to stack on
//   { blocked: [ids] }     overlapping other objects on its layer, or off
//                          the table (with no ids)
//   {}                     open table
// Held objects count at their resting spot.
export function landing(manifest, state, id, x, y, rotation, playerId) {
  const object = findObject(manifest, state, id);
  const mine = footprint(object.def, x, y, rotation);
  const others = looseObjects(manifest, state)
    .filter((other) => other.id !== id && other.def.layer.id === object.def.layer.id)
    .map((other) => ({ ...other, outline: footprint(other.def, ...spot(other)) }));

  if (object.kind === "piece") {
    const under = others.find((other) => CONTAINER_TARGETS.includes(other.def.kind) && inside(other.outline, x, y));
    if (under) return takes(manifest, state, under, object, playerId) ? { into: under.id } : { blocked: [under.id] };
    const twin = canStack(object.def) && others.find((other) => other.kind === "piece" && !other.state.heldBy &&
      stackKey(other.def) === stackKey(object.def) && inside(other.outline, x, y));
    if (twin) return { stack: twin.id };
  }

  const [width, depth] = manifest.table.size;
  if (x < 0 || y < 0 || x > width || y > depth) return { blocked: [] };
  const blocked = others.filter((other) => overlaps(mine, other.outline)).map((other) => other.id);
  return blocked.length ? { blocked } : {};
}

const CONTAINER_TARGETS = ["deck", "bag", "hand", "tray", "stack"];

// The area a dragged object can move over: the table, plus the hand trays
// around it. Returns { minX, maxX, minY, maxY }.
export function reachBounds(manifest, state) {
  const [width, depth] = manifest.table.size;
  const bounds = { minX: 0, maxX: width, minY: 0, maxY: depth };
  for (const hand of looseObjects(manifest, state).filter((object) => object.def.kind === "hand")) {
    for (const [x, y] of footprint(hand.def, ...spot(hand)).polygon) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return bounds;
}

function spot(object) {
  const { x, y, rotation } = restingSpot(object);
  return [x, y, rotation];
}

// Whether a container takes a piece from this player. Anyone can add to a
// hand when the module allows passing; otherwise only its own player can. A
// tray takes dice while it has room.
function takes(manifest, state, container, piece, playerId) {
  if (container.state.heldBy || !accepts(container.def, piece.def)) return false;
  if (container.def.kind === "tray") {
    const dice = container.state.members.filter((id) => id !== piece.id).map((id) => pieceDef(manifest, id));
    return hasRoom(container.def, dice, piece.def);
  }
  if (container.def.kind !== "hand") return true;
  return manifest.hands.passing || seatOf(state, playerId) === container.def.seatId;
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

// Whether (x, y) is inside a footprint.
function inside(outline, x, y) {
  if (outline.circle) return Math.hypot(x - outline.circle.x, y - outline.circle.y) < outline.circle.r;
  return contains(outline.polygon, x, y);
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
