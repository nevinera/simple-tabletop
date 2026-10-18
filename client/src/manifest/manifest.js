// Loads a game manifest (see docs/manifest-format.md) and turns it into the
// shape the table renders from: piece types merged in, defaults filled, and
// every image resolved to an absolute URL.

import { BUILT_IN_DICE, DIE_SIDES } from "../state/dice";
import { HALF_SIDES, SEAT_ORDER, SIDES } from "../state/seats";

export const DEFAULT_TABLE_COLOR = "#2e6b3f";
const LAYER_IDS = ["board", "pieces"];
const SHAPES = ["rect", "circle", "die"];
const DEFAULT_DIE_COLOR = "#f4efe2";
const CONTAINER_KINDS = ["deck", "bag", "bowl", "tray"];
const CAMERA_SLOTS = /^[0-9]$/;
const MAX_SEATS = 8;
const HAND_PREFIX = "hand-"; // hand containers' ids; see state/seats.js
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
    if (seen.has(piece.id)) throw new ManifestError(`Duplicate piece id "${piece.id}".`);
    seen.add(piece.id);
    return piece;
  });

  return {
    id: raw.id,
    name: raw.name,
    table: normalizeTable(raw.table, image),
    layers,
    hands: normalizeHands(raw.hands),
    listedSeats: Boolean(raw.seats),
    maxSeats: raw.seats ? raw.seats.length : normalizeMaxSeats(raw.maxSeats),
    seats: raw.seats ? normalizeSeats(raw.seats) : madeUpSeats(),
    pieces,
    containers: normalizeContainers(raw.containers || [], pieces, layers, image),
    labels: (raw.labels || []).map((label, i) => normalizeLabel(label, i, layers)),
  };
}

function normalizeContainers(rawContainers, pieces, layers, image) {
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
    ids.add(container.id);
    if (!CONTAINER_KINDS.includes(container.kind)) throw new ManifestError(`${where} has unknown kind "${container.kind}".`);
    if (!Array.isArray(container.position)) throw new ManifestError(`${where} needs a position.`);
    if (["deck", "tray"].includes(container.kind) && !(container.size?.[0] > 0 && container.size?.[1] > 0)) {
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
    };
  });
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

// A tetrahedron looks small next to other dice of the same width, so a d4
// grows by this much.
const D4_SCALE = 1.5;

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
  if (!SHAPES.includes(piece.shape)) throw new ManifestError(`${where} has unsupported shape "${piece.shape}".`);
  if (!Array.isArray(piece.size) || !(piece.size[0] > 0)) throw new ManifestError(`${where} needs a size.`);
  if (!piece.face && piece.shape !== "die") throw new ManifestError(`${where} needs a face image.`);

  const layer = findLayer(layers, piece.layer || "pieces", where);

  const inContainer = contained.has(piece.id);
  if (!inContainer && !Array.isArray(piece.position)) {
    throw new ManifestError(`${where} needs a position, or a container that lists it.`);
  }

  if (piece.shape === "die") {
    const { die, value } = normalizeDie(piece, where, dieTypes);
    const width = piece.size[0] * (die.sides === 4 ? D4_SCALE : 1);
    return {
      id: piece.id,
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

  const face = image(piece.face, `${where} face`);
  return {
    id: piece.id,
    shape: piece.shape,
    size: piece.shape === "circle" ? [piece.size[0], piece.size[0]] : piece.size,
    type: rawPiece.type || null,
    categories: [...new Set([...(type.categories || []), ...(rawPiece.categories || [])])],
    layer,
    face,
    back: piece.back ? image(piece.back, `${where} back`) : face,
    position: inContainer ? null : piece.position,
    rotation: piece.rotation || 0,
    faceUp: piece.faceUp ?? true,
    fixed: piece.fixed || false,
  };
}
