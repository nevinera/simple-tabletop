import { useEffect, useState } from "react";

// The id of the piece or container this player holds, kept up to date with
// the store.
export function useSelectedObject(store, playerId) {
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!store) return undefined;
    const update = ({ pieces, containers }) => {
      const mine = (group) => Object.keys(group).find((key) => group[key].heldBy === playerId);
      setSelected(mine(pieces) || mine(containers) || null);
    };
    update(store.getState());
    return store.subscribe(update);
  }, [store, playerId]);

  return selected;
}
