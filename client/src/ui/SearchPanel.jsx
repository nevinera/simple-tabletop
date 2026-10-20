import { useEffect, useState } from "react";
import { imageStyle } from "./cardImage";
import { faceOf, pieceDef } from "../state/objects";
import { sameIds, useStoreValue } from "../useStoreValue";

// A deck's or bag's contents in a popover, face up, for finding and taking
// out particular pieces. items are { id, label, side: { image, size } },
// with a null image for pieces without one, like dice. onTake(id) takes a
// piece out to place it, and closes the panel; onToHand(id), when given,
// puts it in your hand and leaves the panel open.
export function SearchPanel({ title, items, onTake, onToHand, onClose }) {
  const [query, setQuery] = useState("");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((item) => words.every((word) => item.label.toLowerCase().includes(word)));

  return (
    <div className="help-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="help reorder" role="dialog" aria-label={`Search ${title}`}>
        <div className="help-header">
          <h2>{title}</h2>
          <button type="button" className="help-close" aria-label="Close search" onClick={onClose}>×</button>
        </div>
        <div className="help-body">
          <input
            className="search-input"
            type="search"
            placeholder={`Search ${items.length} pieces`}
            aria-label="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {shown.length === 0 && <p className="menu-note">Nothing matches.</p>}
          <ul className="reorder-list">
            {shown.map(({ id, label, side }) => (
              <li key={id} className="reorder-row search-row">
                {side.image
                  ? <span className="reorder-card" style={{ ...imageStyle(side.image), aspectRatio: side.size.join(" / ") }} />
                  : <span className="reorder-card search-blank" aria-hidden="true" />}
                <span className="reorder-name">{label}</span>
                <button type="button" className="menu-item" aria-label={`Take ${label}`} onClick={() => onTake(id)}>Take</button>
                {onToHand && (
                  <button type="button" className="menu-item" aria-label={`Put ${label} in your hand`} onClick={() => onToHand(id)}>
                    To hand
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// A piece id as a name to read and search by: "wood-elf-a" -> "wood elf a".
export function pieceLabel(id) {
  return id.replace(/[-_#]+/g, " ").trim();
}

// The search panel for one deck or bag, kept up to date as pieces come out.
// It closes once the container is empty or gone.
export function ContainerSearch({ store, manifest, interaction, containerId, onClose }) {
  const members = useStoreValue(store, (state) => state.containers[containerId]?.members ?? [], sameIds);
  const container = store.getState().containers[containerId];
  const gone = !container || !members.length;
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);
  if (gone) return null;
  const kind = manifest.containers.find((c) => c.id === containerId)?.kind ?? container.spec?.kind ?? "deck";
  const items = members.map((id) => {
    const def = pieceDef(manifest, id);
    const image = def.face ? faceOf(def, store.getState().pieces[id]) : null;
    return { id, label: pieceLabel(id), side: { image, size: def.size } };
  });
  const hasHand = interaction.describe(containerId)?.hasHand;
  return (
    <SearchPanel
      title={kind === "bag" ? "Search the bag" : "Search the deck"}
      items={items}
      onTake={(id) => {
        if (interaction.draw(containerId, { pick: id })) onClose();
      }}
      onToHand={hasHand ? (id) => interaction.draw(containerId, { pick: id, toHand: true }) : null}
      onClose={onClose}
    />
  );
}
