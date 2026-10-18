import { Menu } from "./Menu";
import { HelpPanel } from "./HelpPanel";

export function Toolbar({
  title, layout, menus, showActionBar, setShowActionBar, seatName, onLeaveSeat, handsEnabled, handStripVisible,
  setHandStripVisible,
}) {
  return (
    <nav className="toolbar" aria-label="Toolbar">
      <span className="toolbar-title">{title}</span>
      <Menu id="seat" label="Seat" icon="🪑" disabled={!seatName} {...menus}>
        <p className="menu-note">You're sitting at {seatName}.</p>
        <button type="button" className="menu-item" onClick={onLeaveSeat}>Change seat</button>
      </Menu>
      <button
        type="button"
        className={`bar-button${handStripVisible && handsEnabled ? " active" : ""}`}
        aria-label="Hand"
        aria-pressed={handStripVisible && handsEnabled}
        disabled={!handsEnabled}
        title={handsEnabled ? "Show or hide your hand" : "This game has no hands"}
        onClick={() => setHandStripVisible(!handStripVisible)}
      >
        <span aria-hidden="true">🂠</span>
        <span className="bar-button-label">Hand</span>
      </button>
      <Menu id="options" label="Options" icon="⚙" {...menus}>
        {layout === "desktop" ? (
          <label className="menu-row">
            <input
              type="checkbox"
              checked={showActionBar}
              onChange={(event) => setShowActionBar(event.target.checked)}
            />
            Show action bar
          </label>
        ) : (
          <p className="menu-note">No options yet.</p>
        )}
      </Menu>
      <Menu id="help" label="Help" icon="?" {...menus}>
        <HelpPanel touch={layout !== "desktop"} />
      </Menu>
    </nav>
  );
}
