const POINTER = [
  ["Orbit", "Drag the table"],
  ["Pan", "Right-drag"],
  ["Zoom", "Mouse wheel"],
];

const TOUCH = [
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
