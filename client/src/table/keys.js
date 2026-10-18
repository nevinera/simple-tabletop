// Camera keys (see plans/client.md). Everything reads event.code, the
// physical key, so Shift+= reads as Shift plus Equal on any layout.

// pressed is a Set of event.code values currently held down.
export function motionFromKeys(pressed) {
  const axis = (positive, negative) => (pressed.has(positive) ? 1 : 0) - (pressed.has(negative) ? 1 : 0);
  const shift = pressed.has("ShiftLeft") || pressed.has("ShiftRight");
  const plusMinus = axis("Equal", "Minus");
  return {
    pan: [axis("KeyD", "KeyA"), axis("KeyW", "KeyS")],
    turn: axis("KeyQ", "KeyE"),
    tilt: shift ? plusMinus : 0,
    zoom: (shift ? 0 : plusMinus) + axis("NumpadAdd", "NumpadSubtract"),
  };
}

export function cameraSlotForKey(event) {
  const match = /^(?:Digit|Numpad)([0-9])$/.exec(event.code || "");
  return match ? match[1] : null;
}

// Keys typed into the app's own inputs shouldn't move the camera.
export function isTypingTarget(target) {
  if (!target) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
