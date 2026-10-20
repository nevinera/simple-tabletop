import { useState } from "react";
import { rememberCount, rememberedCount } from "../browserMemory";
import { MAX_COUNTER_LABEL } from "../state/objects";
import { useStoreValue } from "../useStoreValue";

// Buttons for one object, shared by the action bar's Selected menu and the
// context menu. What shows depends on the object: decks draw, shuffle, and
// flip,
// bags and stacks draw,
// pieces flip and can become decks, locked things only unlock, and cards in
// your hand or a deck's fan only magnify and change state. Cards with states
// list them. Decks also splay, locked or not. onDone runs after any action,
// so a menu can close.
export function ObjectActions({ interaction, objectId, onMagnify, onReorder, onSearch, onDone = () => {} }) {
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
  const counter = object.counter && <CounterControls interaction={interaction} objectId={objectId} />;

  return (
    <div className="piece-actions">
      {!die && !tray && magnify}
      {counter}
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
      {deck && object.count > 0 && (
        <button type="button" className="menu-item" onClick={act(() => interaction.draw(objectId, { faceDown: true }))}>
          Draw face down <kbd>Shift drag</kbd>
        </button>
      )}
      {(deck || stack) && object.hasHand && object.count > 1 && (
        <CountAction label="Draw several into your hand" verb="Draw" name="draw" fallback={5} most={object.count}
          onAct={(count) => act(() => interaction.draw(objectId, { count }))()} />
      )}
      {deck && object.dealHands > 0 && object.count > 0 && (
        <CountAction label="Deal to each player" verb="Deal" name="deal" fallback={5}
          most={Math.max(1, Math.floor(object.count / object.dealHands))}
          onAct={(count) => act(() => interaction.deal(objectId, count))()} />
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
      {object.searchable && onSearch && (
        <button type="button" className="menu-item" onClick={act(() => onSearch(objectId))}>
          Search…
        </button>
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

const COUNTER_STEPS = [1, 5, 20, 100];

// A counter's label and number, with the adds along the top and the
// subtractions along the bottom. Typing commits on Enter or leaving the box.
// The menu stays open, so a player can tap several times.
function CounterControls({ interaction, objectId }) {
  // Follows the store, since the menu stays open while players count.
  const piece = useStoreValue(interaction.store, (state) => state.pieces[objectId]);
  const counter = { label: piece?.label ?? "", value: piece?.value ?? 0 };
  const [label, setLabel] = useState(counter.label);
  const [value, setValue] = useState(String(counter.value));
  const [seen, setSeen] = useState(counter);
  if (seen.label !== counter.label || seen.value !== counter.value) {
    setSeen(counter);
    setLabel(counter.label);
    setValue(String(counter.value));
  }
  const add = (by) => interaction.setCounter(objectId, { value: counter.value + by });
  const commitLabel = () => label !== counter.label && interaction.setCounter(objectId, { label });
  const commitValue = () => {
    const number = Number.parseInt(value, 10);
    if (Number.isInteger(number) && number !== counter.value) interaction.setCounter(objectId, { value: number });
    else setValue(String(counter.value));
  };
  const onKey = (commit) => (event) => {
    if (event.key === "Enter") commit();
  };
  const row = (sign) => (
    <div className="piece-actions-row">
      {COUNTER_STEPS.map((step) => (
        <button key={step} type="button" className="menu-item" aria-label={`${sign > 0 ? "Add" : "Subtract"} ${step}`}
          onClick={() => add(sign * step)}>
          {sign > 0 ? "+" : "−"}{step}
        </button>
      ))}
    </div>
  );
  return (
    <div className="counter-controls">
      {row(1)}
      <div className="counter-fields">
        <input className="counter-label" aria-label="Label" maxLength={MAX_COUNTER_LABEL} value={label} placeholder="Label"
          onChange={(event) => setLabel(event.target.value)} onBlur={commitLabel} onKeyDown={onKey(commitLabel)} />
        <input className="counter-value" aria-label="Value" inputMode="numeric" value={value}
          onChange={(event) => setValue(event.target.value)} onBlur={commitValue} onKeyDown={onKey(commitValue)} />
      </div>
      {row(-1)}
    </div>
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
