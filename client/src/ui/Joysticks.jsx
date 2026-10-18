import { useCallback, useEffect, useRef } from "react";
import { Joystick } from "./Joystick";

export const JOYSTICK_IDLE_MS = 10_000;
const SOURCES = ["joystick-pan", "joystick-look"];

// Two sticks over the table: the left one pans, the right one turns and
// tilts. Calls onIdle once neither stick has been held for
// JOYSTICK_IDLE_MS, so the caller can hide them.
export function Joysticks({ scene, onIdle }) {
  const idleTimer = useRef(null);
  const held = useRef(new Set());

  const startIdleTimer = useCallback(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(onIdle, JOYSTICK_IDLE_MS);
  }, [onIdle]);

  useEffect(() => {
    startIdleTimer();
    return () => {
      clearTimeout(idleTimer.current);
      SOURCES.forEach((source) => scene?.setMotion(source, null));
    };
  }, [startIdleTimer, scene]);

  // nipplejs vectors are unit-length with y pointing up; force grows past 1
  // as the knob is pushed beyond the base, so cap it.
  const stick = (source, toMotion) => ({
    onMove: ({ vector, force }) => {
      held.current.add(source);
      clearTimeout(idleTimer.current);
      const strength = Math.min(force, 1);
      scene?.setMotion(source, toMotion(vector.x * strength, vector.y * strength));
    },
    onEnd: () => {
      held.current.delete(source);
      scene?.setMotion(source, null);
      if (held.current.size === 0) startIdleTimer();
    },
  });

  const pan = useStick(stick("joystick-pan", (x, y) => ({ pan: [x, y] })));
  const look = useStick(stick("joystick-look", (x, y) => ({ turn: -x, tilt: y })));

  return (
    <div className="joysticks">
      <Joystick className="joystick joystick-left" label="Pan" {...pan} />
      <Joystick className="joystick joystick-right" label="Turn and tilt" {...look} />
    </div>
  );
}

// Joystick re-creates its nipplejs manager whenever its handlers change, so
// keep them stable and route calls to the latest ones.
function useStick(handlers) {
  const latest = useRef(handlers);
  latest.current = handlers;
  const onMove = useCallback((data) => latest.current.onMove(data), []);
  const onEnd = useCallback(() => latest.current.onEnd(), []);
  return { onMove, onEnd };
}
