import { useId } from "react";
import { topFace } from "../table/diceGeometry";
import { labelSize } from "../state/dice";

const INK = "#2a2a2a";
const DIM = 0x5c / 0xff; // how dark unlit regions are, as on the table
const PADDING = 0.04;

// A die's top face, drawn flat and large. Lit regions (the whole face, or a
// d4's corner sections at its top point) show in the die's color, and the
// rest are dimmed by a dark wash. die and value come from visibleSide().
export function DieFace({ die, value }) {
  const clipPrefix = useId();
  const { outline, regions } = topFace(die.sides, value);
  const xs = outline.map(([x]) => x);
  const ys = outline.map(([, y]) => y);
  const [left, top] = [Math.min(...xs) - PADDING, Math.min(...ys) - PADDING];
  const [width, height] = [Math.max(...xs) - left + PADDING, Math.max(...ys) - top + PADDING];

  return (
    <svg className="magnifier-die" viewBox={`${left} ${top} ${width} ${height}`} role="img" aria-label={faceName(die, value)}>
      {regions.map((region, i) => {
        const clipId = `${clipPrefix}-${i}`;
        const points = region.polygon.map((p) => p.join(",")).join(" ");
        const lit = region.label === value;
        return (
          <g key={i}>
            <clipPath id={clipId}><polygon points={points} /></clipPath>
            <g clipPath={`url(#${clipId})`}>
              <polygon points={points} fill={die.color} />
              <g transform={`translate(${region.center.join(" ")}) rotate(${region.turn})`}>
                {die.labels ? (
                  <Label text={die.labels[region.label]} sides={die.sides} extent={region.extent} />
                ) : (
                  <Art image={die.images[region.label]} extent={region.extent} />
                )}
              </g>
              {!lit && <polygon points={points} fill="#000" opacity={1 - DIM} />}
            </g>
          </g>
        );
      })}
      <polygon points={outline.map((p) => p.join(",")).join(" ")} fill="none" stroke="#3a3a3a" strokeWidth={0.006} />
    </svg>
  );
}

// Sized like the label textures on the 3D die.
function Label({ text, sides, extent }) {
  const size = labelSize(text, sides) * extent;
  const underline = sides >= 6 && (text === "6" || text === "9");
  return (
    <>
      <text
        fill={INK}
        fontSize={size}
        fontWeight={700}
        fontFamily="system-ui, sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {text}
      </text>
      {underline && <rect x={-size * 0.28} y={size * 0.42} width={size * 0.56} height={size * 0.08} fill={INK} />}
    </>
  );
}

// A custom die's face image, cropped to its sheet cell.
function Art({ image, extent }) {
  const half = extent / 2;
  const columns = image.columns || 1;
  const rows = image.rows || 1;
  const index = image.index || 0;
  return (
    <svg
      x={-half}
      y={-half}
      width={extent}
      height={extent}
      viewBox={`${index % columns} ${Math.floor(index / columns)} 1 1`}
      preserveAspectRatio="none"
    >
      <image href={image.url} width={columns} height={rows} preserveAspectRatio="none" />
    </svg>
  );
}

function faceName(die, value) {
  return die.labels ? `${die.name} showing ${die.labels[value]}` : `${die.name} showing face ${value + 1}`;
}
