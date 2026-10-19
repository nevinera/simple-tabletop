import { applyAction, initialState } from "./actions";

const MAX_TRIES = 5;
const ROW_KINDS = ["pieces", "containers", "players"];

// Holds the table state in the browser. It starts from `start`, the state a
// server game loaded, or else the manifest's starting state.
//
// The sandbox applies actions right away. A synced store (see
// plans/server.md) keeps two states: confirmed, built from what the server
// sent, and shown, which is confirmed with this browser's unconfirmed actions
// replayed on top. getState and listeners see shown. Saved actions queue up
// and go to the server one at a time once connect() gives the store a
// transport: { act(message), drag(message), resync() }.
//
// Drags aren't saved. Yours go out once the server has confirmed your hold,
// and others' show on objects they hold until the hold ends.
export function createTableStore(manifest, start = null, { synced = false } = {}) {
  let confirmed = start || initialState(manifest);
  let shown = confirmed;
  let transport = null;
  let queue = []; // { actionId, action, tries }, oldest first
  let sent = null; // the queued action the server is deciding on
  let waitFor = null; // after a refusal, the sequence to catch up to before retrying
  const unsentDrags = new Map(); // object id -> player id, for drags waiting on their grab
  const listeners = new Set();
  const lostListeners = new Set();

  const notify = (action) => listeners.forEach((listener) => listener(shown, action));

  // Replays the queue on confirmed state. A queued action that no longer
  // applies is skipped here and dropped when its turn to send comes. Your
  // drags carry over, since the server never sees them.
  const rebuild = () => {
    let next = confirmed;
    for (const { action } of queue) {
      const result = applyAction(manifest, next, action);
      if (result.ok) next = result.state;
    }
    shown = keepDrags(shown, next);
  };

  const heldIn = (state, id) => (state.pieces[id] || state.containers[id])?.heldBy;

  const sendDrag = (id) => {
    const drag = (shown.pieces[id] || shown.containers[id])?.drag;
    if (drag) transport?.drag({ id, x: drag.x, y: drag.y });
  };

  // Sends the newest drag for each grab that's now confirmed, and forgets
  // ones whose hold is gone.
  const sendUnsentDrags = () => {
    for (const [id, playerId] of unsentDrags) {
      if (heldIn(confirmed, id) === playerId) sendDrag(id);
      if (heldIn(confirmed, id) === playerId || heldIn(shown, id) !== playerId) unsentDrags.delete(id);
    }
  };

  const otherDrag = (message) => {
    const kind = shown.pieces[message.id] ? "pieces" : "containers";
    const object = shown[kind][message.id];
    if (!object || object.heldBy !== message.actor) return;
    shown = { ...shown, [kind]: { ...shown[kind], [message.id]: { ...object, drag: { x: message.x, y: message.y } } } };
    notify(null);
  };

  const send = () => {
    while (transport && !sent && waitFor == null && queue.length) {
      const entry = queue[0];
      const result = applyAction(manifest, confirmed, entry.action);
      if (!result.ok) {
        queue.shift();
        const holder = heldIn(confirmed, entry.action.id);
        const lost = { action: entry.action, reason: result.reason, holder: holder !== entry.action.playerId ? holder || null : null };
        lostListeners.forEach((listener) => listener(lost));
        continue;
      }
      sent = entry;
      transport.act({ actionId: entry.actionId, base: confirmed.sequence, tableAction: entry.action, rows: rowsBetween(confirmed, result.state) });
    }
  };

  // Starts over from the server's state. The action in flight may or may not
  // have taken, so it goes; the rest replay on the new state.
  const load = (snapshot) => {
    const { sequence, seating, players, pieces, containers } = snapshot;
    confirmed = { sequence, seating, players, pieces, containers };
    if (sent) queue = queue.filter((entry) => entry !== sent);
    sent = null;
    waitFor = null;
    rebuild();
    notify(null);
    send();
  };

  const resync = () => {
    sent = null;
    waitFor = Infinity; // until the snapshot comes
    transport?.resync();
  };

  const change = (message) => {
    if (message.sequence !== confirmed.sequence + 1) return resync();
    confirmed = withRows(confirmed, message.rows, message.sequence);
    const mine = sent && message.actionId === sent.actionId;
    if (mine) {
      queue.shift();
      sent = null;
    }
    if (waitFor != null && confirmed.sequence >= waitFor) waitFor = null;
    rebuild();
    notify(mine ? null : message.action);
    sendUnsentDrags();
    send();
  };

  const refused = (message) => {
    if (!sent || message.actionId !== sent.actionId) return;
    sent.tries += 1;
    if (sent.tries >= MAX_TRIES) return resync();
    sent = null;
    waitFor = message.sequence > confirmed.sequence ? message.sequence : null;
    send();
  };

  return {
    getState: () => shown,

    // Applies the action to shown state right away and returns the result.
    // A synced store also queues saved actions for the server.
    dispatch(action) {
      const result = applyAction(manifest, shown, action);
      if (!result.ok) return result;
      const saved = result.state.sequence !== shown.sequence;
      shown = result.state;
      if (!synced) confirmed = shown;
      else if (saved) queue.push({ actionId: newActionId(), action, tries: 0 });
      else if (action.type === "drag" && heldIn(confirmed, action.id) === action.playerId) sendDrag(action.id);
      else if (action.type === "drag") unsentDrags.set(action.id, action.playerId);
      notify(action);
      if (synced && saved) send();
      return result;
    },

    // Returns an unsubscribe function. Listeners get the shown state and the
    // action that changed it: yours as you make it, others' as they arrive,
    // or null when your own action comes back or the state reloads.
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    // Listens for your actions that someone else's change got ahead of, so
    // they no longer apply. The listener gets { action, reason, holder },
    // where holder is whoever holds the action's object now, if not you.
    // Returns an unsubscribe function.
    onLost(listener) {
      lostListeners.add(listener);
      return () => lostListeners.delete(listener);
    },

    connect(next) {
      transport = next;
    },

    disconnect() {
      transport = null;
      sent = null;
    },

    // A message from the game's channel.
    receive(message) {
      if (message.type === "snapshot") load(message);
      else if (message.type === "change") change(message);
      else if (message.type === "refused") refused(message);
      else if (message.type === "drag") otherDrag(message);
    },
  };
}

// The rows that differ between two states, in the shape the server stores:
// each changed object or player in full, null for one that's gone, and
// seating when it changed. The reducer copies only what it changes, so an
// object changed if it isn't the same object anymore.
export function rowsBetween(before, after) {
  const rows = {};
  for (const kind of ROW_KINDS) {
    const changed = {};
    for (const [id, row] of Object.entries(after[kind])) {
      if (before[kind][id] !== row) changed[id] = withoutDrag(row);
    }
    for (const id of Object.keys(before[kind])) {
      if (!(id in after[kind])) changed[id] = null;
    }
    if (Object.keys(changed).length) rows[kind] = changed;
  }
  if (before.seating !== after.seating) rows.seating = after.seating;
  return rows;
}

// Applies rows from the server to a state.
export function withRows(state, rows, sequence) {
  const next = { ...state, sequence };
  for (const kind of ROW_KINDS) {
    if (!rows[kind]) continue;
    const objects = { ...state[kind] };
    for (const [id, row] of Object.entries(rows[kind])) {
      if (row === null) delete objects[id];
      else objects[id] = kind === "players" ? row : { ...row, drag: null };
    }
    next[kind] = objects;
  }
  if (rows.seating) next.seating = rows.seating;
  return next;
}

function withoutDrag(row) {
  if (!row || !("drag" in row)) return row;
  const { drag: _drag, ...rest } = row;
  return rest;
}

// Copies drags from the old shown state onto objects the same player still
// holds in the new one.
function keepDrags(before, after) {
  let next = after;
  for (const kind of ["pieces", "containers"]) {
    for (const [id, object] of Object.entries(before[kind])) {
      const now = next[kind][id];
      if (!object.drag || !now || !now.heldBy || now.heldBy !== object.heldBy || now.drag) continue;
      next = { ...next, [kind]: { ...next[kind], [id]: { ...now, drag: object.drag } } };
    }
  }
  return next;
}

function newActionId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
