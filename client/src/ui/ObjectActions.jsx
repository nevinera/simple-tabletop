import { useState } from "react";
import { rememberCount, rememberedCount } from "../browserMemory";

// Buttons for one object, shared by the action bar's Selected menu and the
// context menu. What shows depends on the object: decks draw, shuffle, and
// flip,
// bags and stacks draw,
// pieces flip and can become decks, locked things only unlock, and cards in
// your hand or a deck's fan only magnify and change state. Cards with states
// list them. Decks also splay, locked or not. onDone runs after any action,
// so a menu can close.
export function ObjectActions({ interaction, objectId, onMagnify, onReorder, onDone = () => {} }) {
  const object = interaction.describe(objectId);
  if (!object) return <p className="menu-note">{interaction.holderName(objectId) || "Someone else"} has that.</p>;

  const act = (fn) => () => {
    fn();
    onDone();
  };
  const deck = object.kind === "deck";
  const die = object.kind === "die";
  const tray = object.kind === "tray";
  const bag = object.kind === "bag";
  const stack = object.kind === "stack";
  const movable = !object.locked && !object.inHand;
  const magnify = onMagnify && (
    <button type="button" className="menu-item" onClick={act(() => onMagnify(objectId))}>
      Magnify <kbd>Alt</kbd>
    </button>
  );
  const states = object.states && !object.locked && (
    <>
      <p className="menu-label">State <kbd>U</kbd></p>
      <div className="piece-actions-row">
        {object.states.map((name, index) => (
          <button key={name} type="button" className="menu-item" aria-pressed={object.stateIndex === index}
            onClick={act(() => interaction.changeState(index, objectId))}>
            {name}
          </button>
        ))}
      </div>
    </>
  );
  if (object.inHand || object.inDeck) return <div className="piece-actions">{magnify}{states}</div>;

  return (
    <div className="piece-actions">
      {!die && !tray && magnify}
      {states}
      {deck && <p className="menu-title">{deckTitle(object.count)}</p>}
      {bag && <p className="menu-title">{bagTitle(object)}</p>}
      {stack && <p className="menu-title">Stack of {object.count}</p>}
      {die && (
        <button type="button" className="menu-item" onClick={act(() => interaction.roll(objectId))}>
          Roll <kbd>X</kbd>
        </button>
      )}
      {(tray || object.inTray) && (
        <button type="button" className="menu-item" onClick={act(() => interaction.rollTray(tray ? objectId : object.trayId))}
          disabled={tray && object.count === 0}>
          Roll the tray <kbd>Shift X</kbd>
        </button>
      )}
      {(deck || bag || stack) && (object.infinite || object.count > 0) && (
        <button type="button" className="menu-item" onClick={act(() => interaction.draw(objectId))}>
          Draw <kbd>G</kbd>
        </button>
      )}
      {(deck || stack) && object.hasHand && object.count > 1 && (
        <CountAction label="Draw several into your hand" verb="Draw" name="draw" fallback={5} most={object.count}
          onAct={(count) => act(() => interaction.draw(objectId, { count }))()} />
      )}
      {deck && object.count > 1 && (
        <button type="button" className="menu-item" onClick={act(() => interaction.shuffle(objectId))}>
          Shuffle
        </button>
      )}
      {deck && (
        <>
          <p className="menu-label">Splay</p>
          <div className="piece-actions-row">
            {SPLAYS.map(({ direction, label, name }) => (
              <button key={name} type="button" className="menu-item" aria-label={name}
                aria-pressed={object.splay === direction}
                onClick={act(() => interaction.splay(objectId, { direction }))}>
                {label}
              </button>
            ))}
          </div>
          <div className="piece-actions-row">
            {SPLAY_DISTANCES.map((distance) => (
              <button key={distance} type="button" className="menu-item" aria-label={`Splay ${distance}cm apart`}
                aria-pressed={object.splayDistance === distance}
                onClick={act(() => interaction.splay(objectId, { direction: object.splay, distance }))}>
                {distance}cm
              </button>
            ))}
          </div>
        </>
      )}
      {deck && onReorder && object.count > 1 && (
        <>
          <CountAction label="Look at the top cards" verb="Look at" name="peek" fallback={3} most={object.count - 1}
            onAct={(count) => act(() => onReorder(objectId, count))()} />
          <button type="button" className="menu-item" onClick={act(() => onReorder(objectId))}>
            Reorder…
          </button>
        </>
      )}
      {object.canFlip && movable && (
        <button type="button" className="menu-item" onClick={act(() => interaction.flip(objectId))}>
          Flip <kbd>F</kbd>
        </button>
      )}
      {movable && (
        <>
          <div className="piece-actions-row">
            <button type="button" className="menu-item" aria-label="Rotate left 45°"
              onClick={act(() => interaction.rotate(-45, objectId))}>
              ↺ 45° <kbd>R</kbd>
            </button>
            <button type="button" className="menu-item" aria-label="Rotate right 45°"
              onClick={act(() => interaction.rotate(45, objectId))}>
              ↻ 45° <kbd>T</kbd>
            </button>
          </div>
          <div className="piece-actions-row">
            <button type="button" className="menu-item" aria-label="Rotate left 22.5°"
              onClick={act(() => interaction.rotate(-22.5, objectId))}>
              ↺ 22.5°
            </button>
            <button type="button" className="menu-item" aria-label="Rotate right 22.5°"
              onClick={act(() => interaction.rotate(22.5, objectId))}>
              ↻ 22.5°
            </button>
          </div>
        </>
      )}
      {object.canStackUp && (
        <button type="button" className="menu-item" onClick={act(() => interaction.stackUp())}>
          Stack up <kbd>K</kbd>
        </button>
      )}
      {object.canMakeDeck && (
        <button type="button" className="menu-item" onClick={act(() => interaction.makeDeck(objectId))}>
          Make a deck
        </button>
      )}
      <button type="button" className="menu-item" onClick={act(() => interaction.lock(objectId))}>
        {object.locked ? "Unlock" : "Lock"} <kbd>L</kbd>
      </button>
    </div>
  );
}

// Does something to several cards at once: a count to step up and down,
// remembered under `name` for next time, and a button saying `verb` and the
// count. most is the highest count it goes to.
function CountAction({ label, verb, name, fallback, most, onAct }) {
  const [count, setCount] = useState(() => rememberedCount(name, fallback));
  const shown = Math.max(1, Math.min(count, most));
  const step = (by) => setCount(Math.max(1, Math.min(most, shown + by)));
  const run = () => {
    rememberCount(name, shown);
    onAct(shown);
  };
  return (
    <>
      <p className="menu-label">{label}</p>
      <div className="piece-actions-row">
        <button type="button" className="menu-item" aria-label={`${verb} fewer`} disabled={shown <= 1} onClick={() => step(-1)}>−</button>
        <button type="button" className="menu-item" onClick={run}>{verb} {shown}</button>
        <button type="button" className="menu-item" aria-label={`${verb} more`} disabled={shown >= most} onClick={() => step(1)}>+</button>
      </div>
    </>
  );
}

const SPLAYS = [
  { direction: "left", label: "←", name: "Splay left" },
  { direction: "right", label: "→", name: "Splay right" },
  { direction: "away", label: "↑", name: "Splay away" },
  { direction: "toward", label: "↓", name: "Splay toward" },
  { direction: null, label: "Close", name: "Close up" },
];
const SPLAY_DISTANCES = [1, 2, 3, 5];

function bagTitle({ count, infinite }) {
  if (infinite) return "Bag: never runs out";
  if (count === 0) return "Empty bag";
  return count === 1 ? "Bag: 1 thing" : `Bag: ${count} things`;
}

function deckTitle(count) {
  if (count === 0) return "Empty deck";
  return count === 1 ? "Deck: 1 card" : `Deck: ${count} cards`;
}
