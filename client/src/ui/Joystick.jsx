import { useEffect, useRef } from "react";
import nipplejs from "nipplejs";

// Touch-stick wrapper around nipplejs, copied from Delve. Reports each move
// as the raw nipplejs event data (angle/force/vector) via onMove, and calls
// onEnd when released or dragged back into the deadzone.
export function Joystick({ onMove, onEnd, className, label }) {
  const zoneRef = useRef(null);

  useEffect(() => {
    if (!zoneRef.current) return undefined;

    const manager = nipplejs.create({
      zone: zoneRef.current,
      mode: "static",
      position: { left: "50%", top: "50%" },
      color: "white",
      size: 100,
    });

    // This version of nipplejs (1.0.4) calls handlers with a single `evt`
    // argument (evt.type, evt.data), not the classic two-arg (evt, data)
    // signature most nipplejs examples show.
    manager.on("move", (evt) => {
      const data = evt.data;
      if (!data.angle || data.force < 0.1) { onEnd?.(); return; }
      onMove?.(data);
    });
    manager.on("end", () => onEnd?.());

    return () => manager.destroy();
  }, [onMove, onEnd]);

  return <div ref={zoneRef} className={className} aria-label={label} />;
}
