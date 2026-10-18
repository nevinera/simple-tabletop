// What a player at `viewerSeat` gets to see of an object: the image on its
// visible side and its size, or null when there's nothing to show. Cards in
// your own hand show their face, cards in anyone else's show their back, and
// a deck shows its top. A die shows { die, value } instead of an image.

import { findObject, pieceDef } from "./objects";

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
    if (object.def.kind !== "deck") return null;
    const top = object.state.members[0];
    if (object.def.image) return { image: object.def.image, size: object.def.size };
    if (!top) return null;
    const card = pieceDef(manifest, top);
    return { image: object.state.faceUp ? card.face : card.back, size: object.def.size };
  }

  const { def, state: piece } = object;
  if (def.shape === "die") return { die: def.die, value: piece.value };
  if (piece.containerId) {
    const container = findObject(manifest, state, piece.containerId);
    if (container.def.kind !== "hand") return null;
    return { image: container.def.seatId === viewerSeat ? def.face : def.back, size: def.size };
  }
  return { image: piece.faceUp ? def.face : def.back, size: def.size };
}
