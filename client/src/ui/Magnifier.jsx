import { imageStyle } from "./cardImage";

// A card shown large over the table. side comes from visibleSide(). With
// onClose (touch), a tap anywhere closes it; otherwise it lets pointer
// events through and goes away when Alt comes up.
export function Magnifier({ side, onClose }) {
  const [width, depth] = side.size;
  return (
    <div
      className={`magnifier${onClose ? " magnifier-closable" : ""}`}
      role="dialog"
      aria-label="Magnified card"
      onPointerDown={onClose}
    >
      <div className="magnifier-card" style={{ ...imageStyle(side.image), aspectRatio: `${width} / ${depth}` }} />
    </div>
  );
}
