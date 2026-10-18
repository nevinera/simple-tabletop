import { applyAction, initialState } from "./actions";

// Holds the table state in the browser and applies actions to it right away.
// Server sync will swap dispatch for one that sends actions over the cable
// and applies what comes back.
export function createTableStore(manifest) {
  let state = initialState(manifest);
  const listeners = new Set();

  return {
    getState: () => state,

    dispatch(action) {
      const result = applyAction(manifest, state, action);
      if (result.ok) {
        state = result.state;
        listeners.forEach((listener) => listener(state, action));
      }
      return result;
    },

    // Returns an unsubscribe function.
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
