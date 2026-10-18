const POINTER = [
  ["Move a piece or deck", "Drag it, or click it then click a spot"],
  ["Set it back down", "Click it again"],
  ["Draw from a locked deck", "Drag it"],
  ["Add a card to a deck", "Drop it on the deck"],
  ["Put a card in a hand", "Drop it on the hand's tray, or on your hand strip"],
  ["Menu", "Right-click a piece or deck"],
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
  ["See a card up close", "Action bar, 🔍 button, then tap the card"],
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
  ["See a card up close", "Hold Alt"],
  ["Lock or unlock", "L"],
  ["Put back what you selected", "Esc"],
];

export function HelpPanel({ touch }) {
  return (
    <div className="help">
      <HelpTable rows={touch ? TOUCH : POINTER} />
      {!touch && <HelpTable rows={KEYS} />}
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
