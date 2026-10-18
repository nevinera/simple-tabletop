// Pieces and containers share one id space, so actions and pointer code can
// treat them alike as objects on the table. findObject gives back the
// object's definition (what it is) and its state (where it is).

const MIN_DECK_CARDS = 2; // an empty or one-card deck is still this many cards tall
const MAX_DECK_CARDS = 40;
const DECK_GROWTH = 30; // cards; how fast a deck approaches its full height

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
  if (container) return { kind: "container", id, def: containerDef(manifest, id, container), state: container };
  return null;
}

// A container's definition comes from the manifest, or, for one made during
// play, from the spec in its state.
export function containerDef(manifest, id, containerState) {
  const fromManifest = manifest.containers.find((c) => c.id === id);
  if (fromManifest) return { ...fromManifest, shape: "rect" };
  const { spec } = containerState;
  return {
    id,
    kind: spec.kind,
    shape: "rect",
    size: spec.size,
    layer: manifest.layers.find((layer) => layer.id === spec.layer),
    image: null,
    accepts: spec.accepts,
  };
}

// Every object sitting loose on the table: pieces outside containers, and
// containers.
export function looseObjects(manifest, state) {
  const objects = [];
  for (const def of manifest.pieces) {
    const piece = state.pieces[def.id];
    if (!piece.containerId && piece.x != null) objects.push({ kind: "piece", id: def.id, def, state: piece });
  }
  for (const [id, container] of Object.entries(state.containers)) {
    objects.push({ kind: "container", id, def: containerDef(manifest, id, container), state: container });
  }
  return objects;
}

export function accepts(containerDef, pieceDef) {
  if (!containerDef.accepts) return true;
  return containerDef.accepts.some((matcher) =>
    (!matcher.type || matcher.type === pieceDef.type) &&
    (!matcher.category || pieceDef.categories.includes(matcher.category)));
}

// How many cards thick a deck of `count` cards looks: never less than 2,
// rising toward 40 as the deck grows.
export function deckCards(count) {
  const extra = Math.max(count - 1, 0);
  return MIN_DECK_CARDS + (MAX_DECK_CARDS - MIN_DECK_CARDS) * (1 - Math.exp(-extra / DECK_GROWTH));
}

// The height of an object's top above its layer's base.
export function objectHeight(object) {
  if (object.kind === "piece") return object.def.layer.thickness;
  return object.def.layer.thickness * deckCards(object.state.members.length);
}
