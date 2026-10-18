import { useEffect, useRef, useState } from "react";
import { TableScene } from "./scene";
import { PieceInteraction } from "./interaction";

// Mounts a TableScene, shows the manifest on it, re-renders pieces whenever
// the store changes, and turns pointer events into piece actions. The scene
// and the PieceInteraction go up to the parent through onScene and
// onInteraction, for keys and menus.
export default function TableCanvas({
  manifest, store, playerId, onScene, onInteraction, onContextMenu, onHover, onMagnify, onError,
}) {
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
      tablePoint: (x, y, id) => scene.tablePoint(x, y, id),
      clampToTable: (point) => scene.clampToTable(point),
      setCameraEnabled: (enabled) => scene.setCameraEnabled(enabled),
      setCursor: (cursor) => { canvas.style.cursor = cursor; },
      onContextMenu: (menu) => onContextMenu(menu),
      onBlockedRotate: (id, degrees) => scene.wiggle(id, degrees),
      onHover: (id) => onHover(id),
      onMagnify: (id) => onMagnify(id),
    });
    onInteraction(interaction);

    // Capture phase, so a piece gesture can turn the camera off before
    // OrbitControls sees the same pointerdown.
    const onPointerDown = (event) => {
      if (interaction.pointerDown(event)) canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event) => interaction.pointerMove(event);
    const onPointerUp = (event) => interaction.pointerUp(event);
    const onPointerCancel = (event) => interaction.pointerCancel(event);
    const onPointerLeave = () => interaction.pointerLeave();

    canvas.addEventListener("pointerdown", onPointerDown, { capture: true });
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("pointerleave", onPointerLeave);
    return () => {
      onInteraction(null);
      canvas.removeEventListener("pointerdown", onPointerDown, { capture: true });
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [scene, store, manifest, playerId, onInteraction, onContextMenu, onHover, onMagnify]);

  return <div className="table-canvas" ref={containerRef} />;
}
