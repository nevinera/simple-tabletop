import { useEffect, useState } from "react";

// The id of the piece this player holds, kept up to date with the store.
export function useSelectedPiece(store, playerId) {
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!store) return undefined;
    const update = (state) => {
      const id = Object.keys(state.pieces).find((key) => state.pieces[key].heldBy === playerId) || null;
      setSelected(id);
    };
    update(store.getState());
    return store.subscribe(update);
  }, [store, playerId]);

  return selected;
}
