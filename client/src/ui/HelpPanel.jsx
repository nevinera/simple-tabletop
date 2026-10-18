const POINTER = [
  ["Move a piece", "Drag it, or click it then click a spot"],
  ["Set it back down", "Click it again"],
  ["Piece menu", "Right-click a piece"],
  ["Orbit", "Drag the table"],
  ["Pan", "Right-drag"],
  ["Zoom", "Mouse wheel"],
];

const TOUCH = [
  ["Move a piece", "Drag it, or tap it then tap and hold a spot"],
  ["Put it back", "Tap empty table"],
  ["Piece menu", "Tap and hold a piece"],
  ["Flip or rotate", "Select a piece, then the action bar's ⟳ button"],
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
  ["Put a selected piece back", "Esc"],
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
