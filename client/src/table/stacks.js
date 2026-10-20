import * as THREE from "three";
import { stackHeight } from "../state/objects";
import { tableRotationToThree, tableToThree } from "./coordinates";
import { EDGE_COLOR, HELD_LIFT, restingTurn } from "./pieces";

const LINE_COLOR = "rgba(0, 0, 0, 0.35)";
const BAND_PIXELS = 16; // texture rows per piece in the pile
const BOTTOM_COLOR = 0xd8d4ca;
const COUNTER_SIZE = 0.55; // of the stack's shorter side
const COUNTER_LIFT = 0.01; // keeps the counter off the top, so it never z-fights
const SHADOW_OPACITY = 0.35;
const SHADOW_SCALE = 1.08;
const SHADOW_LIFT = 0.003;
const BLOCKED_SHADOW_COLOR = 0xd0302a;
const GHOST_OPACITY = 0.35;

// A stack looks like its pieces piled up: their shape, each one's own edge
// color with a line between them, and the top piece's up side on top. Past its module's maxStackShown pieces it stops
// growing and shows a count on top instead. Every pickable mesh carries the
// stack's id in userData.objectId.
export function buildStack(id, def) {
  const [width, depth] = def.size;
  const sides = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const top = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const bottom = new THREE.MeshStandardMaterial({ color: BOTTOM_COLOR, roughness: 0.9 });
  // Built one unit tall, then scaled to the stack's height. Three maps a
  // cylinder's caps turned a quarter, so turn it back, as pieces do.
  const body = def.shape === "circle"
    // Cylinder material groups: side, top cap, bottom cap.
    ? new THREE.Mesh(new THREE.CylinderGeometry(width / 2, width / 2, 1, 48).rotateY(Math.PI / 2), [sides, top, bottom])
    // Box material order: +x, -x, +y (top), -y (bottom), +z, -z.
    : new THREE.Mesh(new THREE.BoxGeometry(width, 1, depth), [sides, sides, top, bottom, sides, sides]);
  body.userData.objectId = id;

  const counterSize = Math.min(width, depth) * COUNTER_SIZE;
  const counter = new THREE.Mesh(
    new THREE.PlaneGeometry(counterSize, counterSize / 2),
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
  );
  // Laid flat, then spun about the vertical by faceCamera.
  counter.rotation.order = "YXZ";
  counter.rotation.x = -Math.PI / 2;
  counter.userData.objectId = id;
  counter.visible = false;

  const group = new THREE.Group();
  group.name = id;
  group.add(body, counter);

  const ghost = new THREE.Mesh(body.geometry, body.material.map((material) => {
    const copy = material.clone();
    copy.transparent = true;
    copy.opacity = GHOST_OPACITY;
    copy.depthWrite = false;
    return copy;
  }));
  ghost.visible = false;

  const shadow = new THREE.Mesh(
    def.shape === "circle" ? new THREE.CircleGeometry(width / 2, 48) : new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW_OPACITY, depthWrite: false })
  );
  shadow.rotation.order = "YXZ";
  shadow.scale.setScalar(SHADOW_SCALE);
  shadow.visible = false;

  group.userData = { body, counter, ghost, shadow, top, ghostTop: ghost.material[def.shape === "circle" ? 1 : 2], topKey: null, count: null };
  return group;
}

// Places the stack for its state. edges are the edge colors of its pieces,
// top first, null for the usual. floor lifts a held stack over whatever is
// under it; blocked tints its shadow red, and color tints it otherwise.
export function applyStackPlacement(group, def, state, edges, { blocked = false, floor = 0, color = 0x000000 } = {}) {
  const { body, counter, ghost, shadow } = group.userData;
  const rest = restingTurn(group, state);
  const count = state.members.length;
  const height = stackHeight(def, count);
  const held = Boolean(state.heldBy);
  const { x, y } = state.drag || state;
  const rotation = tableRotationToThree(state.rotation);

  body.scale.y = height;
  body.position.y = height / 2;
  showSides(group, edges.slice(0, def.shown).map((edge) => edge || EDGE_COLOR));
  showCount(group, count, def.shown);
  counter.position.y = height + COUNTER_LIFT;

  const lift = held ? floor + HELD_LIFT : state.z || 0;
  group.position.fromArray(tableToThree([x, def.layer.base + lift, y]));
  group.rotation.set(0, rotation, 0);

  shadow.visible = held;
  if (held) {
    shadow.position.fromArray(tableToThree([x, def.layer.base + floor + SHADOW_LIFT, y]));
    shadow.rotation.set(-Math.PI / 2, rotation, 0);
    shadow.material.color.set(blocked ? BLOCKED_SHADOW_COLOR : color);
  }
  ghost.visible = held && Boolean(state.drag);
  if (ghost.visible) {
    ghost.scale.copy(body.scale);
    ghost.position.fromArray(tableToThree([state.x, def.layer.base + (state.z || 0) + height / 2, state.y]));
    ghost.rotation.set(0, tableRotationToThree(rest.rotation), 0);
  }
}

// Spins the count on top so it reads upright from the camera.
export function faceCamera(group, cameraPosition) {
  const { counter } = group.userData;
  if (!counter.visible) return;
  const here = counter.getWorldPosition(new THREE.Vector3());
  const away = here.sub(cameraPosition);
  // The text's top points away from the camera, less the stack's own turn.
  counter.rotation.y = Math.atan2(-away.x, -away.z) - group.rotation.y;
}

// Shows a texture on the stack's top: its top piece's up side.
export function setStackTop(group, texture) {
  const { top, ghostTop } = group.userData;
  for (const material of [top, ghostTop]) {
    material.map = texture;
    material.needsUpdate = true;
  }
}

// "x6" in white with a black outline, once there are more pieces than show.
function showCount(group, count, shown) {
  const { counter } = group.userData;
  counter.visible = count > shown;
  if (!counter.visible || group.userData.count === count) return;
  group.userData.count = count;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.font = "800 92px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 14;
  ctx.strokeStyle = "#000000";
  ctx.strokeText(`x${count}`, 128, 66, 240);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`x${count}`, 128, 66, 240);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  counter.material.map?.dispose();
  counter.material.map = texture;
  counter.material.needsUpdate = true;
}

// Paints the stack's sides with a band per shown piece, top first, each its
// edge color with a line along its bottom.
function showSides(group, colors) {
  const key = colors.join(",");
  if (group.userData.sidesKey === key) return;
  group.userData.sidesKey = key;
  const texture = sideTexture(colors);
  const { body, ghost } = group.userData;
  for (const material of [body.material[0], ghost.material[0]]) {
    material.map?.dispose();
    material.map = texture;
    material.needsUpdate = true;
  }
}

function sideTexture(colors) {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = BAND_PIXELS * colors.length;
  const ctx = canvas.getContext("2d");
  colors.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, i * BAND_PIXELS, 4, BAND_PIXELS);
    ctx.fillStyle = LINE_COLOR;
    ctx.fillRect(0, (i + 1) * BAND_PIXELS - 1, 4, 1);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}
