import { Menu } from "./Menu";
import { HelpPanel } from "./HelpPanel";

export function Toolbar({ title, layout, menus, showActionBar, setShowActionBar }) {
  return (
    <nav className="toolbar" aria-label="Toolbar">
      <span className="toolbar-title">{title}</span>
      <Menu id="seat" label="Seat" icon="🪑" disabled title="Seats are coming soon" {...menus} />
      <Menu id="hand" label="Hand" icon="🂠" disabled title="Hands are coming soon" {...menus} />
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
