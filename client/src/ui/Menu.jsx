// A bar button that opens a panel. Only one menu is open at a time; the
// parent tracks which one in openMenu. A menu that becomes disabled closes.
export function Menu({ id, label, icon, openMenu, setOpenMenu, disabled, title, children }) {
  const open = openMenu === id && !disabled;
  return (
    <div className="menu">
      <button
        type="button"
        className={`bar-button${open ? " active" : ""}`}
        aria-expanded={open}
        aria-label={label}
        title={title || label}
        disabled={disabled}
        onClick={() => setOpenMenu(open ? null : id)}
      >
        <span aria-hidden="true">{icon}</span>
        <span className="bar-button-label">{label}</span>
      </button>
      {open && <div className="menu-panel" role="dialog" aria-label={label}>{children}</div>}
    </div>
  );
}
