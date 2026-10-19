import { createConsumer } from "@rails/actioncable";

// Joins a game's channel and ties the store to it: the store sends its
// actions, and gets the snapshot and every change back (see plans/server.md).
// The server knows the player by this browser's cookie. Returns a function
// that disconnects.
export function connectGame(token, store) {
  const consumer = createConsumer();
  const subscription = consumer.subscriptions.create({ channel: "GameChannel", game: token }, {
    received: (message) => store.receive(message),
  });
  store.connect({
    act: (message) => subscription.perform("act", message),
    resync: () => subscription.perform("resync"),
  });
  return () => {
    store.disconnect();
    consumer.disconnect();
  };
}
