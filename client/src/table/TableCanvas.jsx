import { useEffect, useRef } from "react";
import { TableScene } from "./scene";
import { CameraSlots } from "./cameraSlots";

export default function TableCanvas({ gameId }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const scene = new TableScene(containerRef.current);
    const slots = new CameraSlots(localStorage, gameId || "sandbox");

    const onKeyDown = (event) => {
      const slot = CameraSlots.slotForKey(event);
      if (!slot) return;
      if (event.shiftKey) {
        slots.save(slot, scene.cameraView());
      } else {
        const view = slots.load(slot);
        if (view) scene.setCameraView(view);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      scene.dispose();
    };
  }, [gameId]);

  return <div className="table-canvas" ref={containerRef} />;
}
