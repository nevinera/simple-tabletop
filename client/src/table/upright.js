import * as THREE from "three";
import { tableRotationToThree, tableToThree } from "./coordinates";
import { HELD_LIFT, restingTurn } from "./pieces";

const SHADOW_OPACITY = 0.35;
const SHADOW_SCALE = 1.08;
const SHADOW_LIFT = 0.003;
const BLOCKED_SHADOW_COLOR = 0xd0302a;
const GHOST_OPACITY = 0.35;

// Shared by pieces that stand up off the table, standees and pawns: a group
// resting on the table at its footprint's center, with a see-through ghost
// and a footprint shadow kept in userData. round makes the shadow a circle
// of the footprint's width.
export function finishUpright(group, [width, depth], round = false) {
  const ghost = group.clone();
  ghost.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.material = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((material) => {
      const copy = material.clone();
      copy.transparent = true;
      copy.opacity = Math.min(copy.opacity, GHOST_OPACITY);
      copy.alphaTest = material.alphaTest * GHOST_OPACITY;
      copy.depthWrite = false;
      return copy;
    });
    delete mesh.userData.objectId;
  });
  ghost.visible = false;

  const shadow = new THREE.Mesh(
    round ? new THREE.CircleGeometry(width / 2, 48) : new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW_OPACITY, depthWrite: false })
  );
  shadow.rotation.order = "YXZ";
  shadow.scale.setScalar(SHADOW_SCALE);
  shadow.visible = false;

  group.userData = { ...group.userData, shadow, ghost };
  return group;
}

// Places an upright piece for its state, like applyPlacement does for flat
// pieces. floor lifts a held piece over what's under it; blocked tints its
// shadow red, and color tints it otherwise.
export function applyUprightPlacement(group, def, state, { blocked = false, floor = 0, color = 0x000000 } = {}) {
  const { shadow, ghost } = group.userData;
  const rest = restingTurn(group, state);
  const loose = !state.containerId;
  const held = loose && Boolean(state.heldBy);
  group.visible = loose;
  shadow.visible = held;
  ghost.visible = held && Boolean(state.drag);
  if (!loose) return;

  const { x, y } = state.drag || state;
  const rotation = tableRotationToThree(state.rotation);
  const lift = held ? floor + HELD_LIFT : state.z || 0;
  group.position.fromArray(tableToThree([x, def.layer.base + lift, y]));
  group.rotation.set(0, rotation, 0);

  if (shadow.visible) {
    shadow.position.fromArray(tableToThree([x, def.layer.base + floor + SHADOW_LIFT, y]));
    shadow.rotation.set(-Math.PI / 2, rotation, 0);
    shadow.material.color.set(blocked ? BLOCKED_SHADOW_COLOR : color);
  }
  if (ghost.visible) {
    ghost.position.fromArray(tableToThree([state.x, def.layer.base + (state.z || 0), state.y]));
    ghost.rotation.set(0, tableRotationToThree(rest.rotation), 0);
  }
}
