const POINTER = [
  ["Move a piece or deck", "Drag it, or click it then click a spot"],
  ["Set it back down", "Click it again"],
  ["Draw from a locked deck", "Drag it"],
  ["Add a card to a deck", "Drop it on the deck"],
  ["Put a card in a hand", "Drop it on the hand's tray, or on your hand strip"],
  ["Menu", "Right-click a piece or deck"],
  ["Take a die out of a tray", "Drag it"],
  ["Orbit", "Drag the table"],
  ["Pan", "Right-drag"],
  ["Zoom", "Mouse wheel"],
];

const TOUCH = [
  ["Move a piece or deck", "Drag it, or tap it then tap and hold a spot"],
  ["Put it back", "Tap empty table"],
  ["Draw from a locked deck", "Drag it"],
  ["Add a card to a deck", "Drop it on the deck"],
  ["Put a card in a hand", "Drop it on the hand's tray, or on your hand strip"],
  ["Menu", "Tap and hold a piece or deck"],
  ["See a card or die up close", "Action bar, 🔍 button, then tap it"],
  ["Roll a die or tray", "Tap and hold it, then Roll"],
  ["Flip, rotate, or lock", "Select it, then the action bar's ⟳ button"],
  ["Orbit", "Drag the table"],
  ["Pan", "Two-finger drag"],
  ["Zoom", "Pinch"],
  ["Joysticks", "Action bar, 🕹 button"],
];

const KEYS = [
  ["Pan", "W A S D"],
  ["Turn", "Q / E"],
  ["Zoom", "- / ="],
  ["Tilt", "_ / +"],
  ["Jump to camera point", "0-9"],
  ["Save camera point", "Shift + 0-9"],
  ["Flip", "F"],
  ["Rotate 45°", "R / T"],
  ["Rotate 22.5°", "Shift + R / T"],
  ["Draw from the deck under the mouse", "G"],
  ["Draw it into your hand", "Shift + G"],
  ["See a card or die up close", "Hold Alt"],
  ["Lock or unlock", "L"],
  ["Roll the die under the mouse", "X"],
  ["Roll every die in a tray", "Shift + X"],
  ["Put back what you selected", "Esc"],
  ["Open or close help", "?"],
];

// Help in a popover over the whole app. Its body scrolls when it's taller
// than the window. Clicking outside it closes it.
export function HelpPanel({ touch, onClose }) {
  return (
    <div className="help-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="help" role="dialog" aria-label="Help">
        <div className="help-header">
          <h2>Help</h2>
          <button type="button" className="help-close" aria-label="Close help" onClick={onClose}>×</button>
        </div>
        <div className="help-body">
          <HelpTable rows={touch ? TOUCH : POINTER} />
          {!touch && <HelpTable rows={KEYS} />}
        </div>
      </div>
    </div>
  );
}

function HelpTable({ rows }) {
  return (
    <table>
      <tbody>
        {rows.map(([action, how]) => (
          <tr key={action}>
            <th scope="row">{action}</th>
            <td>{how}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
