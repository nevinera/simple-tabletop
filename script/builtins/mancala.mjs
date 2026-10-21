// Builds the Mancala built-in (public/builtins/mancala): a wooden board with
// two rows of six pits and a store at each end, and 48 glass seeds, four to
// a pit. The pits and stores are bowls, so seeds lie in view and each shows
// its count. All the art is drawn here, so it's ours to publish.
//
//   node script/builtins/mancala.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../public/builtins/mancala");
const ASSETS = join(OUT, "assets");

const TABLE = [90, 60];
const BOARD = [70, 24];
const PIT = 6.6; // cm across a pit
const PIT_STEP = 7.6; // cm between pits along a row
const ROW_GAP = 4.4; // cm from the board's middle to each row's pits
const STORE = [8, 19];
const SEED = 1.1; // cm across a seed
const SEEDS_PER_PIT = 4;
const PX = 30; // board image pixels per cm
const WOOD = "#a8743f";

const SEED_COLORS = {
  blue: ["#9fd3ff", "#1f5fa8"],
  green: ["#b8f0b0", "#2e7d32"],
  amber: ["#ffe4a0", "#c77d12"],
  ruby: ["#ffb3c0", "#a3162f"],
};

function boardSvg() {
  const [w, h] = BOARD.map((v) => v * PX);
  const grain = Array.from({ length: 14 }, (_, i) => {
    const y = (i + 0.5) * (h / 14);
    const wobble = (i % 3) * 6 - 6;
    return `<path d="M0 ${y} C ${w * 0.3} ${y + wobble} ${w * 0.6} ${y - wobble} ${w} ${y + wobble / 2}" fill="none"
      stroke="#000000" stroke-opacity="0.07" stroke-width="${PX * 0.12}"/>`;
  });
  // Darker hollows where the pits and stores sit, so the board reads as
  // carved even before the bowls draw.
  const hollow = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#5c3a1c" fill-opacity="0.45"/>`;
  const hollows = [];
  for (let i = 0; i < 6; i++) {
    const x = w / 2 + (i - 2.5) * PIT_STEP * PX;
    for (const dy of [-ROW_GAP, ROW_GAP]) hollows.push(hollow(x, h / 2 + dy * PX, (PIT / 2 + 0.3) * PX, (PIT / 2 + 0.3) * PX));
  }
  const storeX = (3 * PIT_STEP + STORE[0] / 2 + 1.2) * PX;
  for (const sx of [-storeX, storeX]) hollows.push(hollow(w / 2 + sx, h / 2, (STORE[0] / 2 + 0.3) * PX, (STORE[1] / 2 + 0.3) * PX));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#b8834c"/><stop offset="0.5" stop-color="${WOOD}"/><stop offset="1" stop-color="#93622f"/>
  </linearGradient>
</defs>
<rect width="${w}" height="${h}" rx="${PX * 2.5}" fill="url(#wood)"/>
${grain.join("\n")}
${hollows.join("\n")}
<rect x="${PX * 0.4}" y="${PX * 0.4}" width="${w - PX * 0.8}" height="${h - PX * 0.8}" rx="${PX * 2.2}" fill="none"
  stroke="#5c3a1c" stroke-opacity="0.5" stroke-width="${PX * 0.15}"/>
</svg>
`;
}

function seedSvg([light, dark]) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
<defs>
  <radialGradient id="glass" cx="0.38" cy="0.34" r="0.7">
    <stop offset="0" stop-color="#ffffff"/><stop offset="0.25" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/>
  </radialGradient>
</defs>
<circle cx="48" cy="48" r="47" fill="url(#glass)"/>
<ellipse cx="38" cy="32" rx="12" ry="8" fill="#ffffff" fill-opacity="0.55"/>
</svg>
`;
}

function thumbnail() {
  const seed = (x, y, color) => `<circle cx="${x}" cy="${y}" r="6" fill="${SEED_COLORS[color][1]}" stroke="${SEED_COLORS[color][0]}" stroke-width="2"/>`;
  const colors = Object.keys(SEED_COLORS);
  const pits = [];
  for (let i = 0; i < 6; i++) {
    for (const [row, cy] of [[0, 122], [1, 178]]) {
      const cx = 95 + i * 42;
      pits.push(`<circle cx="${cx}" cy="${cy}" r="18" fill="#6b4422"/>`);
      [[-6, -5], [6, -5], [-6, 6], [6, 6]].forEach(([dx, dy], k) => pits.push(seed(cx + dx, cy + dy, colors[(i + row + k) % 4])));
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
<rect width="400" height="300" fill="#2e6b3f"/>
<rect x="20" y="85" width="360" height="130" rx="30" fill="${WOOD}"/>
<ellipse cx="48" cy="150" rx="18" ry="50" fill="#6b4422"/>
<ellipse cx="352" cy="150" rx="18" ry="50" fill="#6b4422"/>
${seed(345, 140, "ruby")}${seed(356, 158, "blue")}${seed(46, 150, "amber")}
${pits.join("\n")}
</svg>
`;
}

function manifest() {
  const [cx, cy] = TABLE.map((v) => v / 2);
  const colors = Object.keys(SEED_COLORS);
  const pieces = [{ id: "board", kind: "board", size: BOARD, face: "assets/board.svg", position: [cx, cy], fixed: true }];
  const containers = [];
  let seedNumber = 0;
  // South's pits run left to right along the near row, North's left to right
  // as North sees them along the far row. Each player's store is at their
  // right hand.
  for (const [player, y, toward] of [["south", cy - ROW_GAP, 1], ["north", cy + ROW_GAP, -1]]) {
    for (let i = 0; i < 6; i++) {
      const members = [];
      for (let k = 0; k < SEEDS_PER_PIT; k++) {
        seedNumber += 1;
        const id = `seed-${seedNumber}`;
        pieces.push({ id, type: `${colors[seedNumber % colors.length]}-seed` });
        members.push(id);
      }
      containers.push({
        id: `${player}-pit-${i + 1}`, kind: "bowl", position: [cx + toward * (i - 2.5) * PIT_STEP, y], size: [PIT],
        color: "#7a4e27", fixed: true, members,
      });
    }
    containers.push({
      id: `${player}-store`, kind: "bowl", position: [cx + toward * (3 * PIT_STEP + STORE[0] / 2 + 1.2), cy], size: STORE,
      color: "#7a4e27", fixed: true,
    });
  }
  return {
    formatVersion: 1,
    id: "mancala",
    name: "Mancala",
    version: "1.0.0",
    table: { size: TABLE, color: "#2e6b3f" },
    layers: [{ id: "board", thickness: 0.6 }, { id: "pieces", thickness: 0.5 }],
    seats: [
      { id: "south", name: "South", side: "south", color: "#c77d12" },
      { id: "north", name: "North", side: "north", color: "#1f5fa8" },
    ],
    pieceTypes: Object.fromEntries(Object.keys(SEED_COLORS).map((color) => [`${color}-seed`, {
      kind: "token", shape: "circle", size: [SEED], thickness: 0.5, face: `assets/${color}.svg`, back: `assets/${color}.svg`,
      edge: SEED_COLORS[color][1],
    }])),
    pieces,
    containers,
  };
}

mkdirSync(ASSETS, { recursive: true });
writeFileSync(join(ASSETS, "board.svg"), boardSvg());
for (const [color, shades] of Object.entries(SEED_COLORS)) writeFileSync(join(ASSETS, `${color}.svg`), seedSvg(shades));
writeFileSync(join(OUT, "thumbnail.svg"), thumbnail());
writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest(), null, 2)}\n`);
console.log(`Wrote ${OUT}`);
