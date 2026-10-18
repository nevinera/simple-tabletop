// Loads a game manifest (see docs/manifest-format.md) and turns it into the
// shape the table renders from: piece types merged in, defaults filled, and
// every image resolved to an absolute URL.

export const DEFAULT_TABLE_COLOR = "#2e6b3f";
const LAYER_IDS = ["board", "pieces"];
const SHAPES = ["rect", "circle"];
const CONTAINER_KINDS = ["deck", "bag", "bowl", "tray"];
const CAMERA_SLOTS = /^[0-9]$/;

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
  for (const field of ["id", "name", "table", "layers", "seats", "pieces"]) {
    if (raw[field] == null) throw new ManifestError(`Missing required field "${field}".`);
  }

  const resolve = (path) => new URL(path, baseUrl).href;
  const layers = normalizeLayers(raw.layers);
  const sheets = normalizeSheets(raw.sheets || {}, resolve);
  const image = (value, where) => normalizeImage(value, where, sheets, resolve);
  const contained = new Set((raw.containers || []).flatMap((c) => c.members || []));

  const seen = new Set();
  const pieces = raw.pieces.map((rawPiece) => {
    const piece = normalizePiece(rawPiece, raw, layers, image, contained);
    if (seen.has(piece.id)) throw new ManifestError(`Duplicate piece id "${piece.id}".`);
    seen.add(piece.id);
    return piece;
  });

  return {
    id: raw.id,
    name: raw.name,
    table: normalizeTable(raw.table, image),
    layers,
    seats: raw.seats.map(normalizeSeat),
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
    ids.add(container.id);
    if (!CONTAINER_KINDS.includes(container.kind)) throw new ManifestError(`${where} has unknown kind "${container.kind}".`);
    if (!Array.isArray(container.position)) throw new ManifestError(`${where} needs a position.`);
    if (container.kind === "deck" && !(container.size?.[0] > 0 && container.size?.[1] > 0)) {
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

function normalizeSeat(seat) {
  if (!seat?.id || !seat.name) throw new ManifestError("Every seat needs an id and a name.");
  const cameras = {};
  for (const [slot, view] of Object.entries(seat.cameras || {})) {
    if (!CAMERA_SLOTS.test(slot)) throw new ManifestError(`Seat "${seat.id}" camera slot "${slot}" must be 0 to 9.`);
    if (!isPoint(view?.position) || !isPoint(view?.target)) {
      throw new ManifestError(`Seat "${seat.id}" camera "${slot}" needs a position and target.`);
    }
    cameras[slot] = { position: view.position, target: view.target };
  }
  return { id: seat.id, name: seat.name, color: seat.color || null, cameras };
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

function normalizePiece(rawPiece, raw, layers, image, contained) {
  const type = rawPiece.type ? raw.pieceTypes?.[rawPiece.type] : {};
  if (!type) throw new ManifestError(`Piece "${rawPiece.id}" has unknown type "${rawPiece.type}".`);
  const piece = { ...type, ...rawPiece };
  const where = `Piece "${piece.id}"`;

  if (!piece.id) throw new ManifestError("Every piece needs an id.");
  if (!SHAPES.includes(piece.shape)) throw new ManifestError(`${where} has unsupported shape "${piece.shape}".`);
  if (!Array.isArray(piece.size) || !(piece.size[0] > 0)) throw new ManifestError(`${where} needs a size.`);
  if (!piece.face) throw new ManifestError(`${where} needs a face image.`);

  const layer = findLayer(layers, piece.layer || "pieces", where);

  const inContainer = contained.has(piece.id);
  if (!inContainer && !Array.isArray(piece.position)) {
    throw new ManifestError(`${where} needs a position, or a container that lists it.`);
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
