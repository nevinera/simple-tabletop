// Pieces and containers share one id space, so actions and pointer code can
// treat them alike as objects on the table. findObject gives back the
// object's definition (what it is) and its state (where it is).

import { activeSeats, handPlacement } from "./seats";

const MIN_DECK_BOARDS = 2; // an empty or one-card deck is this many board layers tall
const MAX_DECK_HEIGHT = 6; // times the shortest a deck gets
const DECK_GROWTH = 30; // cards; how fast a deck approaches its full height

export const HAND_TRAY_HEIGHT = 0.15; // cm
export const DICE_TRAY_FLOOR = 0.2; // cm
export const DICE_TRAY_WALL = 1.2; // cm above the table
const DIE_HEIGHT = 0.85; // times its size, roughly, whatever its shape
const HAND_MARGIN = 0.5; // cm kept clear at each end of a hand tray
const HAND_SPACING = 1.08; // times the card width, when there's room
const BAG_HEIGHT = 0.4; // times a bag's shorter side
export const STACK_SHOWN = 5; // a stack grows up to this many pieces tall, then shows a count instead
const STACKABLE = ["tile", "chip", "token"];

const pieceIndexes = new WeakMap();

// A piece's definition: from the manifest, or for a piece drawn from an
// infinite bag, a copy of the bag's template under the piece's own id.
export function pieceDef(manifest, id) {
  if (!pieceIndexes.has(manifest)) pieceIndexes.set(manifest, new Map(manifest.pieces.map((p) => [p.id, p])));
  const index = pieceIndexes.get(manifest);
  if (!index.has(id)) {
    const bag = manifest.containers.find((c) => c.template && id.startsWith(`${c.id}#`));
    if (!bag) return undefined;
    index.set(id, { ...bag.template, id });
  }
  return index.get(id);
}

// The id for the nth piece drawn from an infinite bag. Module ids can't hold
// "#", so these never clash with them.
export function spawnedId(bagId, n) {
  return `${bagId}#${n}`;
}

// { kind: "piece" | "container", id, def, state }, or null.
export function findObject(manifest, state, id) {
  const piece = state.pieces[id];
  if (piece) return { kind: "piece", id, def: pieceDef(manifest, id), state: piece };
  const container = state.containers[id];
  if (container) return { kind: "container", id, def: containerDef(manifest, state, id), state: container };
  return null;
}

// A container's definition comes from the manifest, or, for one made during
// play, from the spec in its state. Hands follow their seat.
export function containerDef(manifest, state, id) {
  const fromManifest = manifest.containers.find((c) => c.id === id);
  if (fromManifest?.kind === "stack" || state.containers[id]?.spec?.kind === "stack") {
    return stackDef(manifest, state, id, fromManifest);
  }
  if (fromManifest) return { ...fromManifest, shape: "rect", minHeight: deckMinHeight(manifest) };
  const { spec } = state.containers[id];
  if (spec.kind === "hand") {
    const seat = manifest.seats.find((s) => s.id === spec.seatId);
    const placement = handPlacement(manifest, state, seat);
    return {
      id,
      kind: "hand",
      shape: "rect",
      seatId: seat.id,
      size: placement.size,
      position: placement.position,
      rotation: placement.rotation,
      layer: manifest.layers.at(-1),
      image: null,
      accepts: null,
    };
  }
  return {
    id,
    kind: spec.kind,
    shape: "rect",
    size: spec.size,
    layer: manifest.layers.find((layer) => layer.id === spec.layer),
    image: null,
    accepts: spec.accepts,
    minHeight: deckMinHeight(manifest),
  };
}

// A stack looks like the pieces in it, and takes more of the same.
function stackDef(manifest, state, id, fromManifest) {
  const piece = pieceDef(manifest, state.containers[id].members[0]);
  return {
    id,
    kind: "stack",
    shape: piece.shape,
    size: piece.size,
    layer: piece.layer,
    thickness: piece.thickness,
    stackKey: stackKey(piece),
    image: null,
    accepts: null,
    fixed: fromManifest?.fixed || false,
  };
}

// Tiles, chips, and tokens stack with others just like them.
export function canStack(def) {
  return STACKABLE.includes(def.kind);
}

// What makes pieces alike enough to stack: the same piece type, or for
// untyped pieces, the same kind, shape, size, and images.
export function stackKey(def) {
  if (def.type) return `type:${def.type}`;
  const image = (img) => (img ? `${img.url}#${img.index ?? ""}` : "");
  return `look:${def.kind}|${def.shape}|${def.size.join("x")}|${image(def.face)}|${image(def.back)}`;
}

// Twice the board layer, so even a one-card deck doesn't pass for a card.
function deckMinHeight(manifest) {
  const board = manifest.layers.find((layer) => layer.id === "board") || manifest.layers[0];
  return board.thickness * MIN_DECK_BOARDS;
}

// Every object sitting loose on the table: pieces outside containers, and
// containers, including the hands of occupied seats.
export function looseObjects(manifest, state) {
  const objects = [];
  for (const [id, piece] of Object.entries(state.pieces)) {
    if (!piece.containerId && piece.x != null) objects.push({ kind: "piece", id, def: pieceDef(manifest, id), state: piece });
  }
  const taken = new Set(Object.values(state.players).map((player) => player.seatId));
  const seats = new Set(activeSeats(manifest, state).map((seat) => seat.id).filter((id) => taken.has(id)));
  for (const [id, container] of Object.entries(state.containers)) {
    if (container.spec?.kind === "hand" && !seats.has(container.spec.seatId)) continue;
    objects.push({ kind: "container", id, def: containerDef(manifest, state, id), state: container });
  }
  return objects;
}

// Where an object rests: hands where their seat puts them, everything else
// where its state says.
export function restingSpot(object) {
  if (object.def.kind === "hand") {
    return { x: object.def.position[0], y: object.def.position[1], rotation: object.def.rotation };
  }
  return { x: object.state.x, y: object.state.y, rotation: object.state.rotation };
}

// Spots for `count` cards spread across a hand tray, left to right as its
// player sees them, as table { x, y }.
export function handSlots(handDef, count, cardWidth) {
  const [width] = handDef.size;
  const room = Math.max(width - 2 * HAND_MARGIN - cardWidth, 0);
  const spacing = count > 1 ? Math.min(cardWidth * HAND_SPACING, room / (count - 1)) : 0;
  const [axisX, axisY] = handAxis(handDef);
  return Array.from({ length: count }, (_, i) => {
    const along = (i - (count - 1) / 2) * spacing;
    return { x: handDef.position[0] + axisX * along, y: handDef.position[1] + axisY * along };
  });
}

// Where a card dropped at (x, y) goes among a hand's cards: before the first
// card whose spot lies further along the tray.
export function handIndex(handDef, slots, x, y) {
  const [axisX, axisY] = handAxis(handDef);
  const along = ({ x: px, y: py }) => (px - handDef.position[0]) * axisX + (py - handDef.position[1]) * axisY;
  const point = along({ x, y });
  const index = slots.findIndex((slot) => along(slot) > point);
  return index === -1 ? slots.length : index;
}

// The player's left-to-right direction along a tray, in table coordinates.
function handAxis(handDef) {
  const radians = (handDef.rotation * Math.PI) / 180;
  return [Math.cos(radians), -Math.sin(radians)];
}

// What each kind of container takes, before its own accepts list: trays
// take dice, decks take cards, hands take cards and tiles, and bags take
// anything but boards.
const CONTAINER_TAKES = {
  tray: ["die"],
  deck: ["card"],
  hand: ["card", "tile"],
  bag: ["card", "tile", "chip", "token", "die"],
};

export function accepts(containerDef, pieceDef) {
  if (containerDef.kind === "stack") return canStack(pieceDef) && stackKey(pieceDef) === containerDef.stackKey;
  if (!CONTAINER_TAKES[containerDef.kind]?.includes(pieceDef.kind)) return false;
  if (!containerDef.accepts) return true;
  return containerDef.accepts.some((matcher) =>
    (!matcher.shape || matcher.shape === pieceDef.shape) &&
    (!matcher.type || matcher.type === pieceDef.type) &&
    (!matcher.category || pieceDef.categories.includes(matcher.category)));
}

// How tall a deck of `count` cards looks: its minimum with 0 or 1 cards,
// rising toward six times that as the deck grows.
export function deckHeight(deckDef, count) {
  const extra = Math.max(count - 1, 0);
  const min = deckDef.minHeight;
  return min + (min * MAX_DECK_HEIGHT - min) * (1 - Math.exp(-extra / DECK_GROWTH));
}

// A stack grows a piece taller per piece, up to STACK_SHOWN.
export function stackHeight(stackDef, count) {
  return stackDef.thickness * Math.min(count, STACK_SHOWN);
}

export function bagHeight(bagDef) {
  return Math.min(...bagDef.size) * BAG_HEIGHT;
}

// The height of an object's top above its layer's base.
export function objectHeight(object) {
  if (object.kind === "piece") return object.def.shape === "die" ? object.def.size[0] * DIE_HEIGHT : object.def.thickness;
  if (object.def.kind === "hand") return HAND_TRAY_HEIGHT;
  if (object.def.kind === "tray") return DICE_TRAY_WALL;
  if (object.def.kind === "bag") return bagHeight(object.def);
  if (object.def.kind === "stack") return stackHeight(object.def, object.state.members.length);
  return deckHeight(object.def, object.state.members.length);
}
