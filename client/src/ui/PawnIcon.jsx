import { pawnOutline } from "../state/pawnShapes";

// A pawn's silhouette in its color, for the magnifier and bag contents.
export function PawnIcon({ pawn, className }) {
  const points = pawnOutline(pawn.shape).map(([x, y]) => `${(x + 0.5).toFixed(3)},${(1 - y).toFixed(3)}`).join(" ");
  return (
    <svg className={className} viewBox="-0.1 -0.1 1.2 1.2" role="img" aria-label={`${pawn.shape} pawn`}>
      <polygon points={points} fill={pawn.color} stroke="rgba(0, 0, 0, 0.45)" strokeWidth="0.02" strokeLinejoin="round" />
    </svg>
  );
}
