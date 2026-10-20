// Saved tables: a file holding a table's state and the module it's played
// with, so a group can pick up where they left off at a new table.
//
// {
//   format: "simple-tabletop-save", formatVersion: 1,
//   manifestUrl, moduleName, moduleVersion, savedAt,
//   state: { sequence, seating, pieces, containers }
// }
//
// state is the table as the server stores it (see state/actions.js), with
// nobody holding or dragging anything. Players and seats aren't saved; the
// new table gets its own.

import { containerDef, pieceDef } from "./objects";

export const SAVE_FORMAT = "simple-tabletop-save";
const FORMAT_VERSION = 1;
export const MAX_SAVE_BYTES = 5_000_000;

export function savedTable({ manifestUrl, manifest, state, savedAt = new Date().toISOString() }) {
  return {
    format: SAVE_FORMAT,
    formatVersion: FORMAT_VERSION,
    manifestUrl,
    moduleName: manifest.name,
    moduleVersion: manifest.version,
    savedAt,
    state: {
      sequence: state.sequence,
      seating: state.seating,
      pieces: letGo(state.pieces),
      containers: letGo(state.containers),
    },
  };
}

// A file name for a save: "cards-2026-10-21.table.json".
export function saveFileName(manifest, savedAt) {
  return `${manifest.id}-${savedAt.slice(0, 10)}.table.json`;
}

// Parses a save file's text, or throws an Error saying what's wrong with it.
export function readSave(text) {
  if (text.length > MAX_SAVE_BYTES) throw new Error("That file is too big to be a saved table.");
  let save;
  try {
    save = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a saved table.");
  }
  if (save?.format !== SAVE_FORMAT) throw new Error("That file isn't a saved table.");
  if (save.formatVersion !== FORMAT_VERSION) throw new Error("That saved table is from a newer version of Simple Tabletop.");
  const { state } = save;
  if (typeof save.manifestUrl !== "string" || !isObject(state?.pieces) || !isObject(state?.containers) ||
      !Number.isInteger(state.sequence) || state.sequence < 0) {
    throw new Error("That saved table is missing parts.");
  }
  return save;
}

// The saved state for a table with this manifest: { state, dropped }, where
// dropped lists the ids of pieces and containers the module no longer has,
// which the new table leaves out, along with anything inside them.
export function restoreState(manifest, save) {
  const dropped = [];
  const pieces = {};
  for (const [id, piece] of Object.entries(save.state.pieces)) {
    if (pieceDef(manifest, id)) pieces[id] = piece;
    else dropped.push(id);
  }
  const draft = { sequence: save.state.sequence, seating: save.state.seating || "four", players: {}, pieces, containers: {} };
  const containers = {};
  for (const [id, container] of Object.entries(save.state.containers)) {
    if (knownContainer(manifest, { ...draft, containers: { [id]: container } }, id)) {
      containers[id] = { ...container, members: container.members.filter((member) => pieces[member]) };
    } else {
      dropped.push(id);
    }
  }
  // Pieces in a container that's gone go with it.
  for (const [id, piece] of Object.entries(pieces)) {
    if (piece.containerId && !containers[piece.containerId]) {
      delete pieces[id];
      dropped.push(id);
    }
  }
  return { state: { ...draft, pieces, containers }, dropped };
}

function knownContainer(manifest, state, id) {
  try {
    const def = containerDef(manifest, state, id);
    return Boolean(def && (def.kind !== "hand" || def.seatId));
  } catch {
    return false;
  }
}

function letGo(objects) {
  return Object.fromEntries(Object.entries(objects).map(([id, object]) => {
    const { carrying: _carrying, ...rest } = object;
    return [id, { ...rest, heldBy: null, drag: null }];
  }));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
