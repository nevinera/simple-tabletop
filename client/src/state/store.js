import { applyAction, initialState } from "./actions";

// Holds the table state in the browser and applies actions to it right away.
// Server sync will swap dispatch for one that sends actions over the cable
// and applies what comes back. It starts from `start`, the state a server
// game loaded, or else the manifest's starting state.
export function createTableStore(manifest, start = null) {
  let state = start || initialState(manifest);
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
