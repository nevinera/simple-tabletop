import { imageStyle } from "./cardImage";
import { DieFace } from "./DieFace";

// A card, or a die's top face, shown large over the table. side comes from visibleSide(). With
// onClose (touch), a tap anywhere closes it; otherwise it lets pointer
// events through and goes away when Alt comes up.
export function Magnifier({ side, onClose }) {
  return (
    <div
      className={`magnifier${onClose ? " magnifier-closable" : ""}`}
      role="dialog"
      aria-label={side.die ? "Magnified die" : "Magnified card"}
      onPointerDown={onClose}
    >
      {side.die ? (
        <DieFace die={side.die} value={side.value} />
      ) : (
        <div className="magnifier-card" style={{ ...imageStyle(side.image), aspectRatio: `${side.size[0]} / ${side.size[1]}` }} />
      )}
    </div>
  );
}
