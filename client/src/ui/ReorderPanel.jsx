import { useRef, useState } from "react";
import { imageStyle } from "./cardImage";

// A deck's cards in a popover, top first and face-up, for putting in order.
// Drag a row, or use its arrows, then save. onSave(order) returns whether
// the new order took.
export function ReorderPanel({ cards, onSave, onClose }) {
  const [order, setOrder] = useState(() => cards.map((card) => card.id));
  const [dragging, setDragging] = useState(null);
  const [failed, setFailed] = useState(false);
  const rows = useRef(new Map()); // card id -> row element
  const byId = new Map(cards.map((card) => [card.id, card]));

  const moveTo = (id, index) => {
    setOrder((current) => {
      const without = current.filter((other) => other !== id);
      const at = Math.max(0, Math.min(index, without.length));
      return [...without.slice(0, at), id, ...without.slice(at)];
    });
  };

  const startDrag = (event, id) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(id);
  };

  // The dragged row goes where the pointer is among the other rows' middles.
  const drag = (event) => {
    if (!dragging) return;
    const others = order.filter((id) => id !== dragging);
    const index = others.filter((id) => {
      const rect = rows.current.get(id)?.getBoundingClientRect();
      return rect && event.clientY > rect.top + rect.height / 2;
    }).length;
    if (order.indexOf(dragging) !== index) moveTo(dragging, index);
  };

  const save = () => {
    if (onSave(order)) onClose();
    else setFailed(true);
  };

  return (
    <div className="help-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="help reorder" role="dialog" aria-label="Reorder deck">
        <div className="help-header">
          <h2>Reorder</h2>
          <button type="button" className="help-close" aria-label="Close reorder" onClick={onClose}>×</button>
        </div>
        <div className="help-body">
          <p className="menu-title">Top</p>
          <ol className="reorder-list">
            {order.map((id, index) => (
              <li
                key={id}
                ref={(element) => (element ? rows.current.set(id, element) : rows.current.delete(id))}
                className={`reorder-row${dragging === id ? " dragging" : ""}`}
                onPointerDown={(event) => startDrag(event, id)}
                onPointerMove={drag}
                onPointerUp={() => setDragging(null)}
                onPointerCancel={() => setDragging(null)}
              >
                <span className="reorder-grip" aria-hidden="true">⠿</span>
                <span
                  className="reorder-card"
                  style={{ ...imageStyle(byId.get(id).side.image), aspectRatio: byId.get(id).side.size.join(" / ") }}
                />
                <span className="reorder-name">{byId.get(id).label}</span>
                <button type="button" className="menu-item" aria-label={`Move ${byId.get(id).label} up`}
                  disabled={index === 0} onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => moveTo(id, index - 1)}>↑</button>
                <button type="button" className="menu-item" aria-label={`Move ${byId.get(id).label} down`}
                  disabled={index === order.length - 1} onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => moveTo(id, index + 1)}>↓</button>
              </li>
            ))}
          </ol>
          <p className="menu-title">Bottom</p>
          {failed && <p className="menu-note" role="alert">The deck changed since you opened this. Close it and try again.</p>}
          <div className="piece-actions-row">
            <button type="button" className="menu-item" onClick={onClose}>Cancel</button>
            <button type="button" className="menu-item" onClick={save}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
