import { useRef } from "react";
import { imageStyle } from "./cardImage";

const DRAG_THRESHOLD_PX = 6;

// Your hand along the bottom of the screen. Tap a card to select it, then
// place it on the table as usual, or shift-click to select several. Drag a
// card along the strip to reorder it, onto the table to play it (with the
// rest of what you selected), or anywhere else to put it back.
export function HandStrip({ cards, selectedIds, interaction, canvas }) {
  const selected = new Set(selectedIds);
  const stripRef = useRef(null);
  const drag = useRef(null);

  const onPointerDown = (event, id) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, startX: event.clientX, startY: event.clientY, moved: false, shift: event.shiftKey };
  };

  const onPointerMove = (event) => {
    const current = drag.current;
    if (!current) return;
    if (!current.moved) {
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      current.moved = true;
      if (!interaction.handGrab(current.id)) {
        drag.current = null;
        return;
      }
    }
    if (overCanvas(event)) interaction.handMove(current.id, event.clientX, event.clientY);
  };

  const onPointerUp = (event) => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (!current.moved) {
      if (current.shift) interaction.toggleSelect(current.id);
      else if (selected.has(current.id)) interaction.cancelSelection();
      else interaction.handGrab(current.id);
      return;
    }
    const strip = stripRef.current.getBoundingClientRect();
    const overStrip = event.clientX >= strip.left && event.clientX <= strip.right &&
      event.clientY >= strip.top && event.clientY <= strip.bottom;
    if (overStrip) interaction.handDrop(current.id, { index: indexAt(event.clientX, current.id) });
    else interaction.handDrop(current.id, { overTable: overCanvas(event) });
  };

  // Where a card let go at clientX lands among the other cards.
  const indexAt = (clientX, draggedId) => {
    const others = [...stripRef.current.querySelectorAll("[data-card-id]")]
      .filter((el) => el.dataset.cardId !== draggedId);
    return others.filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.left + rect.width / 2 < clientX;
    }).length;
  };

  const overCanvas = (event) => {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    return Boolean(el && canvas && (el === canvas || canvas.contains(el)));
  };

  return (
    <div className="hand-strip" ref={stripRef} aria-label="Your hand">
      {cards.length === 0 && <p className="hand-strip-empty">Your hand is empty.</p>}
      {cards.map(({ id, side }) => (
        <div key={id} className="hand-strip-slot">
          <button
            type="button"
            className={`hand-strip-card${selected.has(id) ? " selected" : ""}`}
            data-card-id={id}
            aria-label={id}
            aria-pressed={selected.has(id)}
            style={{ ...imageStyle(side.image), aspectRatio: `${side.size[0]} / ${side.size[1]}` }}
            onPointerDown={(event) => onPointerDown(event, id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { drag.current = null; }}
          />
        </div>
      ))}
    </div>
  );
}
