import * as THREE from "three";
import { deckHeight, fanBox } from "../state/objects";
import { tableRotationToThree, tableToThree } from "./coordinates";
import { HELD_LIFT, restingTurn } from "./pieces";

const SIDE_COLOR = "#9a9a9e";
const LINE_COLOR = "#6f6f74";
const BOTTOM_COLOR = 0x8a8a8e;
const LINE_SPACING = 0.15; // cm between the lines drawn on a deck's sides
const OUTLINE_COLOR = 0xe8e4da;
const OUTLINE_LIFT = 0.01; // just above the layer below, so it never z-fights with it
const SHADOW_OPACITY = 0.35;
const SHADOW_SCALE = 1.08;
const SHADOW_LIFT = 0.003;
const BLOCKED_SHADOW_COLOR = 0xd0302a;
const GHOST_OPACITY = 0.35;

// A deck is a box: its top shows the deck's image, or the top card's face or
// back; its sides are gray with a line every couple of cards. An empty deck
// is a dashed outline instead. Every pickable mesh carries the deck's id in
// userData.objectId.
export function buildDeck(id, def) {
  const group = new THREE.Group();
  group.name = id;

  const sides = new THREE.MeshStandardMaterial({ map: sideTexture(), roughness: 0.9 });
  const top = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const bottom = new THREE.MeshStandardMaterial({ color: BOTTOM_COLOR, roughness: 0.9 });
  // Box material order: +x, -x, +y (top), -y (bottom), +z, -z.
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [sides, sides, top, bottom, sides, sides]);
  box.userData.objectId = id;

  const [width, depth] = def.size;
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, depth)),
    new THREE.LineDashedMaterial({ color: OUTLINE_COLOR, dashSize: 0.6, gapSize: 0.4 })
  );
  outline.computeLineDistances();
  // An invisible face over the outline, so an empty deck can still be picked.
  const hitArea = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hitArea.userData.objectId = id;
  const placeholder = new THREE.Group();
  placeholder.add(outline, hitArea);
  placeholder.rotation.x = -Math.PI / 2;

  const ghostMaterials = box.material.map((material) => {
    const ghost = material.clone();
    ghost.transparent = true;
    ghost.opacity = GHOST_OPACITY;
    ghost.depthWrite = false;
    return ghost;
  });
  const ghost = new THREE.Mesh(box.geometry, ghostMaterials);
  ghost.visible = false;

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW_OPACITY, depthWrite: false })
  );
  shadow.rotation.order = "YXZ";
  shadow.scale.setScalar(SHADOW_SCALE);
  shadow.visible = false;

  group.add(box, placeholder);
  group.userData = { box, placeholder, ghost, shadow, top, ghostTop: ghostMaterials[2], topKey: null };
  return group;
}

// The image the deck's top should show: its own image, or the top card's
// face or back, depending on which way the deck faces.
export function deckTopImage(def, deckState, cardDef) {
  if (def.image) return def.image;
  if (!cardDef) return null;
  return deckState.faceUp ? cardDef.face : cardDef.back;
}

// Places the deck for its state. floor lifts a held deck over whatever is
// under it; blocked tints its shadow red, and color tints it otherwise. A
// splayed deck shows no box: the scene lays its cards out (see fanSpots), and
// this places its shadow under them.
export function applyDeckPlacement(group, def, state, { blocked = false, floor = 0, color = 0x000000 } = {}) {
  const { box, placeholder, ghost, shadow, top, ghostTop } = group.userData;
  const rest = restingTurn(group, state);
  // While held, the ghost keeps the top it had when picked up, even if the
  // deck is flipped.
  if (!rest && ghostTop.map !== top.map) {
    ghostTop.map = top.map;
    ghostTop.needsUpdate = true;
  }
  const [width, depth] = def.size;
  const layer = def.layer;
  const empty = state.members.length === 0;
  const splayed = Boolean(state.splay) && !empty;
  const height = deckHeight(state.members.length);
  const held = Boolean(state.heldBy);
  const { x, y } = state.drag || state;
  const rotation = tableRotationToThree(state.rotation);

  box.visible = !empty && !splayed;
  placeholder.visible = empty;
  box.scale.set(width, height, depth);
  box.position.y = height / 2;
  placeholder.position.y = OUTLINE_LIFT;
  fitSideLines(box.material[0].map, height);

  const lift = held ? floor + HELD_LIFT : 0;
  group.position.fromArray(tableToThree([x, layer.base + lift, y]));
  group.rotation.set(0, rotation, 0);

  shadow.visible = held;
  if (held) {
    const fan = fanBox({ kind: "container", def, state }, x, y, state.rotation);
    const [middleX, middleY] = fan ? fan.middle : [x, y];
    const [fanWidth, fanDepth] = fan ? fan.size : def.size;
    shadow.position.fromArray(tableToThree([middleX, layer.base + floor + SHADOW_LIFT, middleY]));
    shadow.rotation.set(-Math.PI / 2, rotation, 0);
    shadow.scale.set((SHADOW_SCALE * fanWidth) / width, (SHADOW_SCALE * fanDepth) / depth, 1);
    shadow.material.color.set(blocked ? BLOCKED_SHADOW_COLOR : color);
  }

  ghost.visible = held && Boolean(state.drag) && !empty && !splayed;
  if (ghost.visible) {
    ghost.scale.copy(box.scale);
    ghost.position.fromArray(tableToThree([state.x, layer.base + height / 2, state.y]));
    ghost.rotation.set(0, tableRotationToThree(rest.rotation), 0);
  }
}

// Shows a texture on the deck's top, or plain white while there's none. The
// ghost catches up once the deck is let go (see applyDeckPlacement).
export function setDeckTop(group, texture) {
  const { top, ghostTop } = group.userData;
  const materials = group.userData.restingTurn ? [top] : [top, ghostTop];
  for (const material of materials) {
    material.map = texture;
    material.needsUpdate = true;
  }
}

function sideTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 8;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = SIDE_COLOR;
  ctx.fillRect(0, 0, 4, 8);
  ctx.fillStyle = LINE_COLOR;
  ctx.fillRect(0, 7, 4, 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

// Evenly spaced lines up the sides, however tall the deck is.
function fitSideLines(texture, height) {
  texture.repeat.set(1, Math.max(1, Math.round(height / LINE_SPACING)));
}
