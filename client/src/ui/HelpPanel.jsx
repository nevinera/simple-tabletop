const POINTER = [
  ["Move a piece or deck", "Drag it, or click it then click a spot"],
  ["Set it back down", "Click it again"],
  ["Draw from a locked deck, bag, or stack", "Drag it"],
  ["Add to a deck, bag, or stack", "Drop it on top"],
  ["Make a deck or stack", "Drop a card, tile, chip, or token on one like it"],
  ["Splay a deck", "Pick a direction in its menu, then drag any card out"],
  ["Put a deck in order", "Reorder… in its menu, then drag the cards"],
  ["Look at the top few cards of a deck", "Look at in its menu"],
  ["Find and take out a particular card or piece", "Search… in a deck's or bag's menu"],
  ["Stack chips, tokens, or tiles", "Drop one on another: any chip of the same size, or a token or tile just like it"],
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
  ["Draw from a locked deck, bag, or stack", "Drag it"],
  ["Add to a deck, bag, or stack", "Drop it on top"],
  ["Make a deck or stack", "Drop a card, tile, chip, or token on one like it"],
  ["Splay a deck", "Pick a direction in its menu, then drag any card out"],
  ["Put a deck in order", "Reorder… in its menu, then drag the cards"],
  ["Look at the top few cards of a deck", "Look at in its menu"],
  ["Find and take out a particular card or piece", "Search… in a deck's or bag's menu"],
  ["Stack chips, tokens, or tiles", "Drop one on another: any chip of the same size, or a token or tile just like it"],
  ["Put a card in a hand", "Drop it on the hand's tray, or on your hand strip"],
  ["Menu", "Tap and hold a piece or deck"],
  ["See a card or die up close", "Action bar, 🔍 button, then tap it"],
  ["Roll a die or tray", "Tap and hold it, then Roll"],
  ["Flip, rotate, or lock", "Select it, then the action bar's ⟳ button"],
  ["Change a card's state, like upgraded", "Tap and hold it, then pick a state"],
  ["Select several", "Action bar, ☑ button, then tap them or drag a box"],
  ["Orbit", "Drag the table"],
  ["Pan", "Two-finger drag"],
  ["Zoom", "Pinch"],
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
  ["Draw from the deck, bag, or stack under the mouse", "G"],
  ["Draw it into your hand", "Shift + G"],
  ["Draw a deck's top card face down, unseen", "Shift + drag the deck"],
  ["See a card or die up close, or what's in a bag", "Hold Alt"],
  ["Lock or unlock", "L"],
  ["Select several, or take one back out", "Shift + click"],
  ["Select everything in a box", "Shift + drag the table"],
  ["Stack up the alike pieces you selected", "K"],
  ["Switch a card to its next state, like upgraded", "U"],
  ["Roll the die under the mouse, or every die you hold", "X"],
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
