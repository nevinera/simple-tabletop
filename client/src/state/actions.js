// Table state and the actions that change it. This mirrors what the server
// will store and accept (see docs/architecture.md), so the client can run
// against a local store now and the server later.
//
// State:
//   sequence:   bumped on every saved change; drag doesn't count
//   pieces:     { [id]: { x, y, rotation, faceUp, stackOrder, containerId, heldBy, drag } }
//   containers: { [id]: { x, y, rotation, members, heldBy } }
//
// drag is the in-progress position of a held piece, { x, y }, or null. The
// server relays it without saving it.

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
    };
  }

  const containers = {};
  for (const container of manifest.containers) {
    containers[container.id] = {
      x: container.position[0],
      y: container.position[1],
      rotation: container.rotation,
      members: [...container.members],
      heldBy: null,
    };
  }

  return { sequence: 0, pieces, containers };
}

// Applies one action. Returns { ok: true, state } with a new state object, or
// { ok: false, reason, state } with the state unchanged.
//
// Actions all carry { type, pieceId, playerId }, plus:
//   drag:   { x, y }
//   drop:   { x, y }
//   rotate: { degrees }, positive is clockwise
export function applyAction(manifest, state, action) {
  const handler = HANDLERS[action.type];
  if (!handler) return reject(state, `Unknown action "${action.type}".`);

  const def = manifest.pieces.find((p) => p.id === action.pieceId);
  const piece = state.pieces[action.pieceId];
  if (!def || !piece) return reject(state, `Unknown piece "${action.pieceId}".`);
  if (def.fixed) return reject(state, "That piece is fixed.");
  if (piece.containerId) return reject(state, "That piece is in a container.");

  return handler({ manifest, state, action, piece, def });
}

const HANDLERS = {
  grab({ state, action, piece }) {
    if (piece.heldBy && piece.heldBy !== action.playerId) return reject(state, "Someone else is holding that.");
    return save(state, action.pieceId, { heldBy: action.playerId });
  },

  drag({ state, action, piece }) {
    if (piece.heldBy !== action.playerId) return reject(state, "Grab it first.");
    return unsaved(state, action.pieceId, { drag: { x: action.x, y: action.y } });
  },

  drop({ manifest, state, action, piece, def }) {
    if (piece.heldBy !== action.playerId) return reject(state, "Grab it first.");
    return save(state, action.pieceId, {
      x: action.x,
      y: action.y,
      stackOrder: topOfLayer(manifest, state, def.layer.id),
      heldBy: null,
      drag: null,
    });
  },

  release({ state, action, piece }) {
    if (piece.heldBy !== action.playerId) return reject(state, "You aren't holding that.");
    return save(state, action.pieceId, { heldBy: null, drag: null });
  },

  // Flip and rotate also work on a piece nobody holds, for hover keys.
  flip({ state, action, piece }) {
    if (piece.heldBy && piece.heldBy !== action.playerId) return reject(state, "Someone else is holding that.");
    return save(state, action.pieceId, { faceUp: !piece.faceUp });
  },

  rotate({ state, action, piece }) {
    if (piece.heldBy && piece.heldBy !== action.playerId) return reject(state, "Someone else is holding that.");
    if (!Number.isFinite(action.degrees)) return reject(state, "rotate needs degrees.");
    return save(state, action.pieceId, { rotation: normalizeDegrees(piece.rotation + action.degrees) });
  },
};

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

function save(state, pieceId, changes) {
  return { ok: true, state: { ...withPiece(state, pieceId, changes), sequence: state.sequence + 1 } };
}

function unsaved(state, pieceId, changes) {
  return { ok: true, state: withPiece(state, pieceId, changes) };
}

function withPiece(state, pieceId, changes) {
  return { ...state, pieces: { ...state.pieces, [pieceId]: { ...state.pieces[pieceId], ...changes } } };
}

function reject(state, reason) {
  return { ok: false, reason, state };
}
