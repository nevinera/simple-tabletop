// Setups: named lists of steps a manifest gives for laying out the table,
// like one per region of a campaign (see docs/manifest-format.md#setups).
// Running one is one change. Its steps run in order, each on the table the
// steps before it left:
//   reset:   puts pieces and containers back where the manifest starts them
//   move:    moves them onto spots, `to`, or into a container, `into`
//   shuffle: shuffles a deck or bag
//   deal:    lays out the top cards of a deck on spots
//   state:   puts a card or board in one of its states
// Steps pick what they work on with a selector (see selected). Anything in a
// hand or held by a player stays where it is.

import { addToContainer, addToTray, letGoOf, settleStack, topOfLayer, withObject, withoutMember } from "./actions";
import { restingZ } from "./footprint";
import { findObject, pieceDef } from "./objects";
import { seededRandom } from "./trays";

// Returns { ok: true, state } with the setup run, or { ok: false, reason }.
// The caller bumps the sequence.
export function runSetup(manifest, state, setupId, seed) {
  const setup = (manifest.setups || []).find((s) => s.id === setupId);
  if (!setup) return { ok: false, reason: `Unknown setup "${setupId}".` };
  const random = seededRandom(seed);
  let next = state;
  for (const step of setup.steps) {
    next = STEPS[step.op](manifest, next, step, random);
  }
  return { ok: true, state: tidy(manifest, next) };
}

const STEPS = {
  reset(manifest, state, step) {
    let next = state;
    const homes = new Set();
    for (const id of selected(manifest, state, step.select)) {
      const object = findObject(manifest, next, id);
      if (object.kind === "container") {
        next = resetContainer(manifest, next, object);
        continue;
      }
      const home = homeOf(manifest, id);
      if (home) homes.add(home);
      next = resetPiece(manifest, next, object, home);
    }
    for (const home of homes) next = inManifestOrder(manifest, next, home);
    return next;
  },

  move(manifest, state, step) {
    let next = state;
    let added = 0;
    selected(manifest, state, step.select).forEach((id, i) => {
      const object = findObject(manifest, next, id);
      if (step.into) {
        // They go in in order, the first on top.
        const pieces = object.kind === "container" ? object.state.members : [id];
        for (const pieceId of pieces) next = putInto(manifest, next, findObject(manifest, next, pieceId), step.into, {}, added++);
        return;
      }
      const spot = step.to[Math.min(i, step.to.length - 1)];
      next = place(manifest, next, object, spot, looks(step));
    });
    return next;
  },

  shuffle(manifest, state, step, random) {
    const members = [...state.containers[step.target].members];
    for (let i = members.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [members[i], members[j]] = [members[j], members[i]];
    }
    return withObject(state, { kind: "container", id: step.target }, { members });
  },

  deal(manifest, state, step) {
    let next = state;
    for (const spot of step.to) {
      const [cardId] = next.containers[step.target].members;
      if (!cardId) break;
      next = place(manifest, next, findObject(manifest, next, cardId), spot, { faceUp: true, ...looks(step) });
    }
    return next;
  },

  state(manifest, state, step) {
    const index = pieceDef(manifest, step.target).states.findIndex((s) => s.name === step.stateName);
    return withObject(state, { kind: "piece", id: step.target }, { stateIndex: index });
  },
};

// The ids a step's selector picks, pieces and containers, leaving out what's
// in a hand or held:
//   { ids }:      these, in this order
//   { category }: every piece in the category
//   { in }:       what's in a container now, top first
export function selected(manifest, state, select) {
  let ids;
  if (select.ids) ids = select.ids;
  else if (select.in) ids = state.containers[select.in]?.members || [];
  else ids = Object.keys(state.pieces).filter((id) => pieceDef(manifest, id)?.categories?.includes(select.category));
  return ids.filter((id) => {
    const object = state.pieces[id] || state.containers[id];
    if (!object || object.heldBy) return false;
    const container = object.containerId && findObject(manifest, state, object.containerId);
    return container?.def.kind !== "hand" && !container?.state.heldBy;
  });
}

// What a move or deal sets on everything it places.
function looks(step) {
  const changes = {};
  for (const key of ["faceUp", "rotation", "locked"]) if (step[key] != null) changes[key] = step[key];
  return changes;
}

// The container the manifest starts a piece in, if any.
function homeOf(manifest, id) {
  return manifest.containers.find((container) => container.members.includes(id))?.id || null;
}

// A piece back where it starts: in its container, or on its spot, as the
// manifest has it. A piece an infinite bag handed out goes back for good.
function resetPiece(manifest, state, piece, home) {
  const def = piece.def;
  const listed = manifest.pieces.some((p) => p.id === piece.id);
  if (!listed) return putInto(manifest, state, piece, piece.id.slice(0, piece.id.indexOf("#")), {});
  const changes = { rotation: def.rotation, faceUp: def.faceUp, locked: def.fixed };
  if (home) return piece.state.containerId === home ? state : putInto(manifest, state, piece, home, changes);
  if (!def.position) return state;
  return place(manifest, state, piece, def.position, changes);
}

function resetContainer(manifest, state, container) {
  const def = manifest.containers.find((c) => c.id === container.id);
  if (!def) return state;
  let next = place(manifest, state, container, def.position, { rotation: def.rotation, locked: def.fixed });
  if (def.kind === "deck") {
    next = withObject(next, container, { faceUp: def.faceUp, splay: def.splay });
    for (const id of next.containers[def.id].members) next = withObject(next, { kind: "piece", id }, { faceUp: def.faceUp });
  }
  return next;
}

// Puts a container's members in the order the manifest lists them, with any
// it doesn't list after.
function inManifestOrder(manifest, state, containerId) {
  const listed = manifest.containers.find((c) => c.id === containerId).members;
  const members = state.containers[containerId].members;
  const now = new Set(members);
  const order = [...listed.filter((id) => now.has(id)), ...members.filter((id) => !listed.includes(id))];
  return withObject(state, { kind: "container", id: containerId }, { members: order });
}

function putInto(manifest, state, piece, containerId, changes, index = null) {
  if (piece.state.containerId === containerId) return state;
  const container = findObject(manifest, state, containerId);
  const letGo = { ...letGoOf(piece), ...changes };
  if (container.state.spots) {
    const result = addToTray(manifest, state, piece, containerId, letGo, [container.state.x, container.state.y]);
    return result.ok ? result.state : state;
  }
  return addToContainer(manifest, state, piece, containerId, letGo, index).state;
}

// Sets an object down loose at a spot, on top of whatever is there.
function place(manifest, state, object, [x, y], changes) {
  let next = object.kind === "piece" ? withoutMember(state, object) : state;
  const rotation = changes.rotation ?? object.state.rotation;
  const placed = { ...letGoOf(object), ...changes, x, y };
  if (object.kind === "piece") {
    Object.assign(placed, { containerId: null, stackOrder: topOfLayer(manifest, next, object.def.layer.id) });
  }
  next = withObject(next, object, placed);
  const z = restingZ(manifest, next, object.id, x, y, rotation);
  next = withObject(next, object, { z });
  if (object.kind === "container" && changes.faceUp != null && object.def.kind === "deck") {
    for (const id of next.containers[object.id].members) next = withObject(next, { kind: "piece", id }, { faceUp: changes.faceUp });
  }
  return next;
}

// Decks and stacks made during play that the setup emptied go away, and a
// stack down to one piece leaves it loose.
function tidy(manifest, state) {
  let next = state;
  for (const [id, container] of Object.entries(state.containers)) {
    if (!container.spec || container.spec.kind === "hand") continue;
    if (!container.members.length) {
      const { [id]: _gone, ...containers } = next.containers;
      next = { ...next, containers };
    } else {
      next = settleStack(manifest, { ok: true, state: next }, id).state;
    }
  }
  return next;
}
