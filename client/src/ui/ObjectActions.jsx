// Buttons for one object, shared by the action bar's Selected menu and the
// context menu. What shows depends on the object: decks draw and shuffle,
// pieces flip and can become decks, locked things only unlock, and cards in
// your hand only magnify. onDone runs after any action, so a menu can close.
export function ObjectActions({ interaction, objectId, onMagnify, onDone = () => {} }) {
  const object = interaction.describe(objectId);
  if (!object) return <p className="menu-note">Someone else has that.</p>;

  const act = (fn) => () => {
    fn();
    onDone();
  };
  const deck = object.kind === "deck";
  const die = object.kind === "die";
  const tray = object.kind === "tray";
  const movable = !object.locked && !object.inHand;
  const magnify = onMagnify && (
    <button type="button" className="menu-item" onClick={act(() => onMagnify(objectId))}>
      Magnify <kbd>Alt</kbd>
    </button>
  );
  if (object.inHand) return <div className="piece-actions">{magnify}</div>;

  return (
    <div className="piece-actions">
      {!die && !tray && magnify}
      {deck && <p className="menu-title">{deckTitle(object.count)}</p>}
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
      {deck && object.count > 0 && (
        <button type="button" className="menu-item" onClick={act(() => interaction.draw(objectId))}>
          Draw <kbd>G</kbd>
        </button>
      )}
      {deck && object.count > 1 && (
        <button type="button" className="menu-item" onClick={act(() => interaction.shuffle(objectId))}>
          Shuffle
        </button>
      )}
      {!deck && !die && !tray && movable && (
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

function deckTitle(count) {
  if (count === 0) return "Empty deck";
  return count === 1 ? "Deck: 1 card" : `Deck: ${count} cards`;
}
