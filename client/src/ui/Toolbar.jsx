import { Menu } from "./Menu";

export function Toolbar({
  title, layout, menus, showActionBar, setShowActionBar, seatName, onLeaveSeat, handsEnabled, handStripVisible,
  setHandStripVisible, soundOn, setSoundOn, trayRollScatters, setTrayRollScatters, helpOpen, setHelpOpen, game, onHost,
  documents = [], onSave, setups = [], onSetup,
}) {
  // A setup moves things for everyone, so it asks first.
  const runSetup = (setup) => {
    if (window.confirm(`Set up ${setup.name}? This rearranges the table for everyone.`)) onSetup(setup.id);
  };
  const inviteUrl = game && `${window.location.origin}/tables/${game.token}`;
  return (
    <nav className="toolbar" aria-label="Toolbar">
      <span className="toolbar-title">{title}</span>
      <Menu id="game" label="Game" icon="♟" {...menus}>
        {game ? (
          <>
            <p className="menu-note">Anyone with this link can join:</p>
            <code className="invite-link">{inviteUrl}</code>
            <button type="button" className="menu-item" onClick={() => navigator.clipboard?.writeText(inviteUrl)}>
              Copy invite link
            </button>
          </>
        ) : (
          <>
            <p className="menu-note">This table only lives in your browser.</p>
            <button type="button" className="menu-item" disabled={!onHost} onClick={onHost}>Host it as a game…</button>
          </>
        )}
        {onSave && (
          <button type="button" className="menu-item" onClick={onSave}>Save to a file</button>
        )}
      </Menu>
      {setups.length > 0 && (
        <Menu id="setup" label="Setup" icon="🧰" {...menus}>
          <p className="menu-note">{onSetup ? "Lays out the table for everyone:" : "Take a seat to set up the table."}</p>
          {setups.map((setup) => (
            <button key={setup.id} type="button" className="menu-item" disabled={!onSetup} title={setup.description || undefined}
              onClick={() => runSetup(setup)}>
              {setup.name}
            </button>
          ))}
        </Menu>
      )}
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
      {documents.length > 0 && (
        <Menu id="documents" label="Docs" icon="📄" {...menus}>
          <p className="menu-note">Opens in a new tab.</p>
          {documents.map(({ name, url }) => (
            <a key={url} className="menu-item" href={url} target="_blank" rel="noopener noreferrer">{name}</a>
          ))}
        </Menu>
      )}
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
