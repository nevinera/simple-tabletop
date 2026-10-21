// Table state and the actions that change it. This mirrors what the server
// will store and accept (see docs/architecture.md), so the client can run
// against a local store now and the server later.
//
// State:
//   sequence:   bumped on every saved change; drag doesn't count
//   seating:    "four" or "eight"; see state/seats.js
//   players:    { [playerId]: { seatId } }
//   pieces:     { [id]: { x, y, z, rotation, faceUp, stackOrder, containerId, heldBy, drag, locked } },
//               plus { value, rolls } for dice, { value, label } for counters,
//               and { stateIndex } for cards
//               with states, which state they're in, 0 or missing for the first
//   containers: { [id]: { x, y, z, rotation, faceUp, members, heldBy, drag, locked, spec } },
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
// deck made during play, { kind: "deck", card } naming the card it was made
// from, or a seat's hand,
// { kind: "hand", seatId }. A card dropped on a card like it makes a deck
// with the id "#deck-<sequence>".
//
// z is how high a loose object rests on whatever is under it, or 0 or missing
// on the table (see state/footprint.js). Moving or turning something carries
// what rests on it along, and after every saved change, things whose support
// moved settle onto what's under them now. A held object's carrying lists
// what rested on it when it was picked up, which goes where it goes.
//
// Decks also carry splay, the way their cards fan out (see SPLAY_DIRECTIONS)
// or null, and splayDistance, a player's spacing for the fan or null for the
// deck's own.

import { carried, elevation, keepOnTable, landing, riders, setDown, settle, stackUp } from "./footprint";
import {
  MAX_COUNTER_LABEL, MAX_COUNTER_VALUE, SPLAY_DIRECTIONS, accepts, fanSpots, findObject, handIndex, handSlots, pieceDef, pilesWith,
  spawnedId,
} from "./objects";
import { nearestFree, scatter, seededRandom, toTray } from "./trays";
import { snapSpot } from "./snaps";
import { handId, openSeats, seatOf } from "./seats";

const LAID_OUT_GAP = 0.5; // cm between cards laid out from a hand

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
    if (container.kind === "tray" || container.kind === "bowl") {
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

  return stackUp(manifest, { sequence: 0, seating: "four", players: {}, pieces, containers });
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
//             the member to take, for a bag that isn't infinite or a deck
//             someone searched, or
//             { faceDown: true } to take a deck's card face down whichever way
//             the deck faces, or { count } for how many to draw from a deck or stack into the
//             hand, which stops early if it runs out
//   roll:     { values } for a die or a tray's dice, { [dieId]: face index },
//             plus { spots } for a tray
//   rotate:   { degrees }, positive is clockwise
//   shuffle:  { order }, the deck's members in their new order
//   reorder:  { order }, the same, for an order a player chose
//   makeDeck: { deckId }, the id for the new deck
//   splay:    { direction }, a SPLAY_DIRECTIONS key or null to close the
//             deck up, plus { distance } in cm to change its spacing
//   changeState: { index }, which of a card's states to put it in
//   deal:     { count }, how many cards each seated player gets from a deck
//   setCounter: { value } and/or { label } for a counter
//   stackUp:  { others }, the pieces to pile on top of this one, bottom first
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

  const result = handler({ manifest, state, action, object, kind: object.kind, def: object.def });
  if (!result.ok || result.state.sequence === state.sequence) return result;
  return { ...result, state: settle(manifest, result.state) };
}

const MEMBER_ACTIONS = ["grab", "drag", "drop", "release"];
// Cards in your hand or a splayed deck can also change state.
const CARD_ACTIONS = [...MEMBER_ACTIONS, "changeState"];

function reachableMember(state, object, action) {
  const containerId = object.state.containerId;
  if (containerId === ownHand(state, action.playerId)) return CARD_ACTIONS.includes(action.type);
  const container = state.containers[containerId];
  // Dice in a tray and anything in a bowl lie in the open.
  const tray = Boolean(container.spots);
  const free = !container.heldBy || container.heldBy === action.playerId;
  if (container.splay && free) return CARD_ACTIONS.includes(action.type);
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
  grab({ manifest, state, action, object }) {
    if (object.state.locked) return reject(state, "That's locked.");
    const changes = { heldBy: action.playerId };
    const ids = riders(manifest, state, object.id);
    if (ids.length) changes.carrying = ids;
    return save(state, object, changes);
  },

  drag({ state, action, object }) {
    if (object.state.heldBy !== action.playerId) return reject(state, "Grab it first.");
    return unsaved(state, object, { drag: { x: action.x, y: action.y } });
  },

  // Everything else the player holds goes with it as a group (see
  // dropGroup), and they let go of all of it.
  drop({ manifest, state, action, object }) {
    if (object.state.heldBy !== action.playerId) return reject(state, "Grab it first.");
    const result = dropGroup(manifest, state, action, object);
    if (!result.ok) return result;
    return { ...result, state: letGoAll(result.state, action.playerId) };
  },

  release({ state, action, object }) {
    if (object.state.heldBy !== action.playerId) return reject(state, "You aren't holding that.");
    return save(state, object, letGoOf(object));
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
    if (def.kind === "pawn") return reject(state, "Pawns don't flip.");
    if (def.kind === "counter") return reject(state, "Counters don't flip.");
    return save(state, object, { faceUp: !object.state.faceUp });
  },

  rotate({ manifest, state, action, object }) {
    if (object.state.locked) return reject(state, "That's locked.");
    if (!Number.isFinite(action.degrees)) return reject(state, "rotate needs degrees.");
    const rotation = normalizeDegrees(object.state.rotation + action.degrees);
    const changes = { rotation };
    // A held object is off the table; dropping it checks where it lands instead.
    if (!object.state.heldBy) {
      const target = landing(manifest, state, object.id, object.state.x, object.state.y, rotation, action.playerId);
      if (target.blocked) return blocked(state);
      if (target.z != null) changes.z = target.z;
    }
    const dz = (changes.z ?? elevation(object)) - elevation(object);
    return carryAlong(manifest, state, save(state, object, changes), object.id, action.playerId, { dz, degrees: action.degrees });
  },

  // Locking something you hold puts it back where it was first.
  lock({ state, object }) {
    return save(state, object, { ...letGoOf(object), locked: !object.state.locked });
  },

  // Takes a piece out of a deck, bag, or stack, held by the player who drew
  // it so they can place it, or with toHand, into their hand. A deck or
  // stack gives its top piece, a bag the member the action picks, and an
  // infinite bag a new piece.
  draw({ manifest, state, action, kind, def, object }) {
    if (kind !== "container" || !["deck", "bag", "stack"].includes(def.kind)) {
      return reject(state, "Only decks, bags, and stacks can be drawn from.");
    }
    if (action.count != null) return drawSeveral(manifest, state, action, def, object);
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
    } else if (action.pick != null) {
      // Searching a deck takes any card, not just the top one.
      if (def.kind !== "deck" || !object.state.members.includes(action.pick)) return reject(state, "That isn't in the deck.");
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
      z: elevation(object),
      rotation: from.rotation,
      stackOrder: topOfLayer(manifest, state, piece.def.layer.id),
      heldBy: action.playerId,
      drag: null,
    };
    if (def.kind === "deck") changes.faceUp = action.faceDown ? false : from.faceUp;
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

  // Piles loose pieces up where this one lies: cards that pile together
  // become a deck, and alike tiles, chips, or tokens a stack, with the others
  // on top, the last one highest. The player lets go of all of them.
  stackUp({ manifest, state, action, kind, def, object }) {
    const others = action.others || [];
    if (kind !== "piece" || !others.length) return reject(state, "stackUp needs pieces to pile up.");
    const pile = [object, ...others.map((id) => findObject(manifest, state, id))];
    if (new Set(pile.map((p) => p?.id)).size !== pile.length) return reject(state, "stackUp got a piece twice.");
    for (const piece of pile) {
      if (piece?.kind !== "piece" || piece.state.containerId || piece.state.x == null) return reject(state, "Only loose pieces stack up.");
      if (piece.state.heldBy && piece.state.heldBy !== action.playerId) return reject(state, "Someone else is holding one of those.");
    }
    if (!pile.every((piece) => pilesWith(def, piece.def))) return reject(state, "Those don't stack together.");
    const card = def.kind === "card";
    const containerId = `#${card ? "deck" : "stack"}-${state.sequence}`;
    const { x, y, z, rotation, faceUp } = object.state;
    const container = { x, y, z: z || 0, rotation, faceUp: card ? faceUp : true, members: pile.map((p) => p.id).reverse(),
      heldBy: null, drag: null, locked: false, spec: card ? deckSpec(def) : { kind: "stack" } };
    if (card) Object.assign(container, { splay: null, splayDistance: null });
    let next = { ...state, containers: { ...state.containers, [containerId]: container } };
    for (const piece of pile) {
      next = withObject(next, piece, { ...letGoOf(piece), containerId, x: null, y: null, ...(card ? { faceUp } : {}) });
    }
    return { ok: true, state: { ...next, sequence: state.sequence + 1 } };
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
      z: card.z || 0,
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

  // Changes a counter's number or label. Locked counters still count; locking
  // only keeps them in place.
  setCounter({ state, action, def, object }) {
    if (def.kind !== "counter") return reject(state, "Only counters keep a count.");
    const changes = {};
    if (action.value !== undefined) {
      if (!Number.isInteger(action.value) || Math.abs(action.value) > MAX_COUNTER_VALUE) return reject(state, "A counter's value must be a whole number.");
      changes.value = action.value;
    }
    if (action.label !== undefined) {
      if (typeof action.label !== "string" || action.label.length > MAX_COUNTER_LABEL) {
        return reject(state, `A counter's label is at most ${MAX_COUNTER_LABEL} characters.`);
      }
      changes.label = action.label;
    }
    if (!Object.keys(changes).length) return reject(state, "setCounter needs a value or a label.");
    return save(state, object, changes);
  },

  // Puts a card or board in one of its states, like upgraded. It keeps that
  // state wherever it goes. Locked things change state too, since locking
  // only keeps them in place.
  changeState({ state, action, def, object }) {
    if (!def.states) return reject(state, "That has no states.");
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= def.states.length) {
      return reject(state, "changeState needs one of the card's states.");
    }
    return save(state, object, { stateIndex: action.index });
  },

  // Deals `count` cards from a deck into every seated player's hand, one at
  // a time around the table (see dealOrder). Stops early if the deck runs out.
  deal({ manifest, state, action, def, object }) {
    if (def.kind !== "deck") return reject(state, "Only decks deal.");
    if (!Number.isInteger(action.count) || action.count < 1) return reject(state, "deal needs a count, 1 or more.");
    const hands = dealOrder(manifest, state, action.playerId);
    if (!hands.length) return reject(state, "Nobody has a hand to deal to.");
    if (!object.state.members.length) return reject(state, "That deck is empty.");
    let next = state;
    for (let round = 0; round < action.count; round++) {
      for (const hand of hands) {
        const cardId = next.containers[object.id].members[0];
        if (!cardId) return { ok: true, state: { ...next, sequence: state.sequence + 1 } };
        const card = findObject(manifest, next, cardId);
        if (!accepts(findObject(manifest, next, hand).def, card.def)) return reject(state, "That can't go in a hand.");
        next = addToContainer(manifest, next, card, hand, {}, next.containers[hand].members.length).state;
      }
    }
    return { ok: true, state: { ...next, sequence: state.sequence + 1 } };
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
    if (heldBy) return result;
    const target = landing(manifest, result.state, object.id, x, y, rotation, action.playerId);
    if (target.blocked) return blocked(state);
    return { ...result, state: withObject(result.state, object, { z: target.z }) };
  },
};

// Drops a held object, with the rest of what its player holds:
// - into a container, the others go in too, if it takes them all;
// - on open table, loose ones keep their places around it, and cards from
//   the player's hand lay out in a row beside it, as the hand runs;
// - into a hand, onto a pile, or into a tray, only it goes, and the rest is
//   let go where it was.
function dropGroup(manifest, state, action, object) {
  const letGo = letGoOf(object);
  const group = heldBy(state, action.playerId).filter((id) => id !== object.id);
  if (action.into) {
    if (action.into !== ownHand(state, action.playerId)) return reject(state, "That isn't your hand.");
    return addToContainer(manifest, state, object, action.into, letGo, action.index);
  }
  // A piece let go of near a snap point lands on it.
  const snapped = object.kind === "piece" ? snapSpot(manifest, object.def, action.x, action.y) : null;
  let [x, y] = snapped ?? [action.x, action.y];
  let target = landing(manifest, state, object.id, x, y, object.state.rotation, action.playerId);
  // Let go of over the table, but not into a container, it lands wholly on
  // the table, nudged in from any edge it hangs over.
  const [width, depth] = manifest.table.size;
  if (!target.into && x >= 0 && y >= 0 && x <= width && y <= depth) {
    const [inX, inY] = keepOnTable(manifest, state, object, x, y);
    if (inX !== x || inY !== y) {
      [x, y] = [inX, inY];
      target = landing(manifest, state, object.id, x, y, object.state.rotation, action.playerId);
    }
  }
  if (target.blocked) return blocked(state);
  // Tucked, it goes under the deck or pile instead of on top.
  const tuck = action.tuck === true;
  if (target.into && object.kind === "container") return mergeDeck(manifest, state, object, target.into, letGo, tuck);
  if (target.onto && object.def.kind === "card") return formDeck(manifest, state, object, target.onto, letGo, tuck);
  if (target.onto) return formStack(state, object, target.onto, letGo, tuck);
  if (target.into && state.containers[target.into].spots) {
    return addToTray(manifest, state, object, target.into, letGo, [x, y]);
  }
  if (target.into) return addAllToContainer(manifest, state, [...group, object.id], target.into, [x, y], tuck);
  const changes = { ...letGo, x, y, z: target.z };
  if (object.kind === "piece") changes.stackOrder = topOfLayer(manifest, state, object.def.layer.id);
  if (object.state.containerId) {
    // Played from a hand, a card lands facing the way the hand does, and
    // pulled from a deck's fan, the way the deck does.
    const from = findObject(manifest, state, object.state.containerId);
    changes.containerId = null;
    if (from.def.kind === "hand") changes.rotation = from.def.rotation;
    if (from.def.kind === "deck") Object.assign(changes, { rotation: from.state.rotation, faceUp: from.state.faceUp });
    const result = save(withoutMember(state, object), object, changes);
    if (from.def.kind !== "hand") return result;
    return layOutFromHand(manifest, state, result, from, object, group, action.playerId);
  }
  const from = object.state;
  return carryAlong(manifest, state, save(state, object, changes), object.id, action.playerId, {
    dx: x - from.x, dy: y - from.y, dz: target.z - elevation(object),
  });
}

// Puts several pieces in a container at once, the first one deepest, or
// refuses if it won't take them all. Tucked, they go under a deck or stack,
// the last one at the very bottom.
function addAllToContainer(manifest, state, ids, containerId, point, tuck = false) {
  const container = findObject(manifest, state, containerId);
  if (!ids.every((id) => state.pieces[id] && accepts(container.def, pieceDef(manifest, id)))) return blocked(state);
  let next = state;
  for (const id of ids) {
    const piece = findObject(manifest, next, id);
    const index = tuck ? next.containers[containerId].members.length : null;
    next = addToContainer(manifest, next, piece, containerId, letGoOf(piece), index, point).state;
  }
  return { ok: true, state: { ...next, sequence: state.sequence + 1 } };
}

// After a card from a hand lands: the other held cards from that hand lay
// out in a row after it, along the hand, and rest where they land. Refused
// if one won't fit.
function layOutFromHand(manifest, before, result, hand, lead, group, playerId) {
  const cards = before.containers[hand.id].members.filter((id) => group.includes(id));
  if (!cards.length) return result;
  const radians = (hand.def.rotation * Math.PI) / 180;
  const [axisX, axisY] = [Math.cos(radians), -Math.sin(radians)];
  const { x, y } = result.state.pieces[lead.id];
  let next = result.state;
  let along = 0;
  let width = lead.def.size[0];
  for (const id of cards) {
    const card = findObject(manifest, next, id);
    along += (width + card.def.size[0]) / 2 + LAID_OUT_GAP;
    width = card.def.size[0];
    next = withObject(withoutMember(next, card), card, {
      ...letGoOf(card), containerId: null, x: x + axisX * along, y: y + axisY * along, z: 0,
      rotation: hand.def.rotation, stackOrder: topOfLayer(manifest, next, card.def.layer.id),
    });
  }
  const placed = setDown(manifest, next, cards, playerId);
  return placed ? { ...result, state: placed } : blocked(before);
}

// Everything a player holds, pieces and containers.
function heldBy(state, playerId) {
  return ["pieces", "containers"].flatMap((key) => Object.keys(state[key]).filter((id) => state[key][id].heldBy === playerId));
}

// Lets go of everything a player holds.
function letGoAll(state, playerId) {
  let next = state;
  for (const id of heldBy(state, playerId)) {
    const kind = state.pieces[id] ? "piece" : "container";
    next = withObject(next, { kind, id }, letGoOf({ state: objectState(next, id) }));
  }
  return next;
}

// After an object moved or turned: moves what was riding on it along, shifted
// by (dx, dy), raised by dz, and turned `degrees` clockwise about the object's
// center. Refused if anything carried would land somewhere it can't go.
function carryAlong(manifest, before, result, id, playerId, { dx = 0, dy = 0, dz = 0, degrees = 0 }) {
  const ids = carried(manifest, before, id);
  if (!ids.length) return result;
  const { x: cx, y: cy } = objectState(result.state, id);
  const radians = (degrees * Math.PI) / 180;
  const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
  let next = result.state;
  for (const riderId of ids) {
    const rider = findObject(manifest, before, riderId);
    const ox = rider.state.x + dx - cx;
    const oy = rider.state.y + dy - cy;
    next = withObject(next, rider, {
      x: cx + ox * cos + oy * sin,
      y: cy - ox * sin + oy * cos,
      z: elevation(rider) + dz,
      rotation: normalizeDegrees(rider.state.rotation + degrees),
    });
  }
  const placed = setDown(manifest, next, ids, playerId);
  return placed ? { ...result, state: placed } : blocked(before);
}

// What changes when a player lets go of something.
function letGoOf(object) {
  const changes = { heldBy: null, drag: null };
  if (object.state.carrying) changes.carrying = null;
  return changes;
}

function objectState(state, id) {
  return state.pieces[id] || state.containers[id];
}

// The hands of seated players in the order a dealer deals: clockwise around
// the table as seen from above, starting at the dealer's left and ending with
// the dealer. Without a dealer at the table, from the near edge.
export function dealOrder(manifest, state, dealerId) {
  const [width, depth] = manifest.table.size;
  const turn = (hand) => {
    const [x, y] = findObject(manifest, state, hand).def.position;
    // 0 at the near edge, growing clockwise: left, far, right.
    const angle = Math.atan2(-(x - width / 2), -(y - depth / 2));
    return (angle + 2 * Math.PI) % (2 * Math.PI);
  };
  const hands = Object.values(state.players)
    .map((player) => handId(player.seatId))
    .filter((hand) => state.containers[hand])
    .sort((a, b) => turn(a) - turn(b));
  const dealerSeat = seatOf(state, dealerId);
  const dealer = dealerSeat ? hands.indexOf(handId(dealerSeat)) : -1;
  return dealer === -1 ? hands : [...hands.slice(dealer + 1), ...hands.slice(0, dealer + 1)];
}

function sameMembers(members, order) {
  return Array.isArray(order) && order.length === members.length &&
    [...order].sort().join("\n") === [...members].sort().join("\n");
}

// What a deck made during play from `card` remembers about itself. The rest
// comes from the manifest.
function deckSpec(card) {
  return { kind: "deck", card: card.id };
}

// Drops a card on a loose one like it: the two become a deck where the one
// underneath was, facing its way, with the dropped one on top, or under it
// when tucked.
function formDeck(manifest, state, card, underId, changes, tuck = false) {
  const under = state.pieces[underId];
  const deckId = `#deck-${state.sequence}`;
  const deck = {
    x: under.x,
    y: under.y,
    z: under.z || 0,
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
  next = withObject(next, { kind: "container", id: deckId }, { members: tuck ? [underId, card.id] : [card.id, underId] });
  return save(next, card, { ...changes, faceUp: under.faceUp, containerId: deckId, x: null, y: null });
}

// Draws the top `count` cards or pieces of a deck or stack into the player's
// hand, in order, or all of them if there are fewer.
function drawSeveral(manifest, state, action, def, object) {
  if (!action.toHand) return reject(state, "Only draws into your hand take a count.");
  if (def.kind === "bag") return reject(state, "Draw from a bag one at a time.");
  if (!Number.isInteger(action.count) || action.count < 1) return reject(state, "draw count must be a whole number, 1 or more.");
  const hand = ownHand(state, action.playerId);
  if (!hand) return reject(state, "You don't have a hand.");
  const drawn = object.state.members.slice(0, action.count);
  if (!drawn.length) return reject(state, "That deck is empty.");
  let next = state;
  for (const id of drawn) {
    const piece = findObject(manifest, next, id);
    if (!accepts(findObject(manifest, next, hand).def, piece.def)) return reject(state, "That can't go in a hand.");
    next = addToContainer(manifest, next, piece, hand, {}, next.containers[hand].members.length).state;
  }
  if (def.kind === "stack" && !next.containers[object.id].members.length) {
    const { [object.id]: _gone, ...containers } = next.containers;
    next = { ...next, containers };
  }
  return settleStack(manifest, { ok: true, state: { ...next, sequence: state.sequence + 1 } }, object.id);
}

// Drops a deck on a deck that takes its cards: they all go on top, or under
// it when tucked, in their order, turned to face the way that deck does. A
// deck made during play is gone once it's empty, and a module's deck stays
// behind, empty, where it was.
function mergeDeck(manifest, state, deck, intoId, changes, tuck = false) {
  const into = state.containers[intoId];
  const cards = deck.state.members;
  const members = tuck ? [...into.members, ...cards] : [...cards, ...into.members];
  let next = withObject(state, { kind: "container", id: intoId }, { members });
  for (const id of cards) next = withObject(next, { kind: "piece", id }, { containerId: intoId, faceUp: into.faceUp });
  if (manifest.containers.some((container) => container.id === deck.id)) {
    next = withObject(next, deck, { ...changes, members: [] });
  } else {
    const { [deck.id]: _gone, ...containers } = next.containers;
    next = { ...next, containers };
  }
  return { ok: true, state: { ...next, sequence: state.sequence + 1 } };
}

// Moves a piece into a container, out of any it was in. A deck takes it on
// top, or at `index`, turned to face the way the deck does. A hand takes it
// face-up, at `index` or where `point` falls among its cards. A bag
// takes it as it is, and an infinite bag takes it off the table for good.
function addToContainer(manifest, state, piece, containerId, changes, index = null, point = null) {
  const without = withoutMember(state, piece);
  const container = findObject(manifest, without, containerId);
  if (container.def.template) {
    const { [piece.id]: _gone, ...pieces } = without.pieces;
    return { ok: true, state: { ...without, pieces, sequence: state.sequence + 1 } };
  }
  const members = container.state.members;
  let at = Math.max(0, Math.min(index ?? 0, members.length));
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
// the one underneath was, with the dropped one on top, or under it when
// tucked.
function formStack(state, piece, underId, changes, tuck = false) {
  const under = state.pieces[underId];
  const stackId = `#stack-${state.sequence}`;
  const stack = {
    x: under.x,
    y: under.y,
    z: under.z || 0,
    rotation: under.rotation,
    faceUp: true,
    members: tuck ? [underId, piece.id] : [piece.id, underId],
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
    z: stack.z || 0,
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
  if (def.kind === "counter") Object.assign(piece, { value: def.value, label: def.label });
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
