import { useEffect, useRef, useState } from "react";
import { TableScene } from "./scene";
import { PieceInteraction } from "./interaction";
import { isTypingTarget } from "./keys";

// Mounts a TableScene, hands it to the parent through onScene, shows the
// manifest on it, re-renders pieces whenever the store changes, and turns
// pointer events into piece actions.
export default function TableCanvas({ manifest, store, playerId, onScene, onError }) {
  const containerRef = useRef(null);
  const [scene, setScene] = useState(null);

  useEffect(() => {
    const created = new TableScene(containerRef.current);
    setScene(created);
    onScene(created);
    return () => {
      onScene(null);
      created.dispose();
    };
  }, [onScene]);

  useEffect(() => {
    if (scene && manifest) scene.show(manifest).catch(onError);
  }, [scene, manifest, onError]);

  useEffect(() => {
    if (!scene || !store) return undefined;
    scene.render(store.getState());
    return store.subscribe((state) => scene.render(state));
  }, [scene, store]);

  useEffect(() => {
    if (!scene || !store || !manifest) return undefined;
    const canvas = scene.canvas;
    const interaction = new PieceInteraction({
      store,
      manifest,
      playerId,
      pick: (x, y) => scene.pick(x, y),
      tablePoint: (x, y, pieceId) => scene.tablePoint(x, y, pieceId),
      clampToTable: (point) => scene.clampToTable(point),
      setCameraEnabled: (enabled) => scene.setCameraEnabled(enabled),
      setCursor: (cursor) => { canvas.style.cursor = cursor; },
    });

    // Capture phase, so a piece gesture can turn the camera off before
    // OrbitControls sees the same pointerdown.
    const onPointerDown = (event) => {
      if (interaction.pointerDown(event)) canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event) => interaction.pointerMove(event);
    const onPointerUp = (event) => interaction.pointerUp(event);
    const onPointerCancel = (event) => interaction.pointerCancel(event);
    const onKeyDown = (event) => {
      if (event.code === "Escape" && !isTypingTarget(event.target)) interaction.cancelSelection();
    };

    canvas.addEventListener("pointerdown", onPointerDown, { capture: true });
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown, { capture: true });
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [scene, store, manifest, playerId]);

  return <div className="table-canvas" ref={containerRef} />;
}
