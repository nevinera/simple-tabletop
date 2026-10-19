import { useEffect } from "react";

const SHOW_MS = 1500;

// "Sam has that" by the pointer, in Sam's seat color, when someone else got
// to something first. chip is { name, color, x, y }.
export function RaceChip({ chip, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(timer);
  }, [chip, onDone]);

  return (
    <div className="race-chip" role="status" style={{ left: chip.x, top: chip.y, background: chip.color }}>
      {chip.name} has that
    </div>
  );
}
