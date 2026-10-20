// Builds the Chess built-in (public/builtins/chess): a board, and pieces done
// the way magnetic travel sets do them, as discs with a piece drawn on top.
// All the art is drawn here, so it's ours to publish.
//
//   node script/builtins/chess.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../public/builtins/chess");
const ASSETS = join(OUT, "assets");

const TABLE = 64;
const SQUARE = 5.5; // cm
const BORDER = 2.2; // cm around the squares, for the coordinates
const BOARD = SQUARE * 8 + BORDER * 2;
const PIECE = 4.6; // cm across a disc
const PX = 40; // board image pixels per cm
const LIGHT = "#ecd9b0";
const DARK = "#8b5a2b";
const FRAME = "#5a3a20";

// Each piece's silhouette in a 100 x 100 box, standing on y = 90. `cut`
// lines are details drawn in the outline color over the fill.
const SHAPES = {
  pawn: {
    body: `<circle cx="50" cy="27" r="13"/><rect x="35" y="41" width="30" height="7" rx="3"/>
      <path d="M40 47 C40 62 34 72 29 80 L71 80 C66 72 60 62 60 47 Z"/><rect x="23" y="79" width="54" height="11" rx="4"/>`,
  },
  rook: {
    body: `<path d="M29 40 L29 17 L38 17 L38 25 L46 25 L46 17 L54 17 L54 25 L62 25 L62 17 L71 17 L71 40 Z"/>
      <rect x="28" y="38" width="44" height="7" rx="2"/><path d="M34 44 L66 44 L69 80 L31 80 Z"/>
      <rect x="23" y="79" width="54" height="11" rx="4"/>`,
  },
  knight: {
    body: `<path d="M30 80 C30 68 34 58 42 49 C36 47 31 49 26 51 C19 53 15 48 17 42 C21 30 29 20 37 15 L41 7 L45 14
      C56 16 66 24 70 38 C74 52 71 64 71 80 Z"/><rect x="23" y="79" width="54" height="11" rx="4"/>`,
    cut: `<circle cx="40" cy="27" r="3.2"/>`,
  },
  bishop: {
    body: `<circle cx="50" cy="10" r="5.5"/><path d="M50 15 C37 26 33 37 37 48 L63 48 C67 37 63 26 50 15 Z"/>
      <rect x="35" y="47" width="30" height="7" rx="3"/><path d="M42 53 L58 53 C59 64 62 72 66 80 L34 80 C38 72 41 64 42 53 Z"/>
      <rect x="23" y="79" width="54" height="11" rx="4"/>`,
    cut: `<path d="M57 25 L46 39" stroke-width="4" stroke-linecap="round"/>`,
  },
  queen: {
    body: `<circle cx="22" cy="21" r="5"/><circle cx="36" cy="14" r="5"/><circle cx="50" cy="10" r="5"/>
      <circle cx="64" cy="14" r="5"/><circle cx="78" cy="21" r="5"/>
      <path d="M28 48 L22 24 L36 38 L36 17 L45 36 L50 13 L55 36 L64 17 L64 38 L78 24 L72 48 Z"/>
      <rect x="27" y="46" width="46" height="7" rx="3"/><path d="M33 52 L67 52 C67 64 70 72 73 80 L27 80 C30 72 33 64 33 52 Z"/>
      <rect x="21" y="79" width="58" height="11" rx="4"/>`,
  },
  king: {
    body: `<rect x="46" y="4" width="8" height="22" rx="1.5"/><rect x="39" y="10" width="22" height="7" rx="1.5"/>
      <path d="M30 47 C24 37 28 27 39 27 L61 27 C72 27 76 37 70 47 Z"/>
      <rect x="27" y="46" width="46" height="7" rx="3"/><path d="M33 52 L67 52 C67 64 70 72 73 80 L27 80 C30 72 33 64 33 52 Z"/>
      <rect x="21" y="79" width="58" height="11" rx="4"/>`,
  },
};

const SIDES = {
  white: { disc: "#e6dcc4", ring: "#8a7a5a", fill: "#fffdf7", ink: "#1c1c1c" },
  black: { disc: "#3a3632", ring: "#1a1816", fill: "#161412", ink: "#ece4d0" },
};

function pieceSvg(kind, side) {
  const { disc, ring, fill, ink } = SIDES[side];
  const shape = SHAPES[kind];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<circle cx="128" cy="128" r="126" fill="${disc}"/>
<circle cx="128" cy="128" r="116" fill="none" stroke="${ring}" stroke-width="5"/>
<g transform="translate(38 36) scale(1.8)">
  <g fill="${fill}" stroke="${ink}" stroke-width="3.2" stroke-linejoin="round">${shape.body}</g>
  ${shape.cut ? `<g fill="${ink}" stroke="${ink}">${shape.cut}</g>` : ""}
</g>
</svg>
`;
}

function boardSvg() {
  const size = BOARD * PX;
  const square = SQUARE * PX;
  const edge = BORDER * PX;
  const cells = [];
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      // a1, at White's near left, is dark.
      const dark = (rank + file) % 2 === 0;
      const x = edge + file * square;
      const y = edge + (7 - rank) * square;
      cells.push(`<rect x="${x}" y="${y}" width="${square}" height="${square}" fill="${dark ? DARK : LIGHT}"/>`);
    }
  }
  const label = (text, x, y) =>
    `<text x="${x}" y="${y}" font-family="Georgia, 'Times New Roman', serif" font-size="${edge * 0.5}" fill="${LIGHT}"
      text-anchor="middle" dominant-baseline="central">${text}</text>`;
  const labels = [];
  for (let i = 0; i < 8; i++) {
    const along = edge + (i + 0.5) * square;
    const file = "abcdefgh"[i];
    labels.push(label(file, along, size - edge / 2), `<g transform="rotate(180 ${along} ${edge / 2})">${label(file, along, edge / 2)}</g>`);
    const rankY = edge + (7 - i + 0.5) * square;
    labels.push(label(i + 1, edge / 2, rankY), `<g transform="rotate(180 ${size - edge / 2} ${rankY})">${label(i + 1, size - edge / 2, rankY)}</g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" rx="${PX * 0.4}" fill="${FRAME}"/>
${cells.join("\n")}
<rect x="${edge}" y="${edge}" width="${square * 8}" height="${square * 8}" fill="none" stroke="#3a2614" stroke-width="${PX * 0.08}"/>
${labels.join("\n")}
</svg>
`;
}

const BACK_RANK = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

function thumbnail() {
  const disc = (kind, side, x, y) => {
    const { disc, ring, fill, ink } = SIDES[side];
    const shape = SHAPES[kind];
    return `<g transform="translate(${x - 28} ${y - 28}) scale(0.22)">
  <circle cx="128" cy="128" r="126" fill="${disc}"/><circle cx="128" cy="128" r="116" fill="none" stroke="${ring}" stroke-width="5"/>
  <g transform="translate(38 36) scale(1.8)"><g fill="${fill}" stroke="${ink}" stroke-width="3.2" stroke-linejoin="round">${shape.body}</g>
  ${shape.cut ? `<g fill="${ink}" stroke="${ink}">${shape.cut}</g>` : ""}</g></g>`;
  };
  const squares = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 7; col++) {
      squares.push(`<rect x="${60 + col * 40}" y="${50 + row * 40}" width="40" height="40" fill="${(row + col) % 2 ? DARK : LIGHT}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
<rect width="400" height="300" fill="#2e6b3f"/>
<rect x="50" y="40" width="300" height="220" rx="6" fill="${FRAME}"/>
${squares.join("\n")}
${disc("king", "black", 160, 90)}${disc("queen", "white", 240, 130)}${disc("knight", "black", 120, 170)}
${disc("bishop", "white", 280, 210)}${disc("rook", "white", 200, 210)}${disc("pawn", "black", 240, 90)}
</svg>
`;
}

function manifest() {
  const origin = TABLE / 2 - SQUARE * 4 + SQUARE / 2; // a1's center
  const spot = (file, rank) => [Number((origin + file * SQUARE).toFixed(2)), Number((origin + rank * SQUARE).toFixed(2))];
  const pieces = [{ id: "board", kind: "board", size: [BOARD, BOARD], face: "assets/board.svg", position: [TABLE / 2, TABLE / 2], fixed: true }];
  for (const side of ["white", "black"]) {
    const [backRank, pawnRank] = side === "white" ? [0, 1] : [7, 6];
    // Black's pieces face the far side, so they read upright to Black.
    const rotation = side === "white" ? 0 : 180;
    BACK_RANK.forEach((kind, file) => {
      pieces.push({ id: `${side}-${kind}-${"abcdefgh"[file]}`, type: `${side}-${kind}`, position: spot(file, backRank), rotation });
    });
    for (let file = 0; file < 8; file++) {
      pieces.push({ id: `${side}-pawn-${"abcdefgh"[file]}`, type: `${side}-pawn`, position: spot(file, pawnRank), rotation });
    }
  }
  const pieceTypes = {};
  for (const side of ["white", "black"]) {
    for (const kind of Object.keys(SHAPES)) {
      pieceTypes[`${side}-${kind}`] = {
        kind: "token", shape: "circle", size: [PIECE], thickness: 0.5, face: `assets/${side}-${kind}.svg`, edge: SIDES[side].disc,
      };
    }
  }
  return {
    formatVersion: 1,
    id: "chess",
    name: "Chess",
    version: "1.0.0",
    table: { size: [TABLE, TABLE], color: "#2e6b3f" },
    layers: [{ id: "board", thickness: 0.1 }, { id: "pieces", thickness: 0.5 }],
    seats: [
      { id: "white", name: "White", side: "south", color: "#e6dcc4" },
      { id: "black", name: "Black", side: "north", color: "#3a3632" },
    ],
    pieceTypes,
    pieces,
  };
}

mkdirSync(ASSETS, { recursive: true });
writeFileSync(join(ASSETS, "board.svg"), boardSvg());
for (const side of ["white", "black"]) {
  for (const kind of Object.keys(SHAPES)) writeFileSync(join(ASSETS, `${side}-${kind}.svg`), pieceSvg(kind, side));
}
writeFileSync(join(OUT, "thumbnail.svg"), thumbnail());
writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest(), null, 2)}\n`);
console.log(`Wrote ${OUT}`);
