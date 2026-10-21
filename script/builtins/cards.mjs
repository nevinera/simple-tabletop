// Builds the Cards built-in (public/builtins/cards): a standard 52-card deck
// with two jokers, a card back, poker chips in five values, a thumbnail, and
// the manifest. All the art is drawn here, so it's ours to publish.
//
//   node script/builtins/cards.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../public/builtins/cards");
const ASSETS = join(OUT, "assets");

const CELL = [250, 350]; // pixels per card on the sheet, the shape of a 6.3 x 8.8 cm poker card
const CARD_SIZE = [6.3, 8.8];
const COLUMNS = 13;
const ROWS = 5;
const RED = "#c0392b";
const BLACK = "#1f1f1f";
const SERIF = "Georgia, 'Times New Roman', serif";

const SUITS = [
  { key: "S", name: "spades", color: BLACK, tint: "#ecebe7" },
  { key: "H", name: "hearts", color: RED, tint: "#f8e6e2" },
  { key: "D", name: "diamonds", color: RED, tint: "#f8e6e2" },
  { key: "C", name: "clubs", color: BLACK, tint: "#ecebe7" },
];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// Suit shapes in a 100 x 100 box, drawn as paths so they look the same on
// every system (the Unicode suits turn into emoji on some).
const SUIT_SHAPES = {
  S: `<path d="M50 2 C38 22 4 40 4 64 C4 80 16 90 30 90 C38 90 44 86 47 80 C46 90 40 96 32 100 L68 100 C60 96 54 90 53 80 C56 86 62 90 70 90 C84 90 96 80 96 64 C96 40 62 22 50 2 Z"/>`,
  H: `<path d="M50 96 C30 78 2 58 2 32 C2 14 16 4 30 4 C40 4 47 10 50 18 C53 10 60 4 70 4 C84 4 98 14 98 32 C98 58 70 78 50 96 Z"/>`,
  D: `<path d="M50 2 L88 50 L50 98 L12 50 Z"/>`,
  C: `<circle cx="50" cy="27" r="23"/><circle cx="25" cy="60" r="23"/><circle cx="75" cy="60" r="23"/><path d="M45 55 L55 55 C55 78 60 92 68 100 L32 100 C40 92 45 78 45 55 Z"/>`,
};

// A suit shape centered on (x, y), size pixels across, upside down if flipped.
function pip(suit, x, y, size, flipped = false) {
  const scale = size / 100;
  const turn = flipped ? ` rotate(180 50 50)` : "";
  return `<g transform="translate(${x - size / 2} ${y - size / 2}) scale(${scale})${turn}" fill="${suit.color}">${SUIT_SHAPES[suit.key]}</g>`;
}

// Where each number card's pips go, as [x, y] in a card's 250 x 350 box. The
// lower half's pips turn upside down, as on a real deck.
const L = 78;
const C = 125;
const R = 172;
const PIPS = {
  2: [[C, 92], [C, 258]],
  3: [[C, 92], [C, 175], [C, 258]],
  4: [[L, 92], [R, 92], [L, 258], [R, 258]],
  5: [[L, 92], [R, 92], [C, 175], [L, 258], [R, 258]],
  6: [[L, 92], [R, 92], [L, 175], [R, 175], [L, 258], [R, 258]],
  7: [[L, 92], [R, 92], [C, 133], [L, 175], [R, 175], [L, 258], [R, 258]],
  8: [[L, 92], [R, 92], [C, 133], [L, 175], [R, 175], [C, 217], [L, 258], [R, 258]],
  9: [[L, 92], [R, 92], [L, 147], [R, 147], [C, 175], [L, 203], [R, 203], [L, 258], [R, 258]],
  10: [[L, 92], [R, 92], [C, 120], [L, 147], [R, 147], [L, 203], [R, 203], [C, 230], [L, 258], [R, 258]],
};

function corner(rank, suit) {
  const index = `<text x="27" y="48" font-family="${SERIF}" font-weight="bold" font-size="${rank === "10" ? 34 : 40}"
    text-anchor="middle" fill="${suit.color}">${rank}</text>${pip(suit, 27, 72, 26)}`;
  return `${index}<g transform="rotate(180 125 175)">${index}</g>`;
}

function blank(x, y) {
  return `<rect x="${x + 3}" y="${y + 3}" width="${CELL[0] - 6}" height="${CELL[1] - 6}" rx="16" fill="#fdfcf8" stroke="#c9c4b8" stroke-width="2"/>`;
}

function face(rank, suit) {
  if (rank === "A") return pip(suit, 125, 175, suit.key === "S" ? 120 : 96);
  if (PIPS[rank]) return PIPS[rank].map(([x, y]) => pip(suit, x, y, 40, y > 175)).join("");
  // Court cards: a framed letter with the suit above and below it.
  return `<rect x="58" y="62" width="134" height="226" rx="8" fill="none" stroke="${suit.color}" stroke-width="3"/>
    <rect x="66" y="70" width="118" height="210" rx="5" fill="${suit.tint}"/>
    <text x="125" y="214" font-family="${SERIF}" font-weight="bold" font-size="120" text-anchor="middle" fill="${suit.color}">${rank}</text>
    ${pip(suit, 125, 104, 40)}${pip(suit, 125, 250, 40, true)}`;
}

function joker(color) {
  const star = (x, y, r) => {
    const points = Array.from({ length: 10 }, (_, i) => {
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const radius = i % 2 ? r * 0.42 : r;
      return `${(x + radius * Math.cos(angle)).toFixed(1)},${(y + radius * Math.sin(angle)).toFixed(1)}`;
    });
    return `<polygon points="${points.join(" ")}" fill="${color}"/>`;
  };
  const word = [..."JOKER"].map((letter, i) =>
    `<text x="27" y="${50 + i * 30}" font-family="${SERIF}" font-weight="bold" font-size="28" text-anchor="middle" fill="${color}">${letter}</text>`).join("");
  return `${word}<g transform="rotate(180 125 175)">${word}</g>${star(125, 175, 70)}`;
}

function sheet() {
  const cells = [];
  SUITS.forEach((suit, row) => {
    RANKS.forEach((rank, column) => {
      const [x, y] = [column * CELL[0], row * CELL[1]];
      cells.push(`<g>${blank(x, y)}<g transform="translate(${x} ${y})">${corner(rank, suit)}${face(rank, suit)}</g></g>`);
    });
  });
  [RED, BLACK].forEach((color, column) => {
    const [x, y] = [column * CELL[0], 4 * CELL[1]];
    cells.push(`<g>${blank(x, y)}<g transform="translate(${x} ${y})">${joker(color)}</g></g>`);
  });
  const [width, height] = [CELL[0] * COLUMNS, CELL[1] * ROWS];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${cells.join("\n")}\n</svg>\n`;
}

function back() {
  const [w, h] = CELL;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  <pattern id="lattice" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="20" height="20" fill="#1d3f7a"/>
    <path d="M0 10 H20 M10 0 V20" stroke="#3d66b0" stroke-width="2"/>
  </pattern>
</defs>
<rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="16" fill="#fdfcf8" stroke="#c9c4b8" stroke-width="2"/>
<rect x="16" y="16" width="${w - 32}" height="${h - 32}" rx="10" fill="url(#lattice)"/>
<rect x="16" y="16" width="${w - 32}" height="${h - 32}" rx="10" fill="none" stroke="#e8d9a8" stroke-width="3"/>
<circle cx="${w / 2}" cy="${h / 2}" r="38" fill="#1d3f7a" stroke="#e8d9a8" stroke-width="3"/>
<g transform="translate(${w / 2 - 22} ${h / 2 - 22}) scale(0.44)" fill="#e8d9a8">${SUIT_SHAPES.S}</g>
</svg>
`;
}

// Chips: a face in the chip's color with white edge spots and its value.
const CHIPS = [
  { value: 1, color: "#f2efe6", ink: "#1f1f1f", spots: "#2e6fd8" },
  { value: 5, color: "#c0392b", ink: "#ffffff", spots: "#ffffff" },
  { value: 10, color: "#2e6fd8", ink: "#ffffff", spots: "#ffffff" },
  { value: 25, color: "#2e8b57", ink: "#ffffff", spots: "#ffffff" },
  { value: 100, color: "#222222", ink: "#ffffff", spots: "#e3b341" },
];

function chip({ value, color, ink, spots }) {
  const size = 256;
  const c = size / 2;
  const marks = Array.from({ length: 8 }, (_, i) =>
    `<rect x="${c - 13}" y="4" width="26" height="30" rx="4" fill="${spots}" transform="rotate(${i * 45} ${c} ${c})"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<circle cx="${c}" cy="${c}" r="${c}" fill="${color}"/>
${marks}
<circle cx="${c}" cy="${c}" r="${c - 46}" fill="none" stroke="${ink}" stroke-width="4" stroke-dasharray="10 8" stroke-opacity="0.8"/>
<circle cx="${c}" cy="${c}" r="${c - 58}" fill="${color}" stroke="${ink}" stroke-width="3" stroke-opacity="0.5"/>
<text x="${c}" y="${c + 22}" font-family="${SERIF}" font-weight="bold" font-size="${value >= 100 ? 54 : 64}" text-anchor="middle" fill="${ink}">${value}</text>
</svg>
`;
}

function thumbnail() {
  const card = (rank, suit, x, y, turn) =>
    `<g transform="translate(${x} ${y}) rotate(${turn}) scale(0.5) translate(-125 -175)">${blank(0, 0)}${corner(rank, suit)}${face(rank, suit)}</g>`;
  const stack = (x, y, { color, spots }) => [0, 1, 2, 3].map((i) =>
    `<ellipse cx="${x}" cy="${y - i * 7}" rx="30" ry="12" fill="${color}" stroke="${spots}" stroke-width="2" stroke-dasharray="6 6"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
<rect width="400" height="300" fill="#2e6b3f"/>
${card("K", SUITS[1], 150, 150, -14)}${card("A", SUITS[0], 200, 140, 0)}${card("Q", SUITS[2], 250, 150, 14)}
${stack(70, 250, CHIPS[1])}${stack(330, 250, CHIPS[4])}
</svg>
`;
}

// ---- the manifest -------------------------------------------------------------

const TABLE = 120;
const CHIP_SIZE = 3.9;

function manifest() {
  const cards = [];
  SUITS.forEach((suit, row) => RANKS.forEach((rank, column) => {
    cards.push({ id: `${rank}${suit.key}`, type: "card", categories: [suit.name], face: { sheet: "cards", index: row * COLUMNS + column } });
  }));
  cards.push({ id: "joker-red", type: "card", categories: ["jokers"], face: { sheet: "cards", index: 4 * COLUMNS } });
  cards.push({ id: "joker-black", type: "card", categories: ["jokers"], face: { sheet: "cards", index: 4 * COLUMNS + 1 } });

  const chipTypes = Object.fromEntries(CHIPS.map(({ value, color }) => [`chip-${value}`, {
    kind: "chip", size: [CHIP_SIZE], thickness: 0.33, face: `assets/chip-${value}.svg`, edge: color,
  }]));
  const banks = CHIPS.map(({ value, color }, i) => ({
    id: `bank-${value}`, kind: "bag", position: [TABLE / 2 - 24 + i * 12, TABLE / 2 - 16], size: [9, 9],
    infinite: `chip-${value}`, text: `${value}s`, color, fixed: true,
  }));

  return {
    formatVersion: 1,
    id: "cards",
    name: "Cards",
    version: "1.0.0",
    table: { size: [TABLE, TABLE], color: "#2e6b3f" },
    layers: [{ id: "board", thickness: 0.1 }, { id: "pieces", thickness: 0.03 }],
    hands: true,
    maxStackShown: 20,
    sheets: { cards: { image: "assets/cards.svg", columns: COLUMNS, rows: ROWS } },
    pieceTypes: {
      card: { kind: "card", size: CARD_SIZE, back: "assets/back.svg" },
      ...chipTypes,
      // Score keepers: each one a labeled number players count up and down.
      score: { kind: "counter", size: [7, 3.5], label: "Score", color: "#f4efe0" },
      // A running score by round, and notes to jot on.
      sheet: { kind: "scoresheet", size: [12, 9], label: "Scores", color: "#f4efe0" },
      note: { kind: "note", size: [9, 7], color: "#fbf0b4" },
    },
    pieces: cards,
    containers: [
      { id: "deck", kind: "deck", position: [TABLE / 2 - 5, TABLE / 2 + 4], size: CARD_SIZE, members: cards.map((card) => card.id) },
      { id: "discard", kind: "deck", position: [TABLE / 2 + 5, TABLE / 2 + 4], size: CARD_SIZE, faceUp: true, members: [] },
      ...banks,
      {
        id: "scores", kind: "bag", position: [TABLE / 2 + 34, TABLE / 2 - 16], size: [9, 9],
        infinite: "score", text: "Scores", color: "#8a6a3a", fixed: true,
      },
      {
        id: "sheets", kind: "bag", position: [TABLE / 2 + 34, TABLE / 2 - 28], size: [9, 9],
        infinite: "sheet", text: "Score sheets", color: "#5e6b8a", fixed: true,
      },
      {
        id: "notes", kind: "bag", position: [TABLE / 2 + 46, TABLE / 2 - 16], size: [9, 9],
        infinite: "note", text: "Notes", color: "#a08a2a", fixed: true,
      },
    ],
    labels: [
      { text: "Deck", position: [TABLE / 2 - 5, TABLE / 2 - 1.6], fontSize: 0.9, color: "#e9f0e2" },
      { text: "Discard", position: [TABLE / 2 + 5, TABLE / 2 - 1.6], fontSize: 0.9, color: "#e9f0e2" },
      { text: "Bank", position: [TABLE / 2, TABLE / 2 - 22.5], fontSize: 1.1, color: "#e9f0e2" },
    ],
  };
}

mkdirSync(ASSETS, { recursive: true });
writeFileSync(join(ASSETS, "cards.svg"), sheet());
writeFileSync(join(ASSETS, "back.svg"), back());
for (const spec of CHIPS) writeFileSync(join(ASSETS, `chip-${spec.value}.svg`), chip(spec));
writeFileSync(join(OUT, "thumbnail.svg"), thumbnail());
writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest(), null, 2)}\n`);
console.log(`Wrote ${OUT}`);
