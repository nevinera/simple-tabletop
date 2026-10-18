import { useEffect } from "react";
import { cameraSlotForKey, isTypingTarget, motionFromKeys } from "./table/keys";

// Wires the camera keys to the scene: held keys drive continuous motion, and
// digits jump to or (with Shift) save camera points.
export function useTableKeys(scene, cameraPoints) {
  useEffect(() => {
    if (!scene) return undefined;
    const pressed = new Set();
    const update = () => scene.setMotion("keys", motionFromKeys(pressed));

    const onKeyDown = (event) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const slot = cameraSlotForKey(event);
      if (slot) {
        if (!event.repeat) {
          if (event.shiftKey) cameraPoints.save(slot);
          else cameraPoints.jump(slot);
        }
        return;
      }
      pressed.add(event.code);
      update();
    };
    const onKeyUp = (event) => {
      pressed.delete(event.code);
      update();
    };
    // Keys released while the window is in the background never send keyup.
    const onBlur = () => {
      pressed.clear();
      update();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      scene.setMotion("keys", null);
    };
  }, [scene, cameraPoints]);
}
