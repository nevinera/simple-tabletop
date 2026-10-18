// Table state and the actions that change it. This mirrors what the server
// will store and accept (see docs/architecture.md), so the client can run
// against a local store now and the server later.
//
// State:
//   sequence:   bumped on every saved change; drag doesn't count
//   pieces:     { [id]: { x, y, rotation, faceUp, stackOrder, containerId, heldBy, drag, locked } }
//   containers: { [id]: { x, y, rotation, faceUp, members, heldBy, drag, locked, spec } }
//
// drag is the in-progress position of a held object, { x, y }, or null. The
// server relays it without saving it. members runs top first. spec describes
// a container made during play, which the manifest doesn't list:
// { kind, size, layer, accepts }.

import { landing } from "./footprint";
import { findObject } from "./objects";

export function initialState(manifest) {
  const containerOf = new Map();
  for (const container of manifest.containers) {
    for (const member of container.members) containerOf.set(member, container.id);
  }

  const nextOrder = new Map(); // layer id -> next stackOrder
  const pieces = {};
  for (const piece of manifest.pieces) {
    const order = nextOrder.get(piece.layer.id) || 0;
    nextOrder.set(piece.layer.id, order + 1);
    pieces[piece.id] = {
      x: piece.position?.[0] ?? null,
      y: piece.position?.[1] ?? null,
      rotation: piece.rotation,
      faceUp: piece.faceUp,
      stackOrder: order,
      containerId: containerOf.get(piece.id) || null,
      heldBy: null,
      drag: null,
      locked: piece.fixed,
    };
  }

  const containers = {};
  for (const container of manifest.containers) {
    containers[container.id] = {
      x: container.position[0],
      y: container.position[1],
      rotation: container.rotation,
      faceUp: container.faceUp,
      members: [...container.members],
      heldBy: null,
      drag: null,
      locked: container.fixed,
    };
  }

  return { sequence: 0, pieces, containers };
}

// Applies one action. Returns { ok: true, state } with a new state object, or
// { ok: false, reason, state } with the state unchanged. A rejection for
// overlapping another object also carries blocked: true.
//
// Actions all carry { type, id, playerId }, where id names a piece or a
// container, plus:
//   drag:     { x, y }
//   drop:     { x, y }
//   rotate:   { degrees }, positive is clockwise
//   shuffle:  { order }, the deck's members in their new order
//   makeDeck: { deckId }, the id for the new deck
export function applyAction(manifest, state, action) {
  const handler = HANDLERS[action.type];
  if (!handler) return reject(state, `Unknown action "${action.type}".`);

  const object = findObject(manifest, state, action.id);
  if (!object) return reject(state, `Unknown object "${action.id}".`);
  if (object.state.containerId) return reject(state, "That's in a container.");
  if (object.state.heldBy && object.state.heldBy !== action.playerId) return reject(state, "Someone else is holding that.");

  return handler({ manifest, state, action, object, kind: object.kind, def: object.def });
}

const HANDLERS = {
  grab({ state, action, object }) {
    if (object.state.locked) return reject(state, "That's locked.");
    return save(state, object, { heldBy: action.playerId });
  },

  drag({ state, action, object }) {
    if (object.state.heldBy !== action.playerId) return reject(state, "Grab it first.");
    return unsaved(state, object, { drag: { x: action.x, y: action.y } });
  },

  drop({ manifest, state, action, object }) {
    if (object.state.heldBy !== action.playerId) return reject(state, "Grab it first.");
    const target = landing(manifest, state, object.id, action.x, action.y, object.state.rotation);
    if (target.blocked) return blocked(state);
    const letGo = { heldBy: null, drag: null };
    if (target.into) return addToContainer(state, object, target.into, letGo);
    const changes = { ...letGo, x: action.x, y: action.y };
    if (object.kind === "piece") changes.stackOrder = topOfLayer(manifest, state, object.def.layer.id);
    return save(state, object, changes);
  },

  release({ state, action, object }) {
    if (object.state.heldBy !== action.playerId) return reject(state, "You aren't holding that.");
    return save(state, object, { heldBy: null, drag: null });
  },

  // Flip, rotate, and lock also work on an object nobody holds, for hover keys.
  flip({ state, kind, object }) {
    if (kind !== "piece") return reject(state, "Decks can't be flipped.");
    if (object.state.locked) return reject(state, "That's locked.");
    return save(state, object, { faceUp: !object.state.faceUp });
  },

  rotate({ manifest, state, action, object }) {
    if (object.state.locked) return reject(state, "That's locked.");
    if (!Number.isFinite(action.degrees)) return reject(state, "rotate needs degrees.");
    const rotation = normalizeDegrees(object.state.rotation + action.degrees);
    // A held object is off the table; dropping it checks for overlap instead.
    if (!object.state.heldBy && landing(manifest, state, object.id, object.state.x, object.state.y, rotation).blocked) {
      return blocked(state);
    }
    return save(state, object, { rotation });
  },

  // Locking something you hold puts it back where it was first.
  lock({ state, object }) {
    return save(state, object, { locked: !object.state.locked, heldBy: null, drag: null });
  },

  // Takes the top card off a deck, held by the player who drew it, so they
  // can place it.
  draw({ manifest, state, action, kind, def, object }) {
    if (kind !== "container" || def.kind !== "deck") return reject(state, "Only decks can be drawn from.");
    const [top, ...rest] = object.state.members;
    if (!top) return reject(state, "That deck is empty.");
    const deck = object.state;
    const card = findObject(manifest, state, top);
    const withDeck = withObject(state, object, { members: rest });
    return save(withDeck, card, {
      containerId: null,
      x: deck.x,
      y: deck.y,
      rotation: deck.rotation,
      faceUp: deck.faceUp,
      stackOrder: topOfLayer(manifest, state, card.def.layer.id),
      heldBy: action.playerId,
      drag: null,
    });
  },

  shuffle({ state, action, kind, object }) {
    if (kind !== "container") return reject(state, "Only containers can be shuffled.");
    const members = object.state.members;
    const order = action.order;
    const same = Array.isArray(order) && order.length === members.length &&
      [...order].sort().join("\n") === [...members].sort().join("\n");
    if (!same) return reject(state, "shuffle needs the deck's members in a new order.");
    return save(state, object, { members: [...order] });
  },

  makeDeck({ state, action, kind, def, object }) {
    if (kind !== "piece" || def.shape !== "rect") return reject(state, "Only cards can become decks.");
    if (!action.deckId || state.pieces[action.deckId] || state.containers[action.deckId]) {
      return reject(state, "makeDeck needs an unused deckId.");
    }
    const card = object.state;
    const deck = {
      x: card.x,
      y: card.y,
      rotation: card.rotation,
      faceUp: card.faceUp,
      members: [],
      heldBy: null,
      drag: null,
      locked: card.locked,
      spec: { kind: "deck", size: def.size, layer: def.layer.id, accepts: def.type ? [{ type: def.type }] : null },
    };
    const withDeck = { ...state, containers: { ...state.containers, [action.deckId]: deck } };
    return addToContainer(withDeck, object, action.deckId, { heldBy: null, drag: null, locked: false });
  },
};

// Puts a piece on top of a container, facing the way the container does.
function addToContainer(state, piece, containerId, changes) {
  const container = state.containers[containerId];
  const withContainer = withObject(state, { kind: "container", id: containerId }, {
    members: [piece.id, ...container.members],
  });
  return save(withContainer, piece, {
    ...changes,
    containerId,
    x: null,
    y: null,
    faceUp: container.faceUp,
  });
}

function topOfLayer(manifest, state, layerId) {
  let top = -1;
  for (const def of manifest.pieces) {
    const piece = state.pieces[def.id];
    if (def.layer.id === layerId && !piece.containerId) top = Math.max(top, piece.stackOrder);
  }
  return top + 1;
}

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function save(state, object, changes) {
  return { ok: true, state: { ...withObject(state, object, changes), sequence: state.sequence + 1 } };
}

function unsaved(state, object, changes) {
  return { ok: true, state: withObject(state, object, changes) };
}

function withObject(state, { kind, id }, changes) {
  const key = kind === "piece" ? "pieces" : "containers";
  return { ...state, [key]: { ...state[key], [id]: { ...state[key][id], ...changes } } };
}

function reject(state, reason) {
  return { ok: false, reason, state };
}

function blocked(state) {
  return { ...reject(state, "That would overlap something."), blocked: true };
}
