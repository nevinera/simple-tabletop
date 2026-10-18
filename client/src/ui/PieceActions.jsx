// Flip and rotate buttons for one piece, shared by the action bar's Piece
// menu and the context menu. onDone runs after any action, so a menu can
// close.
export function PieceActions({ interaction, pieceId, onDone = () => {} }) {
  const act = (fn) => () => {
    fn();
    onDone();
  };
  return (
    <div className="piece-actions">
      <button type="button" className="menu-item" onClick={act(() => interaction.flip(pieceId))}>
        Flip <kbd>F</kbd>
      </button>
      <div className="piece-actions-row">
        <button type="button" className="menu-item" aria-label="Rotate left 45°"
          onClick={act(() => interaction.rotate(-45, pieceId))}>
          ↺ 45° <kbd>R</kbd>
        </button>
        <button type="button" className="menu-item" aria-label="Rotate right 45°"
          onClick={act(() => interaction.rotate(45, pieceId))}>
          ↻ 45° <kbd>T</kbd>
        </button>
      </div>
      <div className="piece-actions-row">
        <button type="button" className="menu-item" aria-label="Rotate left 22.5°"
          onClick={act(() => interaction.rotate(-22.5, pieceId))}>
          ↺ 22.5°
        </button>
        <button type="button" className="menu-item" aria-label="Rotate right 22.5°"
          onClick={act(() => interaction.rotate(22.5, pieceId))}>
          ↻ 22.5°
        </button>
      </div>
    </div>
  );
}
