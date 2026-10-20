// Footprints of objects on the table, for working out where objects on one
// layer can go. Objects whose edges touch don't count as overlapping.
//
// Things can rest on each other. An object's z is how far its base sits
// above its layer's base: 0 on the table, or the top of what it rests on.
// Only flat things hold others up (see isSupport), and there's no tilting:
// something resting partway over an edge stays level at the height of the
// tallest thing under it.

import {
  accepts, fanBox, findObject, looseObjects, objectHeight, pieceDef, pilesWith, restingSpot,
} from "./objects";
import { hasRoom } from "./trays";
import { seatOf } from "./seats";

const TOUCH_CM = 0.01; // overlaps shallower than this are just touching
const SAME_HEIGHT = 1e-6; // cm; heights closer than this are the same

// What other things can rest on: flat pieces, and decks and stacks.
const SUPPORT_PIECES = ["card", "board", "tile", "chip", "token"];
const SUPPORT_CONTAINERS = ["deck", "stack"];

// The piece's outline on the table at (x, y) with the given rotation:
// { circle: { x, y, r } } or { polygon: [[x, y], ...] }.
export function footprint(def, x, y, rotation) {
  // A standee covers only its holder.
  const [width, depth] = def.holder || def.size;
  if (def.shape === "circle" || def.shape === "die" || (def.kind === "pawn" && def.shape !== "meeple")) {
    return { circle: { x, y, r: width / 2 } };
  }

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
//   { into: containerId }  a piece over a container that takes it, or a deck
//                          over a deck that takes all its cards
//   { onto: pieceId }      a piece over a loose one it piles with (see pilesWith)
//   { blocked: [ids] }     overlapping things it can't rest on, or off the
//                          table (with no ids)
//   { z }                  open table, or resting on what's under it, z up
// What's on top where the piece's center lands decides whether it goes into
// a container or piles up. A deck or stack that won't take a piece holds it
// up instead. Held objects count at their resting spot, but nothing rests
// on what someone else holds. What the object carries (see carried) doesn't
// count.
export function landing(manifest, state, id, x, y, rotation, playerId) {
  const object = findObject(manifest, state, id);
  const mine = outline(object, x, y, rotation);
  const along = new Set(carried(manifest, state, id));
  const others = layerMates(manifest, state, object).filter((other) => !along.has(other.id));

  const [top] = others.filter((other) => inside(other.outline, x, y)).sort((a, b) => elevation(b) - elevation(a));
  if (object.kind === "container" && object.def.kind === "deck" && top?.def.kind === "deck") {
    if (takesDeck(manifest, top, object, playerId)) return { into: top.id };
  }
  if (object.kind === "piece") {
    if (top && CONTAINER_TARGETS.includes(top.def.kind)) {
      if (takes(manifest, state, top, object, playerId)) return { into: top.id };
      if (!holdsUp(top, playerId)) return { blocked: [top.id] };
    } else if (top && top.kind === "piece" && !top.state.heldBy && pilesWith(object.def, top.def)) {
      return { onto: top.id };
    }
  }

  const [width, depth] = manifest.table.size;
  if (x < 0 || y < 0 || x > width || y > depth) return { blocked: [] };
  const touching = others.filter((other) => overlaps(mine, other.outline));
  const blocked = canRest(object) ? touching.filter((other) => !holdsUp(other, playerId)) : touching;
  if (blocked.length) return { blocked: blocked.map((other) => other.id) };
  return { z: Math.max(0, ...touching.map(topOf)) };
}

// Whether other things can rest on an object.
export function isSupport(object) {
  if (object.kind === "piece") return SUPPORT_PIECES.includes(object.def.kind);
  return SUPPORT_CONTAINERS.includes(object.def.kind);
}

// Boards and hands never rest on anything.
function canRest(object) {
  return object.def.kind !== "board" && object.def.kind !== "hand";
}

// Whether something landing now can rest on an object: a support nobody
// else is holding.
function holdsUp(object, playerId) {
  return isSupport(object) && (!object.state.heldBy || object.state.heldBy === playerId);
}

// How far an object's base sits above its layer's base.
export function elevation(object) {
  return object.state.z || 0;
}

// The height of an object's top above its layer's base. An empty deck is
// only an outline, so things rest on the table through it.
export function topOf(object) {
  const empty = object.kind === "container" && object.def.kind === "deck" && !object.state.members.length;
  return elevation(object) + (empty ? 0 : objectHeight(object));
}

// What moves along with object `id`, lowest first: for a held object, what
// rode on it when it was picked up (its carrying list), plus the other loose
// things its holder holds and what rode on them, since a player's holds move
// as a group. Otherwise, what rides on it now. A piece drawn from a deck or
// bag carries nothing.
export function carried(manifest, state, id) {
  const object = findObject(manifest, state, id);
  const holder = object?.state.heldBy;
  if (!holder) return riders(manifest, state, id);
  const group = [];
  for (const kind of ["pieces", "containers"]) {
    for (const [otherId, other] of Object.entries(state[kind])) {
      if (otherId !== id && other.heldBy === holder && !other.containerId && other.x != null) group.push(otherId);
    }
  }
  const ids = [...(object.state.carrying || []), ...group.flatMap((otherId) => [otherId, ...(objectState(state, otherId).carrying || [])])];
  const fits = (riderId) => {
    const rider = objectState(state, riderId);
    return rider && riderId !== id && !rider.containerId && !rider.locked && (!rider.heldBy || rider.heldBy === holder);
  };
  return [...new Set(ids)].filter(fits).sort((a, b) => (objectState(state, a).z || 0) - (objectState(state, b).z || 0));
}

// Sets down things that moved together, lowest first: each rests on the
// tallest support under it, among what stayed put and what's already set
// down. Returns the new state, or null if one would land off the table or
// over something that can't hold it up.
export function setDown(manifest, state, ids, playerId) {
  const pending = new Set(ids);
  const [width, depth] = manifest.table.size;
  let next = state;
  for (const id of [...ids].sort((a, b) => (objectState(state, a).z || 0) - (objectState(state, b).z || 0))) {
    pending.delete(id);
    const object = findObject(manifest, next, id);
    const { x, y, rotation } = object.state;
    if (x < 0 || y < 0 || x > width || y > depth) return null;
    const mine = outline(object, x, y, rotation);
    const touching = layerMates(manifest, next, object)
      .filter((other) => !pending.has(other.id) && overlaps(mine, other.outline));
    if (!canRest(object) && touching.length) return null;
    if (touching.some((other) => !holdsUp(other, playerId))) return null;
    next = withZ(next, object, Math.max(0, ...touching.map(topOf)));
  }
  return next;
}

function objectState(state, id) {
  return state.pieces[id] || state.containers[id];
}

// What rides on object `id`: loose things on its layer, above it, that
// overlap it or something else riding on it. Locked things and things
// someone holds stay put, and settle (below) lets them down.
export function riders(manifest, state, id) {
  const object = findObject(manifest, state, id);
  if (!object || object.state.containerId || object.def.kind === "hand") return [];
  const base = elevation(object);
  const above = layerMates(manifest, state, object)
    .filter((other) => elevation(other) > base + SAME_HEIGHT && !other.state.locked && !other.state.heldBy)
    .sort((a, b) => elevation(a) - elevation(b));
  const carried = [outline(object, ...spot(object))];
  const ids = [];
  for (const other of above) {
    if (!carried.some((shape) => overlaps(shape, other.outline))) continue;
    carried.push(other.outline);
    ids.push(other.id);
  }
  return ids;
}

// Lets everything off the table's surface sit on whatever is under it now:
// something whose support went away drops, and something on a deck that
// grew rises. Lowest first, so each one settles on things already settled.
// Held things are off the table: they hold nothing up, and they and what
// they carry stay as they are until they're put down. Gives back the same
// state when nothing moves.
export function settle(manifest, state) {
  const loose = restingOutlines(manifest, state);
  const held = loose.filter((object) => object.state.heldBy);
  const keep = new Set(held.flatMap((object) => [object.id, ...carried(manifest, state, object.id)]));
  const raised = loose.filter((object) => elevation(object) > 0 && !keep.has(object.id))
    .sort((a, b) => elevation(a) - elevation(b));
  const tops = new Map(); // id -> top, once settled
  const topNow = (object) => (tops.has(object.id) ? tops.get(object.id) : topOf(object));
  let next = state;
  for (const object of raised) {
    const was = elevation(object);
    const under = loose.filter((other) => other.id !== object.id && other.def.layer.id === object.def.layer.id &&
      elevation(other) < was - SAME_HEIGHT && isSupport(other) && !other.state.heldBy &&
      overlaps(other.outline, object.outline));
    const z = Math.max(0, ...under.map(topNow));
    tops.set(object.id, topOf(object) - was + z);
    if (Math.abs(z - was) > SAME_HEIGHT) next = withZ(next, object, z);
  }
  return next;
}

// Stacks up a starting table: decks and stacks first, then pieces in the
// order the manifest lists them, then other containers, each resting on
// whatever was placed under it before.
export function stackUp(manifest, state) {
  const loose = restingOutlines(manifest, state);
  const rank = (object) => {
    if (object.kind === "container") return SUPPORT_CONTAINERS.includes(object.def.kind) ? -1 : Infinity;
    return object.state.stackOrder;
  };
  const order = [...loose].sort((a, b) => rank(a) - rank(b));
  const placed = [];
  let next = state;
  for (const object of order) {
    const under = placed.filter((other) => other.def.layer.id === object.def.layer.id && other.support &&
      overlaps(other.outline, object.outline));
    const z = Math.max(0, ...under.map((other) => other.top));
    if (z > 0) next = withZ(next, object, z);
    placed.push({ ...object, support: isSupport(object), top: z + topOf(object) - elevation(object) });
  }
  return next;
}

// Every loose object but hands, with its footprint where it rests.
function restingOutlines(manifest, state) {
  return looseObjects(manifest, state)
    .filter((object) => object.def.kind !== "hand")
    .map((object) => ({ ...object, outline: outline(object, ...spot(object)) }));
}

// The other loose objects on an object's layer, with their footprints where
// they rest.
function layerMates(manifest, state, object) {
  return looseObjects(manifest, state)
    .filter((other) => other.id !== object.id && other.def.layer.id === object.def.layer.id)
    .map((other) => ({ ...other, outline: outline(other, ...spot(other)) }));
}

function withZ(state, { kind, id }, z) {
  const key = kind === "piece" ? "pieces" : "containers";
  return { ...state, [key]: { ...state[key], [id]: { ...state[key][id], z } } };
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

// An object's footprint at (x, y), turned to `rotation`. A splayed deck
// covers its whole fan.
export function outline(object, x, y, rotation) {
  const fan = fanBox(object, x, y, rotation);
  if (!fan) return footprint(object.def, x, y, rotation);
  return footprint({ shape: "rect", size: fan.size }, ...fan.middle, rotation);
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

// Whether a deck takes every card in another, so the two can merge.
function takesDeck(manifest, target, deck, playerId) {
  const free = !target.state.heldBy || target.state.heldBy === playerId;
  return free && deck.state.members.length > 0 &&
    deck.state.members.every((id) => accepts(target.def, pieceDef(manifest, id)));
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
