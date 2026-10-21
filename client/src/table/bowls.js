import * as THREE from "three";
import { BOWL_FLOOR, BOWL_RIM } from "../state/objects";
import { tableRotationToThree, tableToThree } from "./coordinates";

const BOWL_COLOR = "#8a5a33";
const RIM_WIDTH = 0.06; // of the bowl's size, outside its inside
const SEGMENTS = 48;
const COUNTER_WIDTH = 1.8; // cm
const COUNTER_GAP = 0.5; // cm between the rim and the count

// A bowl: a shallow open dish, round or oval, whose pieces lie in the open
// on its floor (the scene places them). A count of what's in it floats by
// the rim on the camera's side. Every pickable mesh carries the bowl's id in
// userData.objectId.
export function buildBowl(id, def) {
  const [width, depth] = def.size;
  const group = new THREE.Group();
  group.name = id;

  // A unit dish, turned about the vertical, then stretched to the bowl's
  // width and depth. Heights stay in centimeters.
  const inside = 0.5;
  const outside = inside * (1 + RIM_WIDTH);
  const profile = [
    [0, BOWL_FLOOR], [inside * 0.82, BOWL_FLOOR], [inside * 0.95, BOWL_RIM * 0.6], [inside, BOWL_RIM],
    [outside, BOWL_RIM], [outside, 0],
  ].map(([r, h]) => new THREE.Vector2(r, h));
  const dish = new THREE.Mesh(
    new THREE.LatheGeometry(profile, SEGMENTS),
    new THREE.MeshStandardMaterial({ color: def.color || BOWL_COLOR, roughness: 0.75, side: THREE.DoubleSide })
  );
  dish.scale.set(width, 1, depth);
  dish.userData.objectId = id;

  const counter = new THREE.Mesh(
    new THREE.PlaneGeometry(COUNTER_WIDTH, COUNTER_WIDTH / 2),
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
  );
  counter.rotation.order = "YXZ";
  counter.rotation.x = -Math.PI / 2;
  counter.position.y = BOWL_RIM + 0.02;
  counter.userData.objectId = id;
  counter.visible = false;

  group.add(dish, counter);
  group.userData = { dish, counter, count: null, reach: [width / 2 * (1 + RIM_WIDTH), depth / 2 * (1 + RIM_WIDTH)] };
  return group;
}

// floor lifts a held bowl over what's under it.
export function placeBowl(group, def, state, { floor = 0, lift = 0 } = {}) {
  const { x, y } = state.drag || state;
  group.position.fromArray(tableToThree([x, def.layer.base + (state.heldBy ? floor + lift : state.z || 0), y]));
  group.rotation.set(0, tableRotationToThree(state.rotation), 0);
  showBowlCount(group, state.members.length);
}

// Turns the count to read upright from the camera, and moves it to the
// rim on the camera's side, so it never hides what's in the bowl.
export function faceBowlCounter(group, cameraPosition) {
  const { counter, reach: [a, b] } = group.userData;
  if (!counter.visible) return;
  const local = group.worldToLocal(cameraPosition.clone());
  const angle = Math.atan2(local.z, local.x);
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  // How far the oval's rim reaches toward the camera.
  const rim = 1 / Math.hypot(cos / a, sin / b);
  const out = rim + COUNTER_GAP + COUNTER_WIDTH / 4;
  counter.position.x = cos * out;
  counter.position.z = sin * out;
  // The text's top points away from the camera, as on a stack's count.
  counter.rotation.y = Math.atan2(cos, sin);
}

function showBowlCount(group, count) {
  const { counter } = group.userData;
  counter.visible = count > 0;
  if (!counter.visible || group.userData.count === count) return;
  group.userData.count = count;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.font = "800 96px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 14;
  ctx.strokeStyle = "#000000";
  ctx.strokeText(String(count), 128, 66, 240);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(String(count), 128, 66, 240);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  counter.material.map?.dispose();
  counter.material.map = texture;
  counter.material.needsUpdate = true;
}
