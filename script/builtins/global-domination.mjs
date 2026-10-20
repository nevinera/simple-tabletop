// Builds the Global Domination built-in (public/builtins/global-domination):
// a world map of 42 territories in six continents, armies in six colors,
// attack and defense dice, and a deck of territory cards. The map is drawn
// from Natural Earth's public-domain outlines (see world/territories.mjs),
// and the rest of the art is drawn here, so it's all ours to publish.
//
//   node script/builtins/global-domination.mjs

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "../../public/builtins/global-domination");
const ASSETS = join(OUT, "assets");
const WORLD = JSON.parse(readFileSync(join(HERE, "world/territories.json"), "utf8"));

const FRAME = 3; // cm of frame around the map
const BOARD = [WORLD.width + FRAME * 2, WORLD.height + FRAME * 2];
const TABLE = [200, 140];
const PX = 27; // board image pixels per cm, which keeps it under 4096 wide
const CHIP = 2; // cm across an army
const CARD_SIZE = [6.3, 8.8];
const CELL = [250, 350]; // card sheet pixels per card
const SANS = "'Helvetica Neue', Arial, sans-serif";
const INK = "#1d2430";
const SEA = "#8fb8d0";

const CONTINENTS = {
  "north-america": { name: "North America", bonus: 5, color: "#e3b94f" },
  "south-america": { name: "South America", bonus: 2, color: "#d9774f" },
  europe: { name: "Europe", bonus: 5, color: "#6f93c9" },
  africa: { name: "Africa", bonus: 3, color: "#b88a5c" },
  asia: { name: "Asia", bonus: 7, color: "#7fae67" },
  australia: { name: "Australia", bonus: 2, color: "#b283c2" },
};

// The 42 territories, each with its name as printed (with | between lines),
// and the ones it borders, as on the classic map. Neighbors are listed both
// ways, which the build checks.
const TERRITORIES = {
  alaska: ["north-america", "Alaska", ["northwest-territory", "alberta", "kamchatka"]],
  "northwest-territory": ["north-america", "Northwest|Territory", ["alaska", "alberta", "ontario", "greenland"]],
  greenland: ["north-america", "Greenland", ["northwest-territory", "ontario", "quebec", "iceland"]],
  alberta: ["north-america", "Alberta", ["alaska", "northwest-territory", "ontario", "western-united-states"]],
  ontario: ["north-america", "Ontario", ["northwest-territory", "alberta", "western-united-states", "eastern-united-states", "quebec", "greenland"]],
  quebec: ["north-america", "Quebec", ["ontario", "eastern-united-states", "greenland"]],
  "western-united-states": ["north-america", "Western|United States", ["alberta", "ontario", "eastern-united-states", "central-america"]],
  "eastern-united-states": ["north-america", "Eastern|United States", ["ontario", "quebec", "western-united-states", "central-america"]],
  "central-america": ["north-america", "Central|America", ["western-united-states", "eastern-united-states", "venezuela"]],
  venezuela: ["south-america", "Venezuela", ["central-america", "peru", "brazil"]],
  peru: ["south-america", "Peru", ["venezuela", "brazil", "argentina"]],
  brazil: ["south-america", "Brazil", ["venezuela", "peru", "argentina", "north-africa"]],
  argentina: ["south-america", "Argentina", ["peru", "brazil"]],
  iceland: ["europe", "Iceland", ["greenland", "great-britain", "scandinavia"]],
  "great-britain": ["europe", "Great|Britain", ["iceland", "scandinavia", "northern-europe", "western-europe"]],
  scandinavia: ["europe", "Scandinavia", ["iceland", "great-britain", "northern-europe", "ukraine"]],
  "northern-europe": ["europe", "Northern|Europe", ["great-britain", "scandinavia", "ukraine", "southern-europe", "western-europe"]],
  "western-europe": ["europe", "Western|Europe", ["great-britain", "northern-europe", "southern-europe", "north-africa"]],
  "southern-europe": ["europe", "Southern|Europe", ["western-europe", "northern-europe", "ukraine", "middle-east", "egypt", "north-africa"]],
  ukraine: ["europe", "Ukraine", ["scandinavia", "northern-europe", "southern-europe", "ural", "afghanistan", "middle-east"]],
  "north-africa": ["africa", "North Africa", ["brazil", "western-europe", "southern-europe", "egypt", "east-africa", "congo"]],
  egypt: ["africa", "Egypt", ["north-africa", "southern-europe", "middle-east", "east-africa"]],
  "east-africa": ["africa", "East Africa", ["egypt", "north-africa", "congo", "south-africa", "madagascar", "middle-east"]],
  congo: ["africa", "Congo", ["north-africa", "east-africa", "south-africa"]],
  "south-africa": ["africa", "South|Africa", ["congo", "east-africa", "madagascar"]],
  madagascar: ["africa", "Madagascar", ["south-africa", "east-africa"]],
  ural: ["asia", "Ural", ["ukraine", "siberia", "china", "afghanistan"]],
  siberia: ["asia", "Siberia", ["ural", "yakutsk", "irkutsk", "mongolia", "china"]],
  yakutsk: ["asia", "Yakutsk", ["siberia", "kamchatka", "irkutsk"]],
  kamchatka: ["asia", "Kamchatka", ["yakutsk", "irkutsk", "mongolia", "japan", "alaska"]],
  irkutsk: ["asia", "Irkutsk", ["siberia", "yakutsk", "kamchatka", "mongolia"]],
  mongolia: ["asia", "Mongolia", ["irkutsk", "siberia", "kamchatka", "japan", "china"]],
  japan: ["asia", "Japan", ["kamchatka", "mongolia"]],
  afghanistan: ["asia", "Afghanistan", ["ukraine", "ural", "china", "india", "middle-east"]],
  china: ["asia", "China", ["mongolia", "siberia", "ural", "afghanistan", "india", "siam"]],
  "middle-east": ["asia", "Middle East", ["ukraine", "southern-europe", "egypt", "east-africa", "afghanistan", "india"]],
  india: ["asia", "India", ["middle-east", "afghanistan", "china", "siam"]],
  siam: ["asia", "Siam", ["india", "china", "indonesia"]],
  indonesia: ["australia", "Indonesia", ["siam", "new-guinea", "western-australia"]],
  "new-guinea": ["australia", "New Guinea", ["indonesia", "eastern-australia", "western-australia"]],
  "western-australia": ["australia", "Western|Australia", ["indonesia", "new-guinea", "eastern-australia"]],
  "eastern-australia": ["australia", "Eastern|Australia", ["western-australia", "new-guinea"]],
};

// Where a label goes, as [dx, dy] cm from the army spot. Most sit just
// below it; these are moved off small or crowded territories.
const LABEL_AT = {
  "great-britain": [-2.9, 1.3],
  "northern-europe": [0, -1.9],
};
const LABEL_BELOW = 1.9;

const PLAYERS = [
  { id: "red", name: "Red", color: "#c0392b", side: "south-left" },
  { id: "blue", name: "Blue", color: "#2e64b0", side: "south-right" },
  { id: "green", name: "Green", color: "#2f8a3e", side: "east" },
  { id: "yellow", name: "Yellow", color: "#e0b52a", side: "north-left" },
  { id: "black", name: "Black", color: "#2b2b2b", side: "north-right" },
  { id: "purple", name: "Purple", color: "#7d3c98", side: "west" },
];
const SYMBOLS = ["infantry", "cavalry", "artillery"];

for (const [id, [, , neighbors]] of Object.entries(TERRITORIES)) {
  if (!WORLD.territories[id]) throw new Error(`No outline for ${id}`);
  for (const other of neighbors) {
    if (!TERRITORIES[other]?.[2].includes(id)) throw new Error(`${id} borders ${other}, but not the other way round`);
  }
}

// Every pair of neighbors, once each.
const LINKS = Object.entries(TERRITORIES).flatMap(([id, [, , neighbors]]) =>
  neighbors.filter((other) => id < other).map((other) => [id, other]));
const touches = new Set(WORLD.touching.map(([a, b]) => [a, b].sort().join(" ")));
const unexpected = [...touches].filter((pair) => !LINKS.some((link) => [...link].sort().join(" ") === pair));
if (unexpected.length) console.warn(`Touching on the map but not neighbors: ${unexpected.join(", ")}`);

function points(path) {
  return [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

// The closest pair of points on two territories' coasts.
function gap(a, b) {
  let best = null;
  for (const p of points(WORLD.territories[a].path)) {
    for (const q of points(WORLD.territories[b].path)) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!best || d < best.d) best = { d, p, q };
    }
  }
  return best;
}

function lighten(hex, amount) {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mixed = rgb.map((c) => Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount)));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function textLines(text, x, y, size, attrs = "") {
  const lines = text.split("|");
  return lines.map((line, i) => `<text x="${x}" y="${y + (i - (lines.length - 1) / 2) * size * 1.05}" ${attrs}>${line}</text>`).join("");
}

function boardSvg() {
  const [w, h] = BOARD.map((v) => v * PX);
  const at = (v) => (v + FRAME) * PX;
  const shapes = [];
  const spots = [];
  const labels = [];
  Object.entries(TERRITORIES).forEach(([id, [continent, name]], i) => {
    const { path, spot } = WORLD.territories[id];
    const shade = lighten(CONTINENTS[continent].color, i % 2 ? 0.12 : -0.04);
    shapes.push(`<path d="${path}" fill="${shade}"/>`);
    spots.push(`<circle cx="${spot[0]}" cy="${spot[1]}" r="${CHIP / 2 + 0.12}"/>`);
    const [dx, dy] = LABEL_AT[id] ?? [0, LABEL_BELOW];
    labels.push(textLines(name, spot[0] + dx, spot[1] + dy, 0.85));
  });
  const crossings = LINKS.filter(([a, b]) => !touches.has([a, b].sort().join(" ")) && [a, b].sort().join(" ") !== "alaska kamchatka")
    .map(([a, b]) => {
      const { d, p, q } = gap(a, b);
      // Run a little past each coast, so the line clearly reaches land, and
      // stays long enough to see across narrow straits.
      const [ux, uy] = d > 0 ? [(q[0] - p[0]) / d, (q[1] - p[1]) / d] : [0, 1];
      const reach = Math.max(0.6, (2.4 - d) / 2);
      return `<line x1="${p[0] - ux * reach}" y1="${p[1] - uy * reach}" x2="${q[0] + ux * reach}" y2="${q[1] + uy * reach}"/>`;
    });
  // Alaska and Kamchatka meet across the map's edges.
  const alaska = points(WORLD.territories.alaska.path).reduce((a, b) => (b[0] < a[0] ? b : a));
  const kamchatka = points(WORLD.territories.kamchatka.path).reduce((a, b) => (b[0] > a[0] ? b : a));
  crossings.push(`<line x1="${alaska[0] + 0.6}" y1="${alaska[1]}" x2="${-FRAME * 0.4}" y2="${alaska[1]}"/>`);
  crossings.push(`<line x1="${kamchatka[0] - 0.6}" y1="${kamchatka[1]}" x2="${WORLD.width + FRAME * 0.4}" y2="${kamchatka[1]}"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" rx="${PX * 0.6}" fill="#3b2f25"/>
<rect x="${at(-FRAME * 0.6)}" y="${at(-FRAME * 0.6)}" width="${(WORLD.width + FRAME * 1.2) * PX}" height="${(WORLD.height + FRAME * 1.2) * PX}" fill="${SEA}"/>
<g transform="translate(${at(0)} ${at(0)}) scale(${PX})">
  <g stroke="${lighten(INK, 0.15)}" stroke-width="0.07" stroke-linejoin="round">${shapes.join("")}</g>
  <g stroke="${lighten(SEA, -0.45)}" stroke-width="0.09" stroke-dasharray="0.35 0.25" stroke-linecap="round">${crossings.join("")}</g>
  <g fill="#ffffff" fill-opacity="0.35" stroke="${INK}" stroke-opacity="0.55" stroke-width="0.06">${spots.join("")}</g>
  <g font-family="${SANS}" font-weight="700" font-size="0.85" fill="${INK}" text-anchor="middle" dominant-baseline="central"
    stroke="#ffffff" stroke-opacity="0.7" stroke-width="0.18" paint-order="stroke" stroke-linejoin="round">${labels.join("")}</g>
  ${legend()}
</g>
</svg>
`;
}

// Continent bonuses and card trade-ins, in the South Pacific.
function legend() {
  const [x, y] = [2, WORLD.height - 19];
  const rows = Object.values(CONTINENTS).map(({ name, bonus, color }, i) => `
    <rect x="${x + 0.8}" y="${y + 3.2 + i * 1.7}" width="1.2" height="1.2" rx="0.2" fill="${color}" stroke="${INK}" stroke-width="0.05"/>
    <text x="${x + 2.6}" y="${y + 3.8 + i * 1.7}">${name}</text>
    <text x="${x + 17}" y="${y + 3.8 + i * 1.7}" text-anchor="end" font-weight="700">+${bonus}</text>`);
  return `<g font-family="${SANS}" font-size="0.9" fill="${INK}" dominant-baseline="central">
    <rect x="${x}" y="${y}" width="18" height="17.5" rx="0.6" fill="#ffffff" fill-opacity="0.55"/>
    <text x="${x + 9}" y="${y + 1.5}" text-anchor="middle" font-weight="800" font-size="1.2">GLOBAL DOMINATION</text>
    ${rows.join("")}
    <text x="${x + 9}" y="${y + 14.2}" text-anchor="middle" font-weight="700">Card sets</text>
    <text x="${x + 9}" y="${y + 15.7}" text-anchor="middle" font-size="0.75">4, 6, 8, 10, 12, 15, then 5 more each</text>
  </g>`;
}

function armySvg(player) {
  const ink = player.id === "yellow" ? "#2b2b2b" : "#ffffff";
  const star = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 17 : 38;
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    return `${(64 + r * Math.cos(angle)).toFixed(1)} ${(66 + r * Math.sin(angle)).toFixed(1)}`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
<circle cx="64" cy="64" r="63" fill="${player.color}"/>
<circle cx="64" cy="64" r="53" fill="none" stroke="${ink}" stroke-width="4" stroke-opacity="0.8"/>
<path d="M${star.join("L")}Z" fill="${ink}" fill-opacity="0.9"/>
</svg>
`;
}

// Card symbols in a 100 x 100 box.
const SYMBOL_ART = {
  infantry: `<circle cx="50" cy="20" r="12"/><path d="M32 36 L68 36 L72 70 L62 70 L60 96 L52 96 L50 72 L48 96 L40 96 L38 70 L28 70 Z"/>`,
  cavalry: `<path d="M30 92 C30 78 34 66 42 57 C36 55 31 57 26 59 C19 61 15 56 17 50 C21 38 29 28 37 23 L41 13 L45 22
    C56 24 66 32 70 46 C74 60 71 74 71 92 Z"/>`,
  artillery: `<circle cx="34" cy="74" r="18"/><circle cx="34" cy="74" r="6" fill="#fdfaf2"/>
    <path d="M30 60 L88 30 L94 42 L40 76 Z"/><rect x="10" y="88" width="80" height="6" rx="3"/>`,
};

function cardSheet() {
  const ids = Object.keys(TERRITORIES);
  const cells = ids.map((id, i) => {
    const [continent, name] = TERRITORIES[id];
    const { path } = WORLD.territories[id];
    const pts = points(path);
    const [minX, maxX] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
    const [minY, maxY] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
    const scale = Math.min(190 / (maxX - minX), 150 / (maxY - minY));
    const [ox, oy] = [125 - ((minX + maxX) / 2) * scale, 140 - ((minY + maxY) / 2) * scale];
    const symbol = SYMBOLS[i % 3];
    const color = CONTINENTS[continent].color;
    return cell(i, `
      <g font-family="${SANS}" font-weight="800" font-size="23" text-anchor="middle" dominant-baseline="central" fill="${INK}">
        ${textLines(name.replace(/\|/g, name.length > 13 ? "|" : " "), 125, 40, 23)}</g>
      <g transform="translate(${ox} ${oy}) scale(${scale})"><path d="${path}" fill="${color}" stroke="${INK}" stroke-width="${1.5 / scale}"/></g>
      <rect x="40" y="226" width="170" height="2" fill="${INK}" fill-opacity="0.3"/>
      <g transform="translate(85 238) scale(0.8)" fill="${INK}">${SYMBOL_ART[symbol]}</g>
      <text x="125" y="330" font-family="${SANS}" font-size="16" text-anchor="middle" fill="${INK}" fill-opacity="0.7">${symbol.toUpperCase()}</text>`);
  });
  const wild = (i) => cell(i, `
      <text x="125" y="60" font-family="${SANS}" font-weight="800" font-size="34" text-anchor="middle" fill="${INK}">WILD</text>
      ${SYMBOLS.map((symbol, j) => `<g transform="translate(90 ${88 + j * 74}) scale(0.7)" fill="${INK}">${SYMBOL_ART[symbol]}</g>`).join("")}
      <text x="125" y="322" font-family="${SANS}" font-size="18" text-anchor="middle" fill="${INK}" fill-opacity="0.7">ANY SYMBOL</text>`);
  cells.push(wild(ids.length), wild(ids.length + 1));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL[0] * 11}" height="${CELL[1] * 4}" viewBox="0 0 ${CELL[0] * 11} ${CELL[1] * 4}">
${cells.join("\n")}
</svg>
`;
}

function cell(index, body) {
  const [x, y] = [(index % 11) * CELL[0], Math.floor(index / 11) * CELL[1]];
  return `<g transform="translate(${x} ${y})">
    <rect x="3" y="3" width="${CELL[0] - 6}" height="${CELL[1] - 6}" rx="16" fill="#fdfaf2" stroke="#b9b0a0" stroke-width="2"/>${body}
  </g>`;
}

function cardBack() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL[0]}" height="${CELL[1]}" viewBox="0 0 ${CELL[0]} ${CELL[1]}">
<rect x="3" y="3" width="${CELL[0] - 6}" height="${CELL[1] - 6}" rx="16" fill="#2b4a6b" stroke="#b9b0a0" stroke-width="2"/>
<rect x="18" y="18" width="${CELL[0] - 36}" height="${CELL[1] - 36}" rx="10" fill="none" stroke="#d8c48a" stroke-width="3"/>
<circle cx="125" cy="175" r="70" fill="none" stroke="#d8c48a" stroke-width="5"/>
<ellipse cx="125" cy="175" rx="30" ry="70" fill="none" stroke="#d8c48a" stroke-width="3"/>
<line x1="55" y1="175" x2="195" y2="175" stroke="#d8c48a" stroke-width="3"/>
<path d="M66 140 L184 140 M66 210 L184 210" stroke="#d8c48a" stroke-width="3"/>
</svg>
`;
}

function thumbnail() {
  const scale = 380 / WORLD.width;
  const shapes = Object.entries(TERRITORIES).map(([id, [continent]], i) =>
    `<path d="${WORLD.territories[id].path}" fill="${lighten(CONTINENTS[continent].color, i % 2 ? 0.12 : -0.04)}"/>`);
  const dots = [["ontario", "red"], ["brazil", "blue"], ["china", "green"], ["ukraine", "yellow"], ["egypt", "black"], ["western-australia", "purple"]];
  const chips = dots.map(([id, color]) => {
    const { spot } = WORLD.territories[id];
    return `<circle cx="${spot[0]}" cy="${spot[1]}" r="2.6" fill="${PLAYERS.find((p) => p.id === color).color}" stroke="#ffffff" stroke-width="0.5"/>`;
  });
  const top = (300 - WORLD.height * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
<rect width="400" height="300" fill="#2e6b3f"/>
<rect x="6" y="${top - 6}" width="388" height="${WORLD.height * scale + 12}" rx="6" fill="${SEA}"/>
<g transform="translate(10 ${top}) scale(${scale})">
  <g stroke="${INK}" stroke-width="0.25" stroke-linejoin="round">${shapes.join("")}</g>
  ${chips.join("")}
</g>
</svg>
`;
}

// Map cm (y down from the map's top) to table cm (y up from the near edge).
const board = { x: TABLE[0] / 2 - BOARD[0] / 2, y: TABLE[1] / 2 + BOARD[1] / 2 };
const onTable = ([x, y]) => [Number((board.x + FRAME + x).toFixed(2)), Number((board.y - FRAME - y).toFixed(2))];

// Each player's armies sit on their edge of the table.
function supplies(player) {
  const [w, d] = TABLE;
  const place = {
    "south-left": { position: [45, 14], rotation: 0 },
    "south-right": { position: [w - 45, 14], rotation: 0 },
    "north-left": { position: [w - 45, d - 14], rotation: 180 },
    "north-right": { position: [45, d - 14], rotation: 180 },
    east: { position: [w - 12, d / 2], rotation: 270 },
    west: { position: [12, d / 2], rotation: 90 },
  }[player.side];
  return {
    id: `${player.id}-armies`, kind: "bag", size: [8, 8], ...place,
    infinite: `${player.id}-army`, text: player.name, color: player.color, fixed: true,
  };
}

function manifest() {
  const ids = Object.keys(TERRITORIES);
  const cards = ids.map((id, index) => ({ id: `card-${id}`, type: "card", categories: [SYMBOLS[index % 3]], face: { sheet: "cards", index } }));
  cards.push({ id: "card-wild-1", type: "card", categories: ["wild"], face: { sheet: "cards", index: ids.length } });
  cards.push({ id: "card-wild-2", type: "card", categories: ["wild"], face: { sheet: "cards", index: ids.length + 1 } });
  const dice = [
    ...[1, 2, 3].map((n) => ({ id: `attack-${n}`, kind: "die", die: "d6pips", size: [1.8], color: "#c0392b" })),
    ...[1, 2].map((n) => ({ id: `defense-${n}`, kind: "die", die: "d6pips", size: [1.8], color: "#f2efe8" })),
  ];
  // One army a piece. They're tokens, so armies only pile up with their own
  // color, and a pile shows how many it has.
  const armyTypes = Object.fromEntries(PLAYERS.map((player) => [`${player.id}-army`, {
    kind: "token", shape: "circle", size: [CHIP], thickness: 0.35, face: `assets/${player.id}.svg`, edge: player.color,
  }]));
  return {
    formatVersion: 1,
    id: "global-domination",
    name: "Global Domination",
    version: "1.0.0",
    table: { size: TABLE, color: "#2e6b3f" },
    layers: [{ id: "board", thickness: 0.1 }, { id: "pieces", thickness: 0.03 }],
    hands: true,
    // Every pile of armies shows its count, however short.
    maxStackShown: 1,
    seats: PLAYERS.map(({ id, name, side, color }) => ({ id, name, side, color })),
    // Armies dropped near a territory's ring pile up on it.
    snaps: [{
      radius: 3, accepts: [{ kind: "token" }],
      points: ids.map((id) => onTable(WORLD.territories[id].spot)),
    }],
    sheets: { cards: { image: "assets/cards.svg", columns: 11, rows: 4 } },
    pieceTypes: {
      card: { kind: "card", size: CARD_SIZE, back: "assets/back.svg" },
      ...armyTypes,
    },
    pieces: [
      { id: "board", kind: "board", size: BOARD.map((v) => Number(v.toFixed(2))), face: "assets/board.svg", position: [TABLE[0] / 2, TABLE[1] / 2], fixed: true },
      ...cards,
      ...dice,
    ],
    containers: [
      { id: "deck", kind: "deck", position: [TABLE[0] / 2 - 5, TABLE[1] - 14], rotation: 180, size: CARD_SIZE, members: cards.map((c) => c.id) },
      { id: "discard", kind: "deck", position: [TABLE[0] / 2 + 5, TABLE[1] - 14], rotation: 180, size: CARD_SIZE, faceUp: true, members: [] },
      { id: "attack", kind: "tray", position: [TABLE[0] / 2 - 8, 14], size: [12, 12], fixed: true, members: ["attack-1", "attack-2", "attack-3"] },
      { id: "defense", kind: "tray", position: [TABLE[0] / 2 + 8, 14], size: [12, 12], fixed: true, members: ["defense-1", "defense-2"] },
      ...PLAYERS.map(supplies),
    ],
    labels: [
      { text: "Attack", position: [TABLE[0] / 2 - 8, 5.5], fontSize: 1.1, color: "#e9f0e2" },
      { text: "Defense", position: [TABLE[0] / 2 + 8, 5.5], fontSize: 1.1, color: "#e9f0e2" },
    ],
  };
}

mkdirSync(ASSETS, { recursive: true });
writeFileSync(join(ASSETS, "board.svg"), boardSvg());
writeFileSync(join(ASSETS, "cards.svg"), cardSheet());
writeFileSync(join(ASSETS, "back.svg"), cardBack());
for (const player of PLAYERS) {
  writeFileSync(join(ASSETS, `${player.id}.svg`), armySvg(player));
}
writeFileSync(join(OUT, "thumbnail.svg"), thumbnail());
writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest(), null, 2)}\n`);
console.log(`Wrote ${OUT}`);
