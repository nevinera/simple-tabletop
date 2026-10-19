import { useEffect, useRef, useState } from "react";

// A value picked out of the table store, kept up to date. isEqual decides
// when a new pick counts as a change.
export function useStoreValue(store, select, isEqual = Object.is) {
  const [picked, setPicked] = useState(() => ({ store, value: store ? select(store.getState()) : undefined }));
  // The newest select, so a pick that depends on props (like who's playing)
  // stays current between store changes.
  const selectRef = useRef(select);
  selectRef.current = select;

  // A new store: pick from it right away rather than a render late.
  let current = picked;
  if (picked.store !== store) {
    current = { store, value: store ? select(store.getState()) : undefined };
    setPicked(current);
  }

  useEffect(() => {
    if (!store) return undefined;
    let last = selectRef.current(store.getState());
    return store.subscribe((state) => {
      const next = selectRef.current(state);
      if (isEqual(last, next)) return;
      last = next;
      setPicked({ store, value: next });
    });
    // Only the store matters: callers pass a fresh select on every render.
  }, [store]);

  return current.value;
}

export const sameIds = (a = [], b = []) => a.length === b.length && a.every((item, i) => item === b[i]);
