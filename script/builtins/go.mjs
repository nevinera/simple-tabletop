// Builds the Go built-in (public/builtins/go): a 19 x 19 board, and a bowl
// of stones for each player that never runs out. All the art is drawn here,
// so it's ours to publish.
//
//   node script/builtins/go.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../public/builtins/go");
const ASSETS = join(OUT, "assets");

const TABLE = 72;
const LINES = 19;
const STEP = 2.2; // cm between lines
const MARGIN = 2; // cm from the outer lines to the board's edge
const BOARD = STEP * (LINES - 1) + MARGIN * 2;
const STONE = 2.1; // cm across a stone
const PX = 40; // board image pixels per cm
const WOOD = "#dcb35c";
const INK = "#2a1d0e";
const STAR_POINTS = [3, 9, 15];

const STONES = {
  black: { light: "#5a5a5a", dark: "#0c0c0c", edge: "#141414" },
  white: { light: "#ffffff", dark: "#d4d0c6", edge: "#d8d4ca" },
};

function boardSvg() {
  const size = BOARD * PX;
  const step = STEP * PX;
  const start = MARGIN * PX;
  const end = start + step * (LINES - 1);
  const lines = [];
  for (let i = 0; i < LINES; i++) {
    const at = start + i * step;
    const width = i === 0 || i === LINES - 1 ? PX * 0.07 : PX * 0.04;
    lines.push(`<line x1="${start}" y1="${at}" x2="${end}" y2="${at}" stroke-width="${width}"/>`);
    lines.push(`<line x1="${at}" y1="${start}" x2="${at}" y2="${end}" stroke-width="${width}"/>`);
  }
  const stars = STAR_POINTS.flatMap((x) => STAR_POINTS.map((y) =>
    `<circle cx="${start + x * step}" cy="${start + y * step}" r="${PX * 0.16}"/>`));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs>
  <linearGradient id="grain" x1="0" y1="0" x2="1" y2="0.15">
    <stop offset="0" stop-color="#e3bd68"/><stop offset="0.5" stop-color="${WOOD}"/><stop offset="1" stop-color="#d2a650"/>
  </linearGradient>
</defs>
<rect width="${size}" height="${size}" rx="${PX * 0.3}" fill="url(#grain)"/>
<g stroke="${INK}" stroke-linecap="square">${lines.join("")}</g>
<g fill="${INK}">${stars.join("")}</g>
</svg>
`;
}

function stoneSvg(color) {
  const { light, dark } = STONES[color];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
<defs>
  <radialGradient id="shine" cx="0.36" cy="0.32" r="0.75">
    <stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/>
  </radialGradient>
</defs>
<circle cx="64" cy="64" r="63" fill="url(#shine)"/>
</svg>
`;
}

function thumbnail() {
  const stone = (color, col, row) =>
    `<circle cx="${88 + col * 28}" cy="${38 + row * 28}" r="12.5" fill="url(#${color})" stroke="${STONES[color].dark}" stroke-width="0.5"/>`;
  const lines = [];
  for (let i = 0; i < 9; i++) {
    lines.push(`<line x1="88" y1="${38 + i * 28}" x2="312" y2="${38 + i * 28}"/>`);
    lines.push(`<line x1="${88 + i * 28}" y1="38" x2="${88 + i * 28}" y2="262"/>`);
  }
  const placed = [
    ["black", 2, 2], ["white", 3, 2], ["black", 3, 3], ["white", 4, 3], ["black", 4, 4], ["white", 5, 4],
    ["black", 2, 5], ["white", 6, 2], ["black", 5, 5], ["white", 4, 5], ["black", 6, 6],
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
<defs>
  <radialGradient id="black" cx="0.36" cy="0.32" r="0.75"><stop offset="0" stop-color="${STONES.black.light}"/><stop offset="1" stop-color="${STONES.black.dark}"/></radialGradient>
  <radialGradient id="white" cx="0.36" cy="0.32" r="0.75"><stop offset="0" stop-color="${STONES.white.light}"/><stop offset="1" stop-color="${STONES.white.dark}"/></radialGradient>
</defs>
<rect width="400" height="300" fill="#2e6b3f"/>
<rect x="74" y="24" width="252" height="252" rx="6" fill="${WOOD}"/>
<g stroke="${INK}" stroke-width="1.5">${lines.join("")}</g>
${placed.map(([color, col, row]) => stone(color, col, row)).join("\n")}
</svg>
`;
}

function manifest() {
  const origin = Number((TABLE / 2 - (STEP * (LINES - 1)) / 2).toFixed(2)); // the near left corner point
  return {
    formatVersion: 1,
    id: "go",
    name: "Go",
    version: "1.0.0",
    table: { size: [TABLE, TABLE], color: "#2e6b3f" },
    layers: [{ id: "board", thickness: 0.1 }, { id: "pieces", thickness: 0.4 }],
    seats: [
      { id: "black", name: "Black", side: "south", color: "#141414" },
      { id: "white", name: "White", side: "north", color: "#f2efe8" },
    ],
    // Stones dropped anywhere near a point land on it.
    snaps: [{ radius: STEP / 2, grid: { origin: [origin, origin], step: [STEP, STEP], count: [LINES, LINES] } }],
    pieceTypes: Object.fromEntries(Object.entries(STONES).map(([color, { edge }]) => [`${color}-stone`, {
      kind: "token", shape: "circle", size: [STONE], thickness: 0.4, face: `assets/${color}.svg`, edge,
    }])),
    pieces: [{ id: "board", kind: "board", size: [BOARD, BOARD], face: "assets/board.svg", position: [TABLE / 2, TABLE / 2], fixed: true }],
    // Each player's bowl sits at their right hand. A captured stone dropped
    // back in a bowl is gone, so set prisoners aside on the table to count them.
    containers: [
      {
        id: "black-bowl", kind: "bag", position: [TABLE / 2 + BOARD / 2 + 6, TABLE / 2 - BOARD / 2 + 6], size: [8, 8],
        infinite: "black-stone", text: "Black", color: "#3a2a18", fixed: true,
      },
      {
        id: "white-bowl", kind: "bag", position: [TABLE / 2 - BOARD / 2 - 6, TABLE / 2 + BOARD / 2 - 6], size: [8, 8],
        rotation: 180, infinite: "white-stone", text: "White", color: "#3a2a18", fixed: true,
      },
    ],
  };
}

mkdirSync(ASSETS, { recursive: true });
writeFileSync(join(ASSETS, "board.svg"), boardSvg());
for (const color of Object.keys(STONES)) writeFileSync(join(ASSETS, `${color}.svg`), stoneSvg(color));
writeFileSync(join(OUT, "thumbnail.svg"), thumbnail());
writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest(), null, 2)}\n`);
console.log(`Wrote ${OUT}`);
