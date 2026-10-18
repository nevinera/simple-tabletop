import { useEffect } from "react";
import { cameraSlotForKey, isTypingTarget, motionFromKeys } from "./table/keys";

const ROTATE_STEP = 45;
const FINE_ROTATE_STEP = 22.5;

// Wires keys to the table: held camera keys drive continuous motion, digits
// jump to or (with Shift) save camera points, F/R/T flip and rotate the
// selected or hovered object, G draws from the hovered deck (Shift+G into
// your hand), L locks and unlocks, and Esc calls onEscape.
export function useTableKeys({ scene, cameraPoints, interaction, onEscape }) {
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
      switch (event.code) {
        case "Escape":
          onEscape();
          return;
        case "KeyF":
          if (!event.repeat) interaction?.flip();
          return;
        case "KeyR":
          interaction?.rotate(-(event.shiftKey ? FINE_ROTATE_STEP : ROTATE_STEP));
          return;
        case "KeyT":
          interaction?.rotate(event.shiftKey ? FINE_ROTATE_STEP : ROTATE_STEP);
          return;
        case "KeyG":
          if (!event.repeat) interaction?.draw(undefined, { toHand: event.shiftKey });
          return;
        case "KeyL":
          if (!event.repeat) interaction?.lock();
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
  }, [scene, cameraPoints, interaction, onEscape]);
}
