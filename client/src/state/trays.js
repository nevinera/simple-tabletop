// Where dice sit in a tray, and pieces in a bowl. Spots are { [id]: [x, y] }
// in the container's own frame: centered on it, x to its right and y to its
// far edge. Nothing overlaps, and everything stays inside: a tray's
// rectangle, or a bowl's oval. Dice fill at most an eighth of a tray, so
// they have room to tumble; a bowl fills up to BOWL_FILL of its oval.

const MAX_FILL = 1 / 8;
const BOWL_FILL = 0.6;
const SCATTER_TRIES = 200; // random spots tried per die before giving up
const SEARCH_STEP = 0.25; // cm between spots when looking for the nearest free one
const GAP = 0.1; // cm kept between dice

// How far a piece reaches from its middle: half across a die, disc, or
// pawn, or to the corners of anything square-cornered.
const ROUND = (def) => def.shape === "die" || def.shape === "circle" || def.kind === "pawn";
const radius = (def) => (ROUND(def) || def.size.length < 2 ? def.size[0] / 2 : Math.hypot(def.size[0], def.size[1]) / 2);
const isBowl = (def) => def.kind === "bowl";

// Whether a tray or bowl holding `dieDefs` has room for one more.
export function hasRoom(trayDef, dieDefs, newDie) {
  const area = (def) => Math.PI * radius(def) ** 2;
  const used = dieDefs.reduce((sum, def) => sum + area(def), 0) + area(newDie);
  const [width, depth] = trayDef.size;
  if (isBowl(trayDef)) return used <= (Math.PI * width * depth * BOWL_FILL) / 4;
  return used <= width * depth * MAX_FILL;
}

// The tray-frame spot for a table point, and back.
export function toTray(trayState, [x, y]) {
  const [dx, dy] = [x - trayState.x, y - trayState.y];
  const radians = (trayState.rotation * Math.PI) / 180;
  const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
  return [dx * cos - dy * sin, dx * sin + dy * cos];
}

export function fromTray(trayState, [lx, ly]) {
  const radians = (trayState.rotation * Math.PI) / 180;
  const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
  return [trayState.x + lx * cos + ly * sin, trayState.y - lx * sin + ly * cos];
}

// Where a die in a tray sits on the table, as [x, y].
export function traySpot(state, dieId) {
  const tray = state.containers[state.pieces[dieId].containerId];
  return fromTray(tray, tray.spots[dieId]);
}

// Whether a die fits at `spot` among the dice already placed.
export function fits(trayDef, placed, dieDef, [x, y]) {
  const r = radius(dieDef);
  const [halfWidth, halfDepth] = [trayDef.size[0] / 2 - r, trayDef.size[1] / 2 - r];
  if (halfWidth < 0 || halfDepth < 0) return false;
  if (isBowl(trayDef) ? (x / halfWidth) ** 2 + (y / halfDepth) ** 2 > 1 : Math.abs(x) > halfWidth || Math.abs(y) > halfDepth) return false;
  return placed.every(({ def, spot: [px, py] }) => Math.hypot(px - x, py - y) >= r + radius(def) + GAP);
}

// The free spot closest to `spot`, searching outward, or null.
export function nearestFree(trayDef, placed, dieDef, spot) {
  if (fits(trayDef, placed, dieDef, spot)) return spot;
  const reach = Math.hypot(trayDef.size[0], trayDef.size[1]);
  for (let ring = SEARCH_STEP; ring <= reach; ring += SEARCH_STEP) {
    const steps = Math.max(8, Math.ceil((2 * Math.PI * ring) / SEARCH_STEP));
    for (let i = 0; i < steps; i++) {
      const angle = (2 * Math.PI * i) / steps;
      const candidate = [spot[0] + ring * Math.cos(angle), spot[1] + ring * Math.sin(angle)];
      if (fits(trayDef, placed, dieDef, candidate)) return candidate;
    }
  }
  return null;
}

// Random non-overlapping spots for every die, or null if they won't fit.
export function scatter(trayDef, dieDefs, random = Math.random) {
  const placed = [];
  for (const def of dieDefs) {
    const r = radius(def);
    const [halfWidth, halfDepth] = [trayDef.size[0] / 2 - r, trayDef.size[1] / 2 - r];
    let spot = null;
    for (let i = 0; i < SCATTER_TRIES && !spot; i++) {
      const candidate = [(random() * 2 - 1) * halfWidth, (random() * 2 - 1) * halfDepth];
      if (fits(trayDef, placed, def, candidate)) spot = candidate;
    }
    spot ||= nearestFree(trayDef, placed, def, [0, 0]);
    if (!spot) return null;
    placed.push({ def, spot });
  }
  return Object.fromEntries(placed.map(({ def, spot }) => [def.id, spot]));
}

// A repeatable random sequence from a string, for laying out a tray's
// starting dice the same way in every browser.
export function seededRandom(seed) {
  let state = [...seed].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0, 7);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
