import * as THREE from "three";
import { tableRotationToThree, tableToThree } from "./coordinates";
import { deferImages, lazyMaterial, setImages } from "./lazyImages";

export const EDGE_COLOR = "#e8e4da";
export const HELD_LIFT = 0.3; // cm a held piece floats above its resting height
const SHADOW_OPACITY = 0.35;
const SHADOW_COLOR = 0x000000;
const BLOCKED_SHADOW_COLOR = 0xd0302a; // the piece can't land here
const SHADOW_SCALE = 1.08; // a bit bigger than the piece, so it shows around the edges
const SHADOW_LIFT = 0.003; // just above the layer below, so it never z-fights with it
const GHOST_OPACITY = 0.35;
// Pieces on one layer all rest at the same height, so overlapping ones would
// z-fight. Depth bias per stacking rank keeps the higher-ranked one in front
// at any camera distance.
const POLYGON_OFFSET_PER_RANK = -4;

// A piece is a slab its own thickness: the face image on top, the back
// image underneath, and plain edges. Flipping turns the whole slab over, so
// placement() decides which side shows. Its images load once it shows (see
// lazyImages.js).
export function buildPiece(piece) {
  const [width, depth] = piece.size;
  const thickness = piece.thickness;

  // A shaped piece's slab is still a box, so its square sides would show
  // past its outline; its images carry the shape instead.
  const edge = new THREE.MeshStandardMaterial({ color: piece.edge || EDGE_COLOR, roughness: 0.9, visible: !piece.outline });
  const top = lazyMaterial(sideMaterial(), "face");
  const bottom = lazyMaterial(sideMaterial(), "back");

  const mesh = piece.shape === "circle"
    // Cylinder material groups: edge, top cap, bottom cap.
    ? new THREE.Mesh(circleGeometry(width, thickness), [edge, top, bottom])
    // Box material order: +x, -x, +y (top), -y (bottom), +z, -z.
    : new THREE.Mesh(new THREE.BoxGeometry(width, thickness, depth), [edge, edge, top, bottom, edge, edge]);
  mesh.name = piece.id;
  mesh.userData.objectId = piece.id;
  for (const material of [edge, top, bottom]) material.polygonOffset = true;
  mesh.userData.shadow = buildShadow(piece);
  mesh.userData.ghost = buildGhost(mesh);
  mesh.userData.stateIndex = 0;
  deferImages(mesh, { face: piece.face, back: piece.back }, mesh.userData.ghost);
  return mesh;
}

// Switches a card to the images of its current state, which load the next
// time it shows.
export function applyCardState(mesh, def, piece) {
  const index = piece.stateIndex || 0;
  if (!def.states || mesh.userData.stateIndex === index) return;
  mesh.userData.stateIndex = index;
  setImages(mesh, def.states[index]);
}

// Three maps a cylinder's cap images turned a quarter clockwise, so turn the
// cylinder back to stand them upright.
function circleGeometry(width, thickness) {
  return new THREE.CylinderGeometry(width / 2, width / 2, thickness, 48).rotateY(Math.PI / 2);
}

// A see-through copy of the piece left at its resting spot while it's
// dragged, so you can see where it came from.
export function buildGhost(mesh) {
  const materials = mesh.material.map((material) => {
    const ghost = material.clone();
    ghost.transparent = true;
    ghost.opacity = GHOST_OPACITY;
    // Opacity scales the alpha that alphaTest sees, so scale the cutoff too,
    // or the whole face gets cut away.
    ghost.alphaTest = material.alphaTest * GHOST_OPACITY;
    ghost.depthWrite = false;
    return ghost;
  });
  const ghost = new THREE.Mesh(mesh.geometry, materials);
  ghost.visible = false;
  return ghost;
}

// A dark footprint on the surface under a held piece, showing where it will
// land.
export function buildShadow(piece) {
  const [width, depth] = piece.size;
  const geometry = piece.shape === "circle"
    ? new THREE.CircleGeometry(width / 2, 48)
    : new THREE.PlaneGeometry(width, depth);
  const shadow = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: SHADOW_COLOR, transparent: true, opacity: SHADOW_OPACITY, depthWrite: false })
  );
  shadow.rotation.order = "YXZ";
  shadow.scale.setScalar(SHADOW_SCALE);
  shadow.visible = false;
  return shadow;
}

// Where a piece's mesh goes for its current state, in Three's coordinates,
// or null when it's inside a container and shouldn't draw on its own. floor
// lifts a held piece over whatever is under it, such as a deck.
export function placement(def, state, floor = 0) {
  if (state.containerId) return null;
  const { x, y } = state.drag || state;
  const lift = state.heldBy ? floor + HELD_LIFT : state.z || 0;
  return {
    position: tableToThree([x, def.layer.base + def.thickness / 2 + lift, y]),
    // Euler XYZ applies z first: turn the slab over along its length, then
    // spin it to its table rotation.
    rotation: [0, tableRotationToThree(state.rotation), state.faceUp ? 0 : Math.PI],
  };
}

// rank is the piece's place in its layer's stacking order, 0 at the bottom.
// blocked means a held piece would overlap something where it hovers, and
// tints its shadow red; color tints it otherwise.
export function applyPlacement(mesh, def, state, rank, { blocked = false, floor = 0, color = SHADOW_COLOR } = {}) {
  const place = placement(def, state, floor);
  const { shadow, ghost } = mesh.userData;
  restingTurn(mesh, state);
  mesh.visible = Boolean(place);
  shadow.visible = Boolean(place && state.heldBy);
  ghost.visible = Boolean(place && state.heldBy && state.drag);
  if (!place) return;

  mesh.position.fromArray(place.position);
  mesh.rotation.set(...place.rotation);
  for (const material of mesh.material) material.polygonOffsetUnits = rank * POLYGON_OFFSET_PER_RANK;

  if (shadow.visible) {
    const { x, y } = state.drag || state;
    shadow.position.fromArray(tableToThree([x, def.layer.base + floor + SHADOW_LIFT, y]));
    shadow.rotation.set(-Math.PI / 2, place.rotation[1], 0);
    shadow.material.color.set(blocked ? BLOCKED_SHADOW_COLOR : color);
  }
  if (ghost.visible) {
    const rest = placement(def, { ...state, ...mesh.userData.restingTurn, heldBy: null, drag: null });
    ghost.position.fromArray(rest.position);
    ghost.rotation.set(...rest.rotation);
  }
}

// How an object sat when it was picked up, so its ghost keeps that turn and
// facing however the held object changes. Cleared once it's let go.
export function restingTurn(object3d, state) {
  object3d.userData.restingTurn = state.heldBy
    ? object3d.userData.restingTurn || { rotation: state.rotation, faceUp: state.faceUp, value: state.value }
    : null;
  return object3d.userData.restingTurn;
}

// Puts a card on a hand tray: spot is { x, y, height, rotation, faceUp,
// lifted }, where height is the tray's top and faceUp is whether this
// viewer gets to see its face.
export function applyHandSlot(mesh, def, spot, rank) {
  const { shadow, ghost } = mesh.userData;
  mesh.visible = true;
  shadow.visible = false;
  ghost.visible = false;
  mesh.userData.restingTurn = null;
  const lift = spot.lifted ? HELD_LIFT : 0;
  mesh.position.fromArray(tableToThree([spot.x, spot.height + def.thickness / 2 + lift, spot.y]));
  mesh.rotation.set(0, tableRotationToThree(spot.rotation), spot.faceUp ? 0 : Math.PI);
  for (const material of mesh.material) material.polygonOffsetUnits = rank * POLYGON_OFFSET_PER_RANK;
}

// Each loose piece's rank within its layer, by stackOrder.
export function stackRanks(defs, pieces) {
  const byLayer = new Map();
  for (const def of defs) {
    if (pieces[def.id].containerId) continue;
    if (!byLayer.has(def.layer.id)) byLayer.set(def.layer.id, []);
    byLayer.get(def.layer.id).push(def.id);
  }
  const ranks = new Map();
  for (const ids of byLayer.values()) {
    ids.sort((a, b) => pieces[a].stackOrder - pieces[b].stackOrder);
    ids.forEach((id, rank) => ranks.set(id, rank));
  }
  return ranks;
}

function sideMaterial() {
  // Unlit, so faces stay readable from any camera angle. alphaTest cuts out
  // transparent corners on rounded cards.
  return new THREE.MeshBasicMaterial({ alphaTest: 0.5 });
}
