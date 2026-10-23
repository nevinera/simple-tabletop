// Checks a manifest's setups (see state/setups.js) and puts each step in one
// shape: { op, select | target, to, into, count, stateName, faceUp,
// rotation, locked }.

import { ManifestError } from "./manifest";

const OPS = ["reset", "move", "shuffle", "deal", "state"];
const MAX_SETUPS = 50;
const MAX_STEPS = 500;

export function normalizeSetups(setups, pieces, containers) {
  if (setups == null) return [];
  if (!Array.isArray(setups) || setups.length > MAX_SETUPS) throw new ManifestError(`setups must be a list of at most ${MAX_SETUPS}.`);
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const containerById = new Map(containers.map((container) => [container.id, container]));
  const categories = new Set(pieces.flatMap((piece) => piece.categories || []));
  for (const container of containers) for (const category of container.template?.categories || []) categories.add(category);
  const ids = new Set();
  return setups.map((setup, i) => {
    const where = `Setup "${setup?.id ?? i}"`;
    if (typeof setup?.id !== "string" || !setup.id) throw new ManifestError(`Setup ${i} needs an id.`);
    if (ids.has(setup.id)) throw new ManifestError(`Duplicate setup id "${setup.id}".`);
    ids.add(setup.id);
    if (!Array.isArray(setup.steps) || !setup.steps.length || setup.steps.length > MAX_STEPS) {
      throw new ManifestError(`${where} needs 1 to ${MAX_STEPS} steps.`);
    }
    const check = { pieceById, containerById, categories };
    return {
      id: setup.id,
      name: typeof setup.name === "string" && setup.name ? setup.name : setup.id,
      description: typeof setup.description === "string" ? setup.description : null,
      steps: setup.steps.map((step, n) => normalizeStep(step, `${where} step ${n + 1}`, check)),
    };
  });
}

function normalizeStep(step, where, check) {
  const ops = OPS.filter((op) => step?.[op] != null);
  if (ops.length !== 1) throw new ManifestError(`${where} needs exactly one of ${OPS.join(", ")}.`);
  const [op] = ops;
  const out = { op };
  for (const key of ["faceUp", "locked"]) {
    if (step[key] != null && typeof step[key] !== "boolean") throw new ManifestError(`${where} ${key} must be true or false.`);
    if (step[key] != null) out[key] = step[key];
  }
  if (step.rotation != null) {
    if (!Number.isFinite(step.rotation)) throw new ManifestError(`${where} rotation must be a number.`);
    out.rotation = step.rotation;
  }

  if (op === "reset" || op === "move") out.select = normalizeSelect(step[op], where, check);
  if (op === "move") {
    if ((step.to == null) === (step.into == null)) throw new ManifestError(`${where} needs either to or into.`);
    if (step.into != null) out.into = container(step.into, where, check, ["deck", "bag", "bowl", "tray", "stack"]);
    else out.to = spots(step.to, where);
  }
  if (op === "shuffle") out.target = container(step.shuffle, where, check, ["deck", "bag"]);
  if (op === "deal") {
    out.target = container(step.deal, where, check, ["deck"]);
    out.to = spots(step.to, where);
  }
  if (op === "state") {
    const piece = check.pieceById.get(step.state);
    if (!piece?.states) throw new ManifestError(`${where} names "${step.state}", which isn't a piece with states.`);
    if (!piece.states.some((s) => s.name === step.to)) throw new ManifestError(`${where} names no state of "${step.state}" called "${step.to}".`);
    out.target = piece.id;
    out.stateName = step.to;
  }
  return out;
}

// An id, a list of ids, { category }, or { in: containerId }.
function normalizeSelect(select, where, check) {
  const known = (id) => check.pieceById.has(id) || check.containerById.has(id);
  if (typeof select === "string" || Array.isArray(select)) {
    const ids = [select].flat();
    const unknown = ids.find((id) => !known(id));
    if (unknown !== undefined) throw new ManifestError(`${where} names unknown piece or container "${unknown}".`);
    return { ids };
  }
  if (typeof select?.category === "string") {
    if (!check.categories.has(select.category)) throw new ManifestError(`${where} names unknown category "${select.category}".`);
    return { category: select.category };
  }
  if (typeof select?.in === "string") return { in: container(select.in, where, check) };
  throw new ManifestError(`${where} must pick an id, a list of ids, { category }, or { in }.`);
}

function container(id, where, check, kinds = null) {
  const found = check.containerById.get(id);
  if (!found) throw new ManifestError(`${where} names unknown container "${id}".`);
  if (kinds && !kinds.includes(found.kind)) throw new ManifestError(`${where} can't use ${found.kind} "${id}" that way.`);
  return id;
}

// A spot, [x, y], or a list of them.
function spots(to, where) {
  const isSpot = (value) => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
  const list = isSpot(to) ? [to] : to;
  if (!Array.isArray(list) || !list.length || !list.every(isSpot)) throw new ManifestError(`${where} to must be a spot, [x, y], or a list of them.`);
  return list;
}
