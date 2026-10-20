import { createConsumer } from "@rails/actioncable";

const DRAG_INTERVAL = 50; // ms, about 20 drags a second
const PING_INTERVAL = 10000; // ms
const PING_JITTER = 2000; // ms taken off at random, so players don't ping in step

// Joins a game's channel and ties the store to it: the store sends its
// actions and drags, and gets the snapshot and every change back (see
// plans/server.md). The server knows the player by this browser's cookie.
// onRoster gets the game's players, [{ id, name, host }], on connecting and
// whenever someone joins. onReplaced runs when the player opens the game
// somewhere else, which disconnects this one. Returns a function that
// disconnects.
export function connectGame(token, store, { onRoster = () => {}, onReplaced = () => {} } = {}) {
  const consumer = createConsumer();
  let pingTimer = null;
  const drags = throttledDrags((message) => subscription.perform("drag", message));

  const stop = () => {
    clearTimeout(pingTimer);
    drags.cancel();
    store.disconnect();
    consumer.disconnect();
  };

  const ping = () => {
    pingTimer = setTimeout(() => {
      subscription.perform("ping");
      ping();
    }, PING_INTERVAL - Math.random() * PING_JITTER);
  };

  // The store sends nothing until the server has confirmed the subscription:
  // an action sent before then is lost, and the store would wait on it.
  const transport = {
    // A drag still waiting to go out would land after the action.
    act: (message) => {
      drags.cancel();
      subscription.perform("act", message);
    },
    drag: drags.send,
    resync: () => subscription.perform("resync"),
  };
  const subscription = consumer.subscriptions.create({ channel: "GameChannel", game: token }, {
    connected() {
      store.connect(transport);
    },
    disconnected() {
      store.disconnect();
    },
    received(message) {
      if (message.roster) onRoster(message.roster);
      if (message.type === "roster") return;
      if (message.type !== "replaced") return store.receive(message);
      stop();
      onReplaced();
    },
  });
  ping();
  return stop;
}

// Sends at most one drag per interval, and always the newest.
function throttledDrags(perform) {
  let last = 0;
  let waiting = null;
  let timer = null;
  const flush = () => {
    timer = null;
    last = Date.now();
    perform(waiting);
    waiting = null;
  };
  return {
    send(message) {
      waiting = message;
      if (timer) return;
      const wait = last + DRAG_INTERVAL - Date.now();
      if (wait <= 0) flush();
      else timer = setTimeout(flush, wait);
    },
    cancel() {
      clearTimeout(timer);
      timer = null;
      waiting = null;
    },
  };
}
