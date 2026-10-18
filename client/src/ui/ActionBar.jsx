import { useState } from "react";
import { Menu } from "./Menu";
import { PieceActions } from "./PieceActions";

const SLOTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const ZOOM_STEP = 0.8;

export function ActionBar({
  scene, interaction, selectedPiece, cameraPoints, menus, joysticksVisible, setJoysticksVisible,
}) {
  return (
    <nav className="action-bar" aria-label="Action bar">
      <Menu id="camera-points" label="Views" icon="🎥" {...menus}>
        <CameraPointsPanel cameraPoints={cameraPoints} />
      </Menu>
      <Menu
        id="piece"
        label="Piece"
        icon="⟳"
        disabled={!selectedPiece || !interaction}
        title={selectedPiece ? "Flip or rotate the selected piece" : "Select a piece to flip or rotate it"}
        {...menus}
      >
        <PieceActions interaction={interaction} pieceId={selectedPiece} />
      </Menu>
      <button type="button" className="bar-button" aria-label="Zoom in" onClick={() => scene?.zoomBy(ZOOM_STEP)}>
        <span aria-hidden="true">＋</span>
      </button>
      <button type="button" className="bar-button" aria-label="Zoom out" onClick={() => scene?.zoomBy(1 / ZOOM_STEP)}>
        <span aria-hidden="true">－</span>
      </button>
      <button
        type="button"
        className={`bar-button${joysticksVisible ? " active" : ""}`}
        aria-label="Joysticks"
        aria-pressed={joysticksVisible}
        onClick={() => setJoysticksVisible(!joysticksVisible)}
      >
        <span aria-hidden="true">🕹</span>
      </button>
    </nav>
  );
}

function CameraPointsPanel({ cameraPoints }) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const choose = (slot) => {
    if (saving) {
      cameraPoints.save(slot);
      setStatus(`Saved view ${slot}`);
      setSaving(false);
    } else {
      cameraPoints.jump(slot);
      setStatus(`Jumped to view ${slot}`);
    }
  };

  return (
    <div className="camera-points">
      <div className="camera-points-grid">
        {SLOTS.map((slot) => (
          <button key={slot} type="button" className="slot-button" onClick={() => choose(slot)}>
            {slot}
          </button>
        ))}
      </div>
      <label className="menu-row">
        <input type="checkbox" checked={saving} onChange={(event) => setSaving(event.target.checked)} />
        Save the current view
      </label>
      {status && <p className="menu-note" role="status">{status}</p>}
    </div>
  );
}
