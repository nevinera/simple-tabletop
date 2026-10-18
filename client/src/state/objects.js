// Pieces and containers share one id space, so actions and pointer code can
// treat them alike as objects on the table. findObject gives back the
// object's definition (what it is) and its state (where it is).

import { activeSeats, handPlacement } from "./seats";

const MIN_DECK_BOARDS = 2; // an empty or one-card deck is this many board layers tall
const MAX_DECK_HEIGHT = 6; // times the shortest a deck gets
const DECK_GROWTH = 30; // cards; how fast a deck approaches its full height

export const HAND_TRAY_HEIGHT = 0.15; // cm
const HAND_MARGIN = 0.5; // cm kept clear at each end of a hand tray
const HAND_SPACING = 1.08; // times the card width, when there's room

const pieceIndexes = new WeakMap();

export function pieceDef(manifest, id) {
  if (!pieceIndexes.has(manifest)) pieceIndexes.set(manifest, new Map(manifest.pieces.map((p) => [p.id, p])));
  return pieceIndexes.get(manifest).get(id);
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

// Twice the board layer, so even a one-card deck doesn't pass for a card.
function deckMinHeight(manifest) {
  const board = manifest.layers.find((layer) => layer.id === "board") || manifest.layers[0];
  return board.thickness * MIN_DECK_BOARDS;
}

// Every object sitting loose on the table: pieces outside containers, and
// containers, including the hands of occupied seats.
export function looseObjects(manifest, state) {
  const objects = [];
  for (const def of manifest.pieces) {
    const piece = state.pieces[def.id];
    if (!piece.containerId && piece.x != null) objects.push({ kind: "piece", id: def.id, def, state: piece });
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

export function accepts(containerDef, pieceDef) {
  if (!containerDef.accepts) return true;
  return containerDef.accepts.some((matcher) =>
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

// The height of an object's top above its layer's base.
export function objectHeight(object) {
  if (object.kind === "piece") return object.def.layer.thickness;
  if (object.def.kind === "hand") return HAND_TRAY_HEIGHT;
  return deckHeight(object.def, object.state.members.length);
}
