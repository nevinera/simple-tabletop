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

// Every piece and container this player holds, pieces first.
export function useSelectedObjects(store, playerId) {
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (!store) return undefined;
    const update = ({ pieces, containers }) => {
      const mine = (group) => Object.keys(group).filter((key) => group[key].heldBy === playerId);
      const next = [...mine(pieces), ...mine(containers)];
      setSelected((current) => (current.join("\n") === next.join("\n") ? current : next));
    };
    update(store.getState());
    return store.subscribe(update);
  }, [store, playerId]);

  return selected;
}
