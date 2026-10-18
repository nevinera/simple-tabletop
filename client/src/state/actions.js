// Table state and the actions that change it. This mirrors what the server
// will store and accept (see docs/architecture.md), so the client can run
// against a local store now and the server later.
//
// State:
//   sequence:   bumped on every saved change; drag doesn't count
//   seating:    "four" or "eight"; see state/seats.js
//   players:    { [playerId]: { seatId } }
//   pieces:     { [id]: { x, y, rotation, faceUp, stackOrder, containerId, heldBy, drag, locked } },
//               plus { value, rolls } for dice
//   containers: { [id]: { x, y, rotation, faceUp, members, heldBy, drag, locked, spec } },
//               plus { spots } for trays (see state/trays.js), and { spawned }
//               for infinite bags, counting the pieces they've handed out
//
// Pieces drawn from an infinite bag join pieces under ids from spawnedId(),
// and leave it again when they go back in. A stack made during play gets the
// id "#stack-<sequence>" and spec { kind: "stack" }, and goes away once only
// one piece is left in it.
//
// rolls counts a die's rolls, so every browser can show each one.
//
// drag is the in-progress position of a held object, { x, y }, or null. The
// server relays it without saving it. members runs top first, or left to
// right in a hand. spec describes a container the manifest doesn't list: a
// deck made during play, { kind, size, layer, accepts }, or a seat's hand,
// { kind: "hand", seatId }. A card dropped on a card like it makes a deck
// with the id "#deck-<sequence>".
//
// Decks also carry splay, the way their cards fan out (see SPLAY_DIRECTIONS)
// or null, and splayDistance, a player's spacing for the fan or null for the
// deck's own.

import { landing } from "./footprint";
import { SPLAY_DIRECTIONS, accepts, fanSpots, findObject, handIndex, handSlots, pieceDef, spawnedId } from "./objects";
import { nearestFree, scatter, seededRandom, toTray } from "./trays";
import { handId, openSeats, seatOf } from "./seats";

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
      ...newPiece(piece),
      x: piece.position?.[0] ?? null,
      y: piece.position?.[1] ?? null,
      stackOrder: order,
      containerId: containerOf.get(piece.id) || null,
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
    if (container.template) containers[container.id].spawned = 0;
    if (container.kind === "deck") Object.assign(containers[container.id], { splay: container.splay, splayDistance: null });
    if (container.kind === "tray") {
      // The same starting layout in every browser.
      const dice = container.members.map((id) => pieceDef(manifest, id));
      containers[container.id].spots = scatter(container, dice, seededRandom(container.id)) || {};
    }
  }

  if (manifest.hands.enabled) {
    for (const seat of manifest.seats) {
      containers[handId(seat.id)] = {
        x: null,
        y: null,
        rotation: 0,
        faceUp: true,
        members: [],
        heldBy: null,
        drag: null,
        locked: false,
        spec: { kind: "hand", seatId: seat.id },
      };
    }
  }

  return { sequence: 0, seating: "four", players: {}, pieces, containers };
}

// Applies one action. Returns { ok: true, state } with a new state object, or
// { ok: false, reason, state } with the state unchanged. A rejection for
// overlapping another object also carries blocked: true.
//
// join carries { type, playerId, seatId }, and leave { type, playerId }.
// Every other action carries { type, id, playerId }, where id names a piece
// or a container, plus:
//   drag:     { x, y }
//   drop:     { x, y }, or { into, index } to put a piece in a hand
//   draw:     { toHand: true } to draw into the player's hand, plus { pick },
//             the member to take, for a bag that isn't infinite
//   roll:     { values } for a die or a tray's dice, { [dieId]: face index },
//             plus { spots } for a tray
//   rotate:   { degrees }, positive is clockwise
//   shuffle:  { order }, the deck's members in their new order
//   reorder:  { order }, the same, for an order a player chose
//   makeDeck: { deckId }, the id for the new deck
//   splay:    { direction }, a SPLAY_DIRECTIONS key or null to close the
//             deck up, plus { distance } in cm to change its spacing
export function applyAction(manifest, state, action) {
  if (SEAT_HANDLERS[action.type]) return SEAT_HANDLERS[action.type]({ manifest, state, action });
  const handler = HANDLERS[action.type];
  if (!handler) return reject(state, `Unknown action "${action.type}".`);

  const object = findObject(manifest, state, action.id);
  if (!object) return reject(state, `Unknown object "${action.id}".`);
  if (object.def.kind === "hand") return reject(state, "Hands stay with their seat.");
  // Players can pick up, move, and put back cards in their own hand or a
  // splayed deck, and dice in a tray, that nobody else holds.
  if (object.state.containerId && !reachableMember(state, object, action)) return reject(state, "That's in a container.");
  if (object.state.heldBy && object.state.heldBy !== action.playerId) return reject(state, "Someone else is holding that.");

  return handler({ manifest, state, action, object, kind: object.kind, def: object.def });
}

const MEMBER_ACTIONS = ["grab", "drag", "drop", "release"];

function reachableMember(state, object, action) {
  const containerId = object.state.containerId;
  if (containerId === ownHand(state, action.playerId)) return MEMBER_ACTIONS.includes(action.type);
  const container = state.containers[containerId];
  const tray = object.def.shape === "die" && container.spots;
  const free = !container.heldBy || container.heldBy === action.playerId;
  if (container.splay && free) return MEMBER_ACTIONS.includes(action.type);
  return Boolean(tray && free && [...MEMBER_ACTIONS, "roll"].includes(action.type));
}

const SEAT_HANDLERS = {
  // Taking a seat that isn't there yet, the other half of a side, splits the
  // table into eight seats for good.
  join({ manifest, state, action }) {
    const seat = openSeats(manifest, state).find((s) => s.id === action.seatId);
    if (!seat) return reject(state, "That seat isn't open.");
    const seating = manifest.seats.indexOf(seat) >= 4 ? "eight" : state.seating;
    const left = state.players[action.playerId] ? leaveSeat(state, action.playerId) : state;
    return {
      ok: true,
      state: {
        ...left,
        seating,
        players: { ...left.players, [action.playerId]: { seatId: seat.id } },
        sequence: state.sequence + 1,
      },
    };
  },

  leave({ state, action }) {
    if (!state.players[action.playerId]) return reject(state, "You aren't seated.");
    return { ok: true, state: { ...leaveSeat(state, action.playerId), sequence: state.sequence + 1 } };
  },
};

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
    const letGo = { heldBy: null, drag: null };
    if (action.into) {
      if (action.into !== ownHand(state, action.playerId)) return reject(state, "That isn't your hand.");
      return addToContainer(manifest, state, object, action.into, letGo, action.index);
    }
    const target = landing(manifest, state, object.id, action.x, action.y, object.state.rotation, action.playerId);
    if (target.blocked) return blocked(state);
    if (target.onto && object.def.kind === "card") return formDeck(manifest, state, object, target.onto, letGo);
    if (target.onto) return formStack(state, object, target.onto, letGo);
    if (target.into && state.containers[target.into].spots) {
      return addToTray(manifest, state, object, target.into, letGo, [action.x, action.y]);
    }
    if (target.into) return addToContainer(manifest, state, object, target.into, letGo, null, [action.x, action.y]);
    const changes = { ...letGo, x: action.x, y: action.y };
    if (object.kind === "piece") changes.stackOrder = topOfLayer(manifest, state, object.def.layer.id);
    if (object.state.containerId) {
      // Played from a hand, a card lands facing the way the hand does, and
      // pulled from a deck's fan, the way the deck does.
      const from = findObject(manifest, state, object.state.containerId);
      changes.containerId = null;
      if (from.def.kind === "hand") changes.rotation = from.def.rotation;
      if (from.def.kind === "deck") Object.assign(changes, { rotation: from.state.rotation, faceUp: from.state.faceUp });
      return save(withoutMember(state, object), object, changes);
    }
    return save(state, object, changes);
  },

  release({ state, action, object }) {
    if (object.state.heldBy !== action.playerId) return reject(state, "You aren't holding that.");
    return save(state, object, { heldBy: null, drag: null });
  },

  // Flip, rotate, and lock also work on an object nobody holds, for hover keys.
  // Flipping a deck turns it over: it faces the other way, and its bottom
  // card comes out on top.
  flip({ state, kind, def, object }) {
    if (object.state.locked) return reject(state, "That's locked.");
    if (kind !== "piece") {
      if (def.kind !== "deck") return reject(state, "Only decks flip among containers.");
      return save(state, object, { faceUp: !object.state.faceUp, members: [...object.state.members].reverse() });
    }
    if (def.kind === "die") return reject(state, "Dice roll instead.");
    if (def.kind === "board") return reject(state, "Boards don't flip.");
    if (def.kind === "standee") return reject(state, "Turn a standee instead.");
    return save(state, object, { faceUp: !object.state.faceUp });
  },

  rotate({ manifest, state, action, object }) {
    if (object.state.locked) return reject(state, "That's locked.");
    if (!Number.isFinite(action.degrees)) return reject(state, "rotate needs degrees.");
    const rotation = normalizeDegrees(object.state.rotation + action.degrees);
    // A held object is off the table; dropping it checks for overlap instead.
    if (!object.state.heldBy && landing(manifest, state, object.id, object.state.x, object.state.y, rotation, action.playerId).blocked) {
      return blocked(state);
    }
    return save(state, object, { rotation });
  },

  // Locking something you hold puts it back where it was first.
  lock({ state, object }) {
    return save(state, object, { locked: !object.state.locked, heldBy: null, drag: null });
  },

  // Takes a piece out of a deck, bag, or stack, held by the player who drew
  // it so they can place it, or with toHand, into their hand. A deck or
  // stack gives its top piece, a bag the member the action picks, and an
  // infinite bag a new piece.
  draw({ manifest, state, action, kind, def, object }) {
    if (kind !== "container" || !["deck", "bag", "stack"].includes(def.kind)) {
      return reject(state, "Only decks, bags, and stacks can be drawn from.");
    }
    let next = state;
    let pieceId;
    if (def.template) {
      // A new piece, sitting in the bag until it comes out below.
      const spawned = object.state.spawned + 1;
      pieceId = spawnedId(def.id, spawned);
      next = withObject(state, object, { spawned });
      const piece = { ...newPiece(def.template), containerId: def.id };
      next = { ...next, pieces: { ...next.pieces, [pieceId]: piece } };
    } else if (def.kind === "bag") {
      if (!object.state.members.length) return reject(state, "That bag is empty.");
      if (!object.state.members.includes(action.pick)) return reject(state, "draw needs a pick from the bag.");
      pieceId = action.pick;
    } else {
      pieceId = object.state.members[0];
      if (!pieceId) return reject(state, "That deck is empty.");
    }

    const piece = findObject(manifest, next, pieceId);
    if (action.toHand) {
      const hand = ownHand(state, action.playerId);
      if (!hand) return reject(state, "You don't have a hand.");
      if (!accepts(findObject(manifest, state, hand).def, piece.def)) return reject(state, "That can't go in a hand.");
      const end = state.containers[hand].members.length;
      return settleStack(manifest, addToContainer(manifest, next, piece, hand, {}, end), object.id);
    }
    // A splayed deck hands out its top card from where it lies in the fan.
    const from = object.state;
    const { x, y } = from.splay ? fanSpots(object)[0] : from;
    const changes = {
      containerId: null,
      x,
      y,
      rotation: from.rotation,
      stackOrder: topOfLayer(manifest, state, piece.def.layer.id),
      heldBy: action.playerId,
      drag: null,
    };
    if (def.kind === "deck") changes.faceUp = from.faceUp;
    return settleStack(manifest, save(withoutMember(next, piece), piece, changes), object.id);
  },

  // A die rolls in place. A tray rolls all its dice and scatters them.
  roll({ manifest, state, action, kind, def, object }) {
    const values = action.values || {};
    const valid = (die) => Number.isInteger(values[die.id]) && values[die.id] >= 0 && values[die.id] < die.die.sides;
    if (kind === "piece") {
      if (def.shape !== "die") return reject(state, "Only dice roll.");
      if (!valid(def)) return reject(state, "roll needs a value for the die.");
      return save(state, object, { value: values[def.id], rolls: object.state.rolls + 1 });
    }
    if (def.kind !== "tray") return reject(state, "Only dice and trays roll.");
    const dice = object.state.members.map((id) => pieceDef(manifest, id));
    const spots = action.spots || {};
    if (!dice.every((die) => valid(die) && Array.isArray(spots[die.id]))) {
      return reject(state, "roll needs a value and a spot for every die in the tray.");
    }
    let next = withObject(state, object, { spots: Object.fromEntries(dice.map((die) => [die.id, spots[die.id]])) });
    for (const die of dice) {
      next = withObject(next, { kind: "piece", id: die.id }, { value: values[die.id], rolls: next.pieces[die.id].rolls + 1 });
    }
    return { ok: true, state: { ...next, sequence: state.sequence + 1 } };
  },

  shuffle({ state, action, def, object }) {
    if (def.kind !== "deck") return reject(state, "Only decks can be shuffled.");
    if (!sameMembers(object.state.members, action.order)) return reject(state, "shuffle needs the deck's members in a new order.");
    return save(state, object, { members: [...action.order] });
  },

  reorder({ state, action, def, object }) {
    if (def.kind !== "deck") return reject(state, "Only decks can be reordered.");
    if (!sameMembers(object.state.members, action.order)) return reject(state, "The deck changed since you opened it.");
    return save(state, object, { members: [...action.order] });
  },

  makeDeck({ manifest, state, action, kind, def, object }) {
    if (kind !== "piece" || def.kind !== "card") return reject(state, "Only cards can become decks.");
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
      splay: null,
      splayDistance: null,
      spec: deckSpec(def),
    };
    const withDeck = { ...state, containers: { ...state.containers, [action.deckId]: deck } };
    return addToContainer(manifest, withDeck, object, action.deckId, { heldBy: null, drag: null, locked: false });
  },

  // Fans a deck's cards out, or closes them up. It works on a locked deck,
  // but not when the fan would run into something.
  splay({ manifest, state, action, def, object }) {
    if (def.kind !== "deck") return reject(state, "Only decks splay.");
    const direction = action.direction ?? null;
    if (direction != null && !SPLAY_DIRECTIONS[direction]) return reject(state, `Unknown splay direction "${direction}".`);
    const changes = { splay: direction };
    if (action.distance !== undefined) {
      if (!(action.distance > 0)) return reject(state, "splay distance must be more than 0.");
      changes.splayDistance = action.distance;
    }
    const result = save(state, object, changes);
    const { x, y, rotation, heldBy } = result.state.containers[object.id];
    if (!heldBy && landing(manifest, result.state, object.id, x, y, rotation, action.playerId).blocked) return blocked(state);
    return result;
  },
};

function sameMembers(members, order) {
  return Array.isArray(order) && order.length === members.length &&
    [...order].sort().join("\n") === [...members].sort().join("\n");
}

// What a deck made during play from `card` remembers about itself.
function deckSpec(card) {
  return { kind: "deck", size: card.size, layer: card.layer.id, accepts: card.type ? [{ type: card.type }] : null };
}

// Drops a card on a loose one like it: the two become a deck where the one
// underneath was, facing its way, with the dropped one on top.
function formDeck(manifest, state, card, underId, changes) {
  const under = state.pieces[underId];
  const deckId = `#deck-${state.sequence}`;
  const deck = {
    x: under.x,
    y: under.y,
    rotation: under.rotation,
    faceUp: under.faceUp,
    members: [],
    heldBy: null,
    drag: null,
    locked: false,
    splay: null,
    splayDistance: null,
    spec: deckSpec(pieceDef(manifest, underId)),
  };
  let next = withoutMember(state, card);
  next = { ...next, containers: { ...next.containers, [deckId]: deck } };
  next = withObject(next, { kind: "piece", id: underId }, { containerId: deckId, x: null, y: null });
  next = withObject(next, { kind: "container", id: deckId }, { members: [card.id, underId] });
  return save(next, card, { ...changes, faceUp: under.faceUp, containerId: deckId, x: null, y: null });
}

// Moves a piece into a container, out of any it was in. A deck takes it on
// top, turned to face the way the deck does. A hand takes it face-up, at
// `index` or where `point` falls among its cards, so it plays face-up. A bag
// takes it as it is, and an infinite bag takes it off the table for good.
function addToContainer(manifest, state, piece, containerId, changes, index = null, point = null) {
  const without = withoutMember(state, piece);
  const container = findObject(manifest, without, containerId);
  if (container.def.template) {
    const { [piece.id]: _gone, ...pieces } = without.pieces;
    return { ok: true, state: { ...without, pieces, sequence: state.sequence + 1 } };
  }
  const members = container.state.members;
  let at = 0;
  if (container.def.kind === "hand") {
    at = index ?? handIndex(container.def, handSlots(container.def, members.length, piece.def.size[0]), ...point);
    at = Math.max(0, Math.min(at, members.length));
  }
  if (container.def.kind === "bag") at = members.length;
  const withContainer = withObject(without, container, {
    members: [...members.slice(0, at), piece.id, ...members.slice(at)],
  });
  const facing = {};
  if (container.def.kind === "deck") facing.faceUp = container.state.faceUp;
  if (container.def.kind === "hand") facing.faceUp = true;
  return save(withContainer, piece, { ...changes, ...facing, containerId, x: null, y: null });
}

// Drops a piece on a loose one just like it: the two become a stack where
// the one underneath was, with the dropped one on top.
function formStack(state, piece, underId, changes) {
  const under = state.pieces[underId];
  const stackId = `#stack-${state.sequence}`;
  const stack = {
    x: under.x,
    y: under.y,
    rotation: under.rotation,
    faceUp: true,
    members: [piece.id, underId],
    heldBy: null,
    drag: null,
    locked: false,
    spec: { kind: "stack" },
  };
  let next = withoutMember(state, piece);
  next = { ...next, containers: { ...next.containers, [stackId]: stack } };
  next = withObject(next, { kind: "piece", id: underId }, { containerId: stackId, x: null, y: null });
  return save(next, piece, { ...changes, containerId: stackId, x: null, y: null });
}

// After a draw: a stack down to one piece stops being a stack, leaving that
// piece loose where the stack was.
function settleStack(manifest, result, containerId) {
  const stack = result.ok && result.state.containers[containerId];
  if (!stack || stack.members.length !== 1 || findObject(manifest, result.state, containerId).def.kind !== "stack") return result;
  const [lastId] = stack.members;
  const lastDef = pieceDef(manifest, lastId);
  const { [containerId]: _gone, ...containers } = result.state.containers;
  const state = withObject({ ...result.state, containers }, { kind: "piece", id: lastId }, {
    containerId: null,
    x: stack.x,
    y: stack.y,
    rotation: stack.rotation,
    stackOrder: topOfLayer(manifest, result.state, lastDef.layer.id),
  });
  return { ...result, state };
}

// A piece's state before it's anywhere: off the table, in nothing.
function newPiece(def) {
  const piece = {
    x: null,
    y: null,
    rotation: def.rotation,
    faceUp: def.faceUp,
    stackOrder: 0,
    containerId: null,
    heldBy: null,
    drag: null,
    locked: def.fixed,
  };
  if (def.shape === "die") Object.assign(piece, { value: def.value, rolls: 0 });
  return piece;
}

// Drops a die in a tray: where it lands if it fits there, or else the free
// spot nearest that.
function addToTray(manifest, state, die, trayId, changes, point) {
  const without = withoutMember(state, die);
  const tray = without.containers[trayId];
  const placed = tray.members.map((id) => ({ def: pieceDef(manifest, id), spot: tray.spots[id] }));
  const spot = nearestFree(findObject(manifest, without, trayId).def, placed, die.def, toTray(tray, point));
  if (!spot) return blocked(state);
  const withTray = withObject(without, { kind: "container", id: trayId }, {
    members: [...tray.members, die.id],
    spots: { ...tray.spots, [die.id]: spot },
  });
  return save(withTray, die, { ...changes, containerId: trayId, x: null, y: null });
}

function withoutMember(state, piece) {
  const from = piece.state.containerId;
  if (!from) return state;
  const container = state.containers[from];
  const changes = { members: container.members.filter((id) => id !== piece.id) };
  if (container.spots) {
    const { [piece.id]: _gone, ...spots } = container.spots;
    changes.spots = spots;
  }
  return withObject(state, { kind: "container", id: from }, changes);
}

function ownHand(state, playerId) {
  const seatId = seatOf(state, playerId);
  return seatId && state.containers[handId(seatId)] ? handId(seatId) : null;
}

// Puts back whatever the player held, then frees their seat. Their hand stays
// with the seat.
function leaveSeat(state, playerId) {
  let next = state;
  for (const key of ["pieces", "containers"]) {
    for (const [id, object] of Object.entries(state[key])) {
      if (object.heldBy === playerId) next = withObject(next, { kind: key === "pieces" ? "piece" : "container", id }, { heldBy: null, drag: null });
    }
  }
  const { [playerId]: _gone, ...players } = next.players;
  return { ...next, players };
}

function topOfLayer(manifest, state, layerId) {
  let top = -1;
  for (const [id, piece] of Object.entries(state.pieces)) {
    if (pieceDef(manifest, id).layer.id === layerId && !piece.containerId) top = Math.max(top, piece.stackOrder);
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
