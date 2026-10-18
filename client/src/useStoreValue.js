import { useEffect, useState } from "react";

// A value picked out of the table store, kept up to date. isEqual decides
// when a new pick counts as a change.
export function useStoreValue(store, select, isEqual = Object.is) {
  const [picked, setPicked] = useState(() => ({ store, value: store ? select(store.getState()) : undefined }));

  // A new store: pick from it right away rather than a render late.
  let current = picked;
  if (picked.store !== store) {
    current = { store, value: store ? select(store.getState()) : undefined };
    setPicked(current);
  }

  useEffect(() => {
    if (!store) return undefined;
    let last = select(store.getState());
    return store.subscribe((state) => {
      const next = select(state);
      if (isEqual(last, next)) return;
      last = next;
      setPicked({ store, value: next });
    });
    // Only the store matters: callers pass a fresh select on every render.
  }, [store]);

  return current.value;
}

export const sameIds = (a = [], b = []) => a.length === b.length && a.every((item, i) => item === b[i]);
