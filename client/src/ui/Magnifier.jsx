import { imageStyle } from "./cardImage";
import { DieFace } from "./DieFace";
import { PawnIcon } from "./PawnIcon";

// A card, a die's top face, a pawn, or a bag's contents, shown large over the
// table. side comes from visibleSide(). With onClose (touch), a tap anywhere
// closes it; otherwise it lets pointer events through and goes away when Alt
// comes up.
export function Magnifier({ side, onClose }) {
  const label = side.contents ? "Bag contents" : side.die ? "Magnified die" : side.pawn ? "Magnified pawn"
    : side.counter ? "Magnified counter" : "Magnified card";
  return (
    <div
      className={`magnifier${onClose ? " magnifier-closable" : ""}`}
      role="dialog"
      aria-label={label}
      onPointerDown={onClose}
    >
      {side.contents ? <BagContents title={side.title} contents={side.contents} /> : <Side side={side} className="magnifier" />}
    </div>
  );
}

function Side({ side, className }) {
  if (side.die) return <DieFace die={side.die} value={side.value} className={`${className}-die`} />;
  if (side.pawn) return <PawnIcon pawn={side.pawn} className={`${className}-pawn`} />;
  if (side.counter) {
    return (
      <div className={`${className}-counter counter-face`} style={{ background: side.counter.color }}>
        <span className="counter-face-label">{side.counter.label}</span>
        <span className="counter-face-value">{side.counter.value}</span>
      </div>
    );
  }
  return (
    <div
      className={`${className}-card`}
      style={{ ...imageStyle(side.image), aspectRatio: `${side.size[0]} / ${side.size[1]}`, "--aspect": side.size[0] / side.size[1] }}
    />
  );
}

function BagContents({ title, contents }) {
  return (
    <div className="bag-contents">
      <p className="menu-title">{title || "Bag"}</p>
      {contents.length === 0 && <p className="menu-note">Empty</p>}
      <ul>
        {contents.map((kind) => (
          <li key={kind.key}>
            <Side side={kind.side} className="bag-contents" />
            <span className="bag-contents-name">{kind.name}</span>
            <span className="bag-contents-count">{kind.count == null ? "∞" : `× ${kind.count}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
