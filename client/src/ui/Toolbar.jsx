import { Menu } from "./Menu";

export function Toolbar({
  title, layout, menus, showActionBar, setShowActionBar, seatName, onLeaveSeat, handsEnabled, handStripVisible,
  setHandStripVisible, soundOn, setSoundOn, trayRollScatters, setTrayRollScatters, helpOpen, setHelpOpen,
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
        {layout === "desktop" && (
          <label className="menu-row">
            <input
              type="checkbox"
              checked={showActionBar}
              onChange={(event) => setShowActionBar(event.target.checked)}
            />
            Show action bar
          </label>
        )}
        <label className="menu-row">
          <input type="checkbox" checked={soundOn} onChange={(event) => setSoundOn(event.target.checked)} />
          Sound effects
        </label>
        <label className="menu-row">
          <input
            type="checkbox"
            checked={trayRollScatters}
            onChange={(event) => setTrayRollScatters(event.target.checked)}
          />
          Rolling a tray moves its dice
        </label>
      </Menu>
      <button
        type="button"
        className={`bar-button${helpOpen ? " active" : ""}`}
        aria-label="Help"
        aria-pressed={helpOpen}
        title="Help (?)"
        onClick={() => setHelpOpen(!helpOpen)}
      >
        <span aria-hidden="true">?</span>
        <span className="bar-button-label">Help</span>
      </button>
    </nav>
  );
}
