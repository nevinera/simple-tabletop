import { useState } from "react";
import { Menu } from "./Menu";
import { ObjectActions } from "./ObjectActions";

const SLOTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const ZOOM_STEP = 0.8;

export function ActionBar({
  scene, interaction, selectedObject, cameraPoints, menus, magnifyMode, setMagnifyMode, selectMode, setSelectMode,
  tuckMode = false, setTuckMode = () => {},
  onReorder, onSearch, onWrite,
}) {
  // Magnify and select modes each change what a tap does, so only one is on.
  const toggleMagnify = () => {
    setMagnifyMode(!magnifyMode);
    setSelectMode(false);
  };
  const toggleSelect = () => {
    setSelectMode(!selectMode);
    setMagnifyMode(false);
  };
  return (
    <nav className="action-bar" aria-label="Action bar">
      <Menu id="camera-points" label="Views" icon="🎥" {...menus}>
        <CameraPointsPanel cameraPoints={cameraPoints} />
      </Menu>
      <Menu
        id="selected"
        label="Selected"
        icon="⟳"
        disabled={!selectedObject || !interaction}
        title={selectedObject ? "Act on what you've selected" : "Select something to act on it"}
        {...menus}
      >
        <ObjectActions interaction={interaction} objectId={selectedObject} onReorder={onReorder} onSearch={onSearch} onWrite={onWrite} />
      </Menu>
      <button type="button" className="bar-button" aria-label="Zoom in" onClick={() => scene?.zoomBy(ZOOM_STEP)}>
        <span aria-hidden="true">＋</span>
      </button>
      <button type="button" className="bar-button" aria-label="Zoom out" onClick={() => scene?.zoomBy(1 / ZOOM_STEP)}>
        <span aria-hidden="true">－</span>
      </button>
      <button
        type="button"
        className={`bar-button${magnifyMode ? " active" : ""}`}
        aria-label="Magnify"
        aria-pressed={magnifyMode}
        title="Tap a card to see it up close"
        onClick={toggleMagnify}
      >
        <span aria-hidden="true">🔍</span>
      </button>
      <button
        type="button"
        className={`bar-button${selectMode ? " active" : ""}`}
        aria-label="Select several"
        aria-pressed={selectMode}
        title="Tap things to add them to your selection, or drag the table to box them in"
        onClick={toggleSelect}
      >
        <span aria-hidden="true">☑</span>
      </button>
      <button
        type="button"
        className={`bar-button${tuckMode ? " active" : ""}`}
        aria-label="Tuck under"
        aria-pressed={tuckMode}
        title="Cards you drop on a deck or pile go underneath instead of on top"
        onClick={() => setTuckMode(!tuckMode)}
      >
        <span aria-hidden="true">⤓</span>
      </button>
    </nav>
  );
}

// Views to jump to, and below them the same slots to save the current view
// into, so saving is its own tap and never a mode to forget about.
function CameraPointsPanel({ cameraPoints }) {
  const [status, setStatus] = useState(null);

  const jump = (slot) => {
    cameraPoints.jump(slot);
    setStatus(`Jumped to view ${slot}`);
  };
  const save = (slot) => {
    cameraPoints.save(slot);
    setStatus(`Saved view ${slot}`);
  };

  return (
    <div className="camera-points">
      <p className="camera-points-heading">Go to a view</p>
      <div className="camera-points-grid">
        {SLOTS.map((slot) => (
          <button key={slot} type="button" className="slot-button" aria-label={`Go to view ${slot}`} onClick={() => jump(slot)}>
            {slot}
          </button>
        ))}
      </div>
      <p className="camera-points-heading">Save this view as</p>
      <div className="camera-points-grid">
        {SLOTS.map((slot) => (
          <button key={slot} type="button" className="slot-button slot-save" aria-label={`Save view ${slot}`} onClick={() => save(slot)}>
            {slot}
          </button>
        ))}
      </div>
      {status && <p className="menu-note" role="status">{status}</p>}
    </div>
  );
}
