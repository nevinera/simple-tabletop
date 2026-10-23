// Loads a game manifest (see docs/manifest-format.md) and turns it into the
// shape the table renders from: piece types merged in, defaults filled, and
// every image resolved to an absolute URL.

import { BUILT_IN_DICE, D4_SCALE, DIE_SIDES } from "../state/dice";
import { HALF_SIDES, SEAT_ORDER, SIDES } from "../state/seats";
import {
  DEFAULT_SPLAY, MAX_COUNTER_LABEL, MAX_COUNTER_VALUE, SPLAY_DIRECTIONS, STACK_SHOWN, canStack, stackKey,
} from "../state/objects";
import { MEEPLE_DEPTH, PAWN_HEIGHTS, PAWN_SHAPES } from "../state/pawnShapes";
import { DEFAULT_SCORE_PLAYERS, noteError, playersError } from "../state/notes";
import { normalizeSetups } from "./setups";

export const DEFAULT_TABLE_COLOR = "#2e6b3f";
const LAYER_IDS = ["board", "pieces"];
// What each kind of piece can look like. The first shape is its default.
const KIND_SHAPES = {
  card: ["rect"],
  board: ["rect", "circle"],
  tile: ["rect"],
  chip: ["circle"],
  token: ["circle", "rect"],
  die: ["die"],
  standee: ["rect"],
  pawn: PAWN_SHAPES,
  counter: ["rect"],
  note: ["rect"],
  scoresheet: ["rect"],
};
const HOLDER_MARGIN = 0.2; // cm the clear holder sticks out past a standee on each side
const HOLDER_DEPTH = 0.35; // of a standee's width, front to back
const MIN_HOLDER_DEPTH = 1.5; // cm
const DEFAULT_DIE_COLOR = "#f4efe2";
const CONTAINER_KINDS = ["deck", "bag", "bowl", "tray", "stack"];
const CAMERA_SLOTS = /^[0-9]$/;
const MAX_SEATS = 8;
const HAND_PREFIX = "hand-"; // hand containers' ids; see state/seats.js
const RESERVED_ID_CHARACTER = "#"; // for pieces drawn from infinite bags; see state/objects.js
const DEFAULT_BAG_COLOR = "#7a5230";
const MAX_BAG_TEXT = 16;
const SOLID_THICKNESS = 0.2; // cm; tiles, chips, tokens, and standees, unless they say otherwise
const DEFAULT_PAWN_COLOR = "#f4f1ea";
const DEFAULT_COUNTER_COLOR = "#f4f1ea";
const DEFAULT_NOTE_COLOR = "#fbf0b4";
const DEFAULT_SCORESHEET_LABEL = "Scores";
const COUNTER_THICKNESS = 0.4; // cm
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SEAT_COLORS = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085", "#c2185b", "#7f8c8d"];

export class ManifestError extends Error {}

export async function fetchManifest(url) {
  const absolute = new URL(url, window.location.href).href;
  let response;
  try {
    response = await fetch(absolute);
  } catch {
    throw new ManifestError(`Couldn't reach ${absolute}. Check the URL and that the host sends CORS headers.`);
  }
  if (!response.ok) throw new ManifestError(`Couldn't load ${absolute} (HTTP ${response.status}).`);
  return normalizeManifest(await response.json(), absolute);
}

export function normalizeManifest(raw, baseUrl) {
  if (raw?.formatVersion !== 1) throw new ManifestError("formatVersion must be 1.");
  for (const field of ["id", "name", "table", "layers", "pieces"]) {
    if (raw[field] == null) throw new ManifestError(`Missing required field "${field}".`);
  }

  const resolve = (path) => new URL(path, baseUrl).href;
  const layers = normalizeLayers(raw.layers);
  const sheets = normalizeSheets(raw.sheets || {}, resolve);
  const image = (value, where) => normalizeImage(value, where, sheets, resolve);
  const dieTypes = normalizeDieTypes(raw.dieTypes || {}, image);
  const contained = new Set((raw.containers || []).flatMap((c) => c.members || []));

  const seen = new Set();
  const pieces = raw.pieces.map((rawPiece) => {
    const piece = normalizePiece(rawPiece, raw, layers, image, contained, dieTypes);
    if (piece.id.includes(RESERVED_ID_CHARACTER)) throw new ManifestError(`Piece "${piece.id}" can't contain "#".`);
    if (seen.has(piece.id)) throw new ManifestError(`Duplicate piece id "${piece.id}".`);
    seen.add(piece.id);
    return piece;
  });

  const containers = normalizeContainers(raw.containers || [], pieces, layers, image, (bagId, type) => {
    if (!raw.pieceTypes?.[type]) throw new ManifestError(`Container "${bagId}" infinite names unknown piece type "${type}".`);
    const id = `${bagId}#template`;
    return normalizePiece({ id, type }, raw, layers, image, new Set([id]), dieTypes);
  });

  return {
    id: raw.id,
    name: raw.name,
    version: raw.version ?? null,
    table: normalizeTable(raw.table, image),
    layers,
    hands: normalizeHands(raw.hands),
    listedSeats: Boolean(raw.seats),
    maxSeats: raw.seats ? raw.seats.length : normalizeMaxSeats(raw.maxSeats),
    seats: raw.seats ? normalizeSeats(raw.seats) : madeUpSeats(),
    pieces,
    containers,
    labels: (raw.labels || []).map((label, i) => normalizeLabel(label, i, layers)),
    documents: normalizeDocuments(raw.documents, resolve),
    maxStackShown: normalizeStackShown(raw.maxStackShown),
    snaps: (raw.snaps || []).map(normalizeSnaps),
    setups: normalizeSetups(raw.setups, pieces, containers),
  };
}

const MAX_SNAP_POINTS = 2000;

// A spot on the table, [x, y].
function isSpot(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

// A group of snap points: { radius, accepts, points: [[x, y], ...] }, from
// either a list of points or a grid of them.
function normalizeSnaps(snaps, index) {
  const where = `Snaps ${index}`;
  if (!(snaps?.radius > 0)) throw new ManifestError(`${where} needs a radius.`);
  const accepts = snaps.accepts ?? null;
  if (accepts && (!Array.isArray(accepts) || accepts.some((m) => !m?.type && !m?.category && !m?.kind))) {
    throw new ManifestError(`${where} accepts must be a list of { kind, type, category } matchers.`);
  }
  let points = snaps.points;
  if (snaps.grid) {
    const { origin, step, count } = snaps.grid;
    if (![origin, step].every(isSpot) || !Array.isArray(count) || !count.every((n) => Number.isInteger(n) && n > 0)) {
      throw new ManifestError(`${where} grid needs an origin, a step, and a count of columns and rows.`);
    }
    points = [];
    for (let row = 0; row < count[1]; row++) {
      for (let column = 0; column < count[0]; column++) points.push([origin[0] + column * step[0], origin[1] + row * step[1]]);
    }
  }
  if (!Array.isArray(points) || !points.length || !points.every(isSpot)) throw new ManifestError(`${where} needs points or a grid.`);
  if (points.length > MAX_SNAP_POINTS) throw new ManifestError(`${where} has more than ${MAX_SNAP_POINTS} points.`);
  return { radius: snaps.radius, accepts, points };
}

// How many pieces tall a stack grows before it shows a count instead.
function normalizeStackShown(shown) {
  if (shown == null) return STACK_SHOWN;
  if (!Number.isInteger(shown) || shown < 1 || shown > 20) throw new ManifestError("maxStackShown must be a whole number from 1 to 20.");
  return shown;
}

// Rulebooks and other files that go with the game, as [{ name, url }]. The
// table only links to them, so they open in a new tab. Links must be http
// or https, so a module can't sneak in a script URL.
function normalizeDocuments(documents, resolve) {
  if (documents == null) return [];
  if (!Array.isArray(documents)) throw new ManifestError("documents must be a list.");
  return documents.map((document, i) => {
    const where = `Document ${i}`;
    if (typeof document?.name !== "string" || !document.name) throw new ManifestError(`${where} needs a name.`);
    if (typeof document.url !== "string" || !document.url) throw new ManifestError(`${where} needs a url.`);
    const url = resolve(document.url);
    if (!/^https?:$/.test(new URL(url).protocol)) throw new ManifestError(`${where} url must be http or https.`);
    return { name: document.name, url };
  });
}

// template(bagId, type) makes the piece an infinite bag hands out.
function normalizeContainers(rawContainers, pieces, layers, image, template) {
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  const pieceTypes = new Map(pieces.map((piece) => [piece.id, piece.type]));
  const pieceIds = new Set(pieceTypes.keys());
  const ids = new Set();
  const claimed = new Map(); // piece id -> container id
  return rawContainers.map((container) => {
    const where = `Container "${container?.id}"`;
    if (!container?.id) throw new ManifestError("Every container needs an id.");
    if (ids.has(container.id)) throw new ManifestError(`Duplicate container id "${container.id}".`);
    if (pieceIds.has(container.id)) throw new ManifestError(`${where} has the same id as a piece.`);
    if (container.id.startsWith(HAND_PREFIX)) throw new ManifestError(`${where} can't start with "${HAND_PREFIX}".`);
    if (container.id.includes(RESERVED_ID_CHARACTER)) throw new ManifestError(`${where} can't contain "#".`);
    ids.add(container.id);
    if (!CONTAINER_KINDS.includes(container.kind)) throw new ManifestError(`${where} has unknown kind "${container.kind}".`);
    if (!Array.isArray(container.position)) throw new ManifestError(`${where} needs a position.`);
    if (["deck", "tray", "bag"].includes(container.kind) && !(container.size?.[0] > 0 && container.size?.[1] > 0)) {
      throw new ManifestError(`${where} needs a size: [width, depth].`);
    }

    const members = container.members || [];
    for (const member of members) {
      if (!pieceIds.has(member)) throw new ManifestError(`${where} lists unknown piece "${member}".`);
      if (claimed.has(member)) {
        throw new ManifestError(`Piece "${member}" is in both "${claimed.get(member)}" and "${container.id}".`);
      }
      claimed.set(member, container.id);
    }

    if (container.kind === "stack") checkStack(members.map((id) => byId.get(id)), where);

    let accepts = container.accepts ?? null;
    if (accepts && (!Array.isArray(accepts) || accepts.some((m) => !m?.type && !m?.category))) {
      throw new ManifestError(`${where} accepts must be a list of { type, category } matchers.`);
    }
    // A deck takes more of what it starts with. An empty one takes anything.
    // A tray takes dice.
    if (!accepts && container.kind === "tray") accepts = [{ shape: "die" }];
    const memberTypes = members.map((member) => pieceTypes.get(member));
    if (!accepts && container.kind === "deck" && memberTypes.length && memberTypes.every(Boolean)) {
      accepts = [...new Set(memberTypes)].map((type) => ({ type }));
    }
    const bag = container.kind === "bag" ? normalizeBag(container, where, image, template) : {};
    const deck = container.kind === "deck" ? normalizeSplay(container, where) : {};
    const bowl = container.kind === "bowl" ? normalizeBowl(container, where) : {};
    // An infinite bag only takes back what it hands out.
    if (bag.template) accepts = [{ type: bag.template.type }];

    return {
      id: container.id,
      kind: container.kind,
      position: container.position,
      rotation: container.rotation || 0,
      size: container.size || null,
      layer: findLayer(layers, container.layer || "pieces", where),
      image: container.image ? image(container.image, `${where} image`) : null,
      fixed: container.fixed || false,
      faceUp: container.faceUp || false,
      members,
      accepts,
      ...bag,
      ...deck,
      ...bowl,
    };
  });
}

// A bowl is round, [diameter], or oval, [width, depth], in its color.
function normalizeBowl(container, where) {
  const [width, depth = width] = container.size || [];
  if (!(width > 0 && depth > 0)) throw new ManifestError(`${where} needs a size: [diameter] or [width, depth].`);
  if (container.color != null && !HEX_COLOR.test(container.color)) throw new ManifestError(`${where} color must be a hex color like "#c0392b".`);
  return { size: [width, depth], shape: width === depth ? "circle" : "oval", color: container.color || null };
}

// How a deck starts splayed, if at all, and how far apart its cards fan.
function normalizeSplay(container, where) {
  const splay = container.splay ?? null;
  if (splay != null && !SPLAY_DIRECTIONS[splay]) {
    throw new ManifestError(`${where} splay must be one of ${Object.keys(SPLAY_DIRECTIONS).join(", ")}.`);
  }
  const splayDistance = container.splayDistance ?? DEFAULT_SPLAY;
  if (!(splayDistance > 0)) throw new ManifestError(`${where} splayDistance must be more than 0.`);
  return { splay, splayDistance };
}

// A stack needs at least two tiles, chips, or tokens, all alike.
function checkStack(members, where) {
  if (members.length < 2) throw new ManifestError(`${where} needs at least two members.`);
  if (!members.every(canStack)) throw new ManifestError(`${where} can only hold tiles, chips, and tokens.`);
  const key = stackKey(members[0]);
  if (members.some((piece) => stackKey(piece) !== key)) throw new ManifestError(`${where} members must all be alike.`);
}

// A bag's look, and for an infinite bag, the piece it hands out.
function normalizeBag(container, where, image, template) {
  const text = container.text ?? null;
  if (text != null && (typeof text !== "string" || text.length > MAX_BAG_TEXT)) {
    throw new ManifestError(`${where} text must be at most ${MAX_BAG_TEXT} characters.`);
  }
  const bag = { color: container.color || DEFAULT_BAG_COLOR, text, template: null };
  if (container.infinite == null) return bag;
  if (container.members?.length) throw new ManifestError(`${where} is infinite, so it can't list members.`);
  if (typeof container.infinite !== "string") throw new ManifestError(`${where} infinite must name a piece type.`);
  return { ...bag, template: template(container.id, container.infinite) };
}

// The clear base a standee stands in, as [width, depth] on the table.
function holderSize(width) {
  return [width + 2 * HOLDER_MARGIN, Math.max(MIN_HOLDER_DEPTH, width * HOLDER_DEPTH)];
}

// Tiles, chips, tokens, and standees stand thicker than cards. Cards and
// boards are as thick as their layer.
function defaultThickness(kind, layer) {
  return ["tile", "chip", "token", "standee"].includes(kind) ? SOLID_THICKNESS : layer.thickness;
}

// Each layer sits on the ones below it, so its base is their total thickness.
function normalizeLayers(rawLayers) {
  if (!Array.isArray(rawLayers) || rawLayers.length === 0) throw new ManifestError("layers must be a list.");
  let base = 0;
  const seen = new Set();
  return rawLayers.map((layer) => {
    if (!LAYER_IDS.includes(layer?.id)) throw new ManifestError(`Unknown layer id "${layer?.id}".`);
    if (seen.has(layer.id)) throw new ManifestError(`Duplicate layer id "${layer.id}".`);
    if (!(layer.thickness > 0)) throw new ManifestError(`Layer "${layer.id}" needs a thickness.`);
    seen.add(layer.id);
    const normalized = { id: layer.id, thickness: layer.thickness, base };
    base += layer.thickness;
    return normalized;
  });
}

function findLayer(layers, id, where) {
  const layer = layers.find((l) => l.id === id);
  if (!layer) throw new ManifestError(`${where} is on unknown layer "${id}".`);
  return layer;
}

function normalizeHands(hands) {
  if (hands == null || hands === false) return { enabled: false, passing: false };
  if (hands === true) return { enabled: true, passing: true };
  if (typeof hands !== "object") throw new ManifestError("hands must be true, false, or { passing }.");
  return { enabled: true, passing: hands.passing ?? true };
}

function normalizeMaxSeats(maxSeats) {
  if (maxSeats == null) return MAX_SEATS;
  if (!Number.isInteger(maxSeats) || maxSeats < 1 || maxSeats > MAX_SEATS) {
    throw new ManifestError(`maxSeats must be 1 to ${MAX_SEATS}.`);
  }
  return maxSeats;
}

function normalizeSeats(rawSeats) {
  if (!Array.isArray(rawSeats) || rawSeats.length === 0 || rawSeats.length > MAX_SEATS) {
    throw new ManifestError(`seats must list 1 to ${MAX_SEATS} seats.`);
  }
  const ids = new Set();
  return rawSeats.map((rawSeat, i) => {
    const seat = normalizeSeat(rawSeat, i);
    if (ids.has(seat.id)) throw new ManifestError(`Duplicate seat id "${seat.id}".`);
    ids.add(seat.id);
    return seat;
  });
}

// Without listed seats, the table offers the eight half-sides; see
// state/seats.js for how they open up.
function madeUpSeats() {
  return SEAT_ORDER.map((side, i) => ({ id: side, name: side, side, color: SEAT_COLORS[i], hand: null, cameras: {} }));
}

function normalizeSeat(seat, index) {
  if (!seat?.id || !seat.name) throw new ManifestError("Every seat needs an id and a name.");
  if (![...SIDES, ...HALF_SIDES].includes(seat.side)) {
    throw new ManifestError(`Seat "${seat.id}" needs a side, like "south" or "south-left".`);
  }
  const hand = seat.hand ?? null;
  if (hand && (!Array.isArray(hand.position) || !(hand.size?.[0] > 0 && hand.size?.[1] > 0))) {
    throw new ManifestError(`Seat "${seat.id}" hand needs a position and a size.`);
  }
  const cameras = {};
  for (const [slot, view] of Object.entries(seat.cameras || {})) {
    if (!CAMERA_SLOTS.test(slot)) throw new ManifestError(`Seat "${seat.id}" camera slot "${slot}" must be 0 to 9.`);
    if (!isPoint(view?.position) || !isPoint(view?.target)) {
      throw new ManifestError(`Seat "${seat.id}" camera "${slot}" needs a position and target.`);
    }
    cameras[slot] = { position: view.position, target: view.target };
  }
  return {
    id: seat.id,
    name: seat.name,
    side: seat.side,
    color: seat.color || SEAT_COLORS[index],
    hand: hand && { position: hand.position, rotation: hand.rotation || 0, size: hand.size },
    cameras,
  };
}

function isPoint(value) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function normalizeLabel(label, index, layers) {
  const where = `Label ${index}`;
  if (typeof label?.text !== "string" || label.text === "") throw new ManifestError(`${where} needs text.`);
  if (!Array.isArray(label.position)) throw new ManifestError(`${where} needs a position.`);
  return {
    text: label.text,
    position: label.position,
    rotation: label.rotation || 0,
    fontSize: label.fontSize || 1,
    color: label.color || "#ffffff",
    layer: label.layer ? findLayer(layers, label.layer, where) : layers[0],
  };
}

function normalizeTable(table, image) {
  if (!Array.isArray(table.size) || table.size.length !== 2) {
    throw new ManifestError("table.size must be [width, depth].");
  }
  return {
    size: table.size,
    color: table.color || DEFAULT_TABLE_COLOR,
    image: table.image ? image(table.image, "table.image") : null,
  };
}

function normalizeSheets(sheets, resolve) {
  return Object.fromEntries(
    Object.entries(sheets).map(([key, sheet]) => {
      if (!sheet.image || !(sheet.columns > 0) || !(sheet.rows > 0)) {
        throw new ManifestError(`Sheet "${key}" needs image, columns, and rows.`);
      }
      return [key, { url: resolve(sheet.image), columns: sheet.columns, rows: sheet.rows }];
    })
  );
}

// An image is either a path or { sheet, index }. Both come out as { url },
// and sheet images also carry the grid cell to crop to.
// Plaques players write on: a counter keeps a labeled number, like a score;
// a note keeps text; a score sheet keeps each player's score by round.
const PLAQUES = ["counter", "note", "scoresheet"];

function normalizePlaque(piece, rawPiece, type, layer, where, inContainer) {
  if (piece.color != null && !HEX_COLOR.test(piece.color)) throw new ManifestError(`${where} color must be a hex color like "#c0392b".`);
  if (piece.size.length < 2 || !(piece.size[1] > 0)) throw new ManifestError(`${where} needs a size: [width, depth].`);
  const writing = {};
  if (piece.kind === "note") {
    writing.text = piece.text ?? "";
    const error = noteError(writing.text);
    if (error) throw new ManifestError(`${where}: ${error}`);
  } else {
    writing.label = piece.label ?? (piece.kind === "scoresheet" ? DEFAULT_SCORESHEET_LABEL : "");
    if (typeof writing.label !== "string" || writing.label.length > MAX_COUNTER_LABEL) {
      throw new ManifestError(`${where} label must be text, at most ${MAX_COUNTER_LABEL} characters.`);
    }
  }
  if (piece.kind === "counter") {
    writing.value = piece.value ?? 0;
    if (!Number.isInteger(writing.value) || Math.abs(writing.value) > MAX_COUNTER_VALUE) throw new ManifestError(`${where} value must be a whole number.`);
  }
  if (piece.kind === "scoresheet") {
    writing.players = piece.players ?? DEFAULT_SCORE_PLAYERS;
    const error = playersError(writing.players);
    if (error) throw new ManifestError(`${where}: ${error}`);
  }
  return {
    id: piece.id,
    kind: piece.kind,
    shape: "rect",
    size: piece.size,
    thickness: piece.thickness ?? COUNTER_THICKNESS,
    color: piece.color || (piece.kind === "note" ? DEFAULT_NOTE_COLOR : DEFAULT_COUNTER_COLOR),
    ...writing,
    type: rawPiece.type || null,
    categories: [...new Set([...(type.categories || []), ...(rawPiece.categories || [])])],
    layer,
    face: null,
    back: null,
    position: inContainer ? null : piece.position,
    rotation: piece.rotation || 0,
    faceUp: true,
    fixed: piece.fixed || false,
  };
}

// A tile's or board's shape when it isn't a plain rectangle, like a cluster
// of hexes: convex polygons, each a list of [x, y] in cm from the piece's
// middle, x to its right and y toward its far edge. Null for a rectangle.
function normalizeOutline(piece, where) {
  if (piece.outline == null) return null;
  if (!["tile", "board"].includes(piece.kind)) throw new ManifestError(`${where} isn't a tile or board, so it can't have an outline.`);
  const spot = (value) => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
  if (!Array.isArray(piece.outline) || !piece.outline.length ||
      !piece.outline.every((part) => Array.isArray(part) && part.length >= 3 && part.every(spot))) {
    throw new ManifestError(`${where} outline must be a list of polygons, each three or more [x, y] points.`);
  }
  return piece.outline;
}

// The color of a flat piece's sides, or null for the usual off-white.
function normalizeEdge(edge, where) {
  if (edge == null) return null;
  if (typeof edge !== "string" || !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(edge)) {
    throw new ManifestError(`${where} edge must be a hex color like "#c0392b".`);
  }
  return edge;
}

// A card's or board's states, like normal and upgraded, or a map's
// regions, as [{ name, face, back }], or
// null for a card without them. A state without a face or back uses the
// card's own, and a card's face defaults to its first state's.
function normalizeStates(piece, where, image) {
  if (piece.states == null) return null;
  if (!["card", "board"].includes(piece.kind)) throw new ManifestError(`${where} isn't a card or board, so it can't have states.`);
  if (!Array.isArray(piece.states) || piece.states.length < 2) throw new ManifestError(`${where} needs at least two states.`);
  const face = piece.face && image(piece.face, `${where} face`);
  const back = piece.back && image(piece.back, `${where} back`);
  const names = new Set();
  return piece.states.map((state, i) => {
    const name = state?.name;
    if (typeof name !== "string" || !name) throw new ManifestError(`${where} state ${i} needs a name.`);
    if (names.has(name)) throw new ManifestError(`${where} has two states named "${name}".`);
    names.add(name);
    const stateFace = state.face ? image(state.face, `${where} state "${name}" face`) : face;
    if (!stateFace) throw new ManifestError(`${where} state "${name}" needs a face image.`);
    return { name, face: stateFace, back: state.back ? image(state.back, `${where} state "${name}" back`) : back || stateFace };
  });
}

function normalizeImage(value, where, sheets, resolve) {
  if (typeof value === "string") return { url: resolve(value) };
  const sheet = sheets[value?.sheet];
  if (!sheet) throw new ManifestError(`${where} refers to unknown sheet "${value?.sheet}".`);
  const cells = sheet.columns * sheet.rows;
  if (!Number.isInteger(value.index) || value.index < 0 || value.index >= cells) {
    throw new ManifestError(`${where} index must be 0 to ${cells - 1}.`);
  }
  return { url: sheet.url, columns: sheet.columns, rows: sheet.rows, index: value.index };
}

// Custom dice: one image per face, or for a d4, one per corner number.
function normalizeDieTypes(dieTypes, image) {
  return Object.fromEntries(Object.entries(dieTypes).map(([key, dieType]) => {
    const where = `Die type "${key}"`;
    if (BUILT_IN_DICE[key]) throw new ManifestError(`${where} reuses a built-in die name.`);
    if (!DIE_SIDES.includes(dieType?.sides)) throw new ManifestError(`${where} sides must be ${DIE_SIDES.join(", ")}.`);
    if (!Array.isArray(dieType.faces) || dieType.faces.length !== dieType.sides) {
      throw new ManifestError(`${where} needs exactly ${dieType.sides} faces.`);
    }
    const faces = dieType.faces.map((face, i) => image(face, `${where} face ${i}`));
    return [key, { name: key, sides: dieType.sides, labels: null, images: faces }];
  }));
}

function normalizeDie(piece, where, dieTypes) {
  const builtIn = BUILT_IN_DICE[piece.die];
  const die = builtIn ? { name: piece.die, ...builtIn, images: null } : dieTypes[piece.die];
  if (!die) throw new ManifestError(`${where} has unknown die "${piece.die}".`);
  const value = piece.value ?? 0;
  if (!Number.isInteger(value) || value < 0 || value >= die.sides) {
    throw new ManifestError(`${where} value must be 0 to ${die.sides - 1}.`);
  }
  return { die: { ...die, color: piece.color || DEFAULT_DIE_COLOR }, value };
}

function normalizePiece(rawPiece, raw, layers, image, contained, dieTypes) {
  const type = rawPiece.type ? raw.pieceTypes?.[rawPiece.type] : {};
  if (!type) throw new ManifestError(`Piece "${rawPiece.id}" has unknown type "${rawPiece.type}".`);
  const piece = { ...type, ...rawPiece };
  const where = `Piece "${piece.id}"`;

  if (!piece.id) throw new ManifestError("Every piece needs an id.");
  if (piece.id.startsWith(HAND_PREFIX)) throw new ManifestError(`${where} can't start with "${HAND_PREFIX}".`);
  const shapes = KIND_SHAPES[piece.kind];
  if (!shapes) throw new ManifestError(`${where} needs a kind: ${Object.keys(KIND_SHAPES).join(", ")}.`);
  piece.shape ??= shapes[0];
  if (!shapes.includes(piece.shape)) throw new ManifestError(`${where} is a ${piece.kind}, so it can't be a ${piece.shape}.`);
  if (!Array.isArray(piece.size) || !(piece.size[0] > 0)) throw new ManifestError(`${where} needs a size.`);
  if (!piece.face && !piece.states && piece.shape !== "die" && !["pawn", ...PLAQUES].includes(piece.kind)) {
    throw new ManifestError(`${where} needs a face image.`);
  }

  const layer = findLayer(layers, piece.layer || (piece.kind === "board" ? "board" : "pieces"), where);

  const inContainer = contained.has(piece.id);
  if (!inContainer && !Array.isArray(piece.position)) {
    throw new ManifestError(`${where} needs a position, or a container that lists it.`);
  }

  if (piece.shape === "die") {
    const { die, value } = normalizeDie(piece, where, dieTypes);
    const width = piece.size[0] * (die.sides === 4 ? D4_SCALE : 1);
    return {
      id: piece.id,
      kind: "die",
      shape: "die",
      size: [width, width],
      type: rawPiece.type || null,
      categories: [...new Set([...(type.categories || []), ...(rawPiece.categories || [])])],
      layer,
      die,
      value,
      face: null,
      back: null,
      position: inContainer ? null : piece.position,
      rotation: piece.rotation || 0,
      faceUp: true,
      fixed: piece.fixed || false,
    };
  }

  if (PLAQUES.includes(piece.kind)) return normalizePlaque(piece, rawPiece, type, layer, where, inContainer);

  if (piece.kind === "pawn") {
    if (piece.color != null && !HEX_COLOR.test(piece.color)) throw new ManifestError(`${where} color must be a hex color like "#c0392b".`);
    if (piece.size[1] != null && !(piece.size[1] > 0)) throw new ManifestError(`${where} height must be positive.`);
    const width = piece.size[0];
    const depth = piece.shape === "meeple" ? piece.thickness ?? width * MEEPLE_DEPTH : width;
    return {
      id: piece.id,
      kind: "pawn",
      shape: piece.shape,
      // Footprint on the table; height is how tall it stands.
      size: [width, depth],
      height: piece.size[1] ?? width * PAWN_HEIGHTS[piece.shape],
      color: piece.color || DEFAULT_PAWN_COLOR,
      type: rawPiece.type || null,
      categories: [...new Set([...(type.categories || []), ...(rawPiece.categories || [])])],
      layer,
      face: null,
      back: null,
      position: inContainer ? null : piece.position,
      rotation: piece.rotation || 0,
      faceUp: true,
      fixed: piece.fixed || false,
    };
  }

  const states = normalizeStates(piece, where, image);
  const face = states ? states[0].face : image(piece.face, `${where} face`);
  const back = states ? states[0].back : piece.back ? image(piece.back, `${where} back`) : face;
  if (piece.thickness != null && !(piece.thickness > 0)) throw new ManifestError(`${where} thickness must be positive.`);
  return {
    id: piece.id,
    kind: piece.kind,
    shape: piece.shape,
    size: piece.shape === "circle" ? [piece.size[0], piece.size[0]] : piece.size,
    thickness: piece.thickness ?? defaultThickness(piece.kind, layer),
    // A standee's size is its width and height; it rests on a holder.
    ...(piece.kind === "standee" ? { holder: holderSize(piece.size[0]) } : {}),
    type: rawPiece.type || null,
    categories: [...new Set([...(type.categories || []), ...(rawPiece.categories || [])])],
    layer,
    face,
    back,
    states,
    edge: normalizeEdge(piece.edge, where),
    outline: normalizeOutline(piece, where),
    position: inContainer ? null : piece.position,
    rotation: piece.rotation || 0,
    faceUp: piece.faceUp ?? true,
    fixed: piece.fixed || false,
  };
}
