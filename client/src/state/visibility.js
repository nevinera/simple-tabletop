// What a player at `viewerSeat` gets to see of an object: the image on its
// visible side and its size, or null when there's nothing to show. Cards in
// your own hand show their face, cards in anyone else's show their back, and
// a deck shows its top. A die shows { die, value } instead of an image, a
// pawn { pawn: { shape, color } }, and a bag what's in it (see bagContents).

import { backOf, faceOf, findObject, pieceDef } from "./objects";

// Whether Alt or a magnify tap works on an object: only things on the top
// layer, not boards.
export function magnifiable(manifest, state, id) {
  const object = id && findObject(manifest, state, id);
  return Boolean(object && object.def.layer.id === manifest.layers.at(-1).id);
}

export function visibleSide(manifest, state, id, viewerSeat) {
  const object = id && findObject(manifest, state, id);
  if (!object) return null;

  if (object.kind === "container") {
    if (object.def.kind === "bag") return bagContents(manifest, object);
    if (object.def.kind === "stack") return visibleSide(manifest, state, object.state.members[0], viewerSeat);
    if (object.def.kind !== "deck") return null;
    const top = object.state.members[0];
    if (object.def.image) return { image: object.def.image, size: object.def.size };
    if (!top) return null;
    const card = pieceDef(manifest, top);
    const cardState = state.pieces[top];
    return { image: object.state.faceUp ? faceOf(card, cardState) : backOf(card, cardState), size: object.def.size };
  }

  const { def, state: piece } = object;
  if (def.shape === "die") return { die: def.die, value: piece.value };
  if (def.kind === "pawn") return { pawn: { shape: def.shape, color: def.color } };
  if (piece.containerId) {
    const container = findObject(manifest, state, piece.containerId);
    if (container.def.kind === "stack") return { image: piece.faceUp ? faceOf(def, piece) : backOf(def, piece), size: def.size };
    if (container.def.kind !== "hand") return null;
    return { image: container.def.seatId === viewerSeat ? faceOf(def, piece) : backOf(def, piece), size: def.size };
  }
  return { image: piece.faceUp ? faceOf(def, piece) : backOf(def, piece), size: def.size };
}

// The distinct things in a bag: { title, contents: [{ key, name, count,
// side }] }, most plentiful first. Pieces of one type count together, as do
// untyped pieces that look the same. An infinite bag's one entry has a null
// count.
function bagContents(manifest, bag) {
  const title = bag.def.text;
  if (bag.def.template) return { title, contents: [{ ...describeKind(bag.def.template), count: null }] };
  const kinds = new Map();
  for (const id of bag.state.members) {
    const kind = describeKind(pieceDef(manifest, id));
    const seen = kinds.get(kind.key);
    if (seen) seen.count += 1;
    else kinds.set(kind.key, { ...kind, count: 1 });
  }
  return { title, contents: [...kinds.values()].sort((a, b) => b.count - a.count) };
}

function describeKind(def) {
  if (def.shape === "die") {
    return { key: def.type || `die:${def.die.name}:${def.die.color}`, name: def.type || def.die.name, side: { die: def.die, value: def.value } };
  }
  if (def.kind === "pawn") {
    return { key: def.type || `pawn:${def.shape}:${def.color}`, name: def.type, side: { pawn: { shape: def.shape, color: def.color } } };
  }
  return {
    key: def.type || `face:${def.face.url}#${def.face.index ?? ""}`,
    name: def.type,
    side: { image: def.face, size: def.size },
  };
}
