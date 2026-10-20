import * as THREE from "three";
import { DICE_TRAY_FLOOR, DICE_TRAY_WALL } from "../state/objects";
import { tableRotationToThree, tableToThree } from "./coordinates";

const FLOOR_COLOR = 0x5a2230;
const WALL_COLOR = 0x6b4a2f;
const WALL_THICKNESS = 0.4;

// A dice tray: a felt floor inside four low wooden walls. Every mesh carries
// the tray's id in userData.objectId.
export function buildDiceTray(id, def) {
  const [width, depth] = def.size;
  const group = new THREE.Group();
  group.name = id;

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(width, DICE_TRAY_FLOOR, depth),
    new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, roughness: 1 })
  );
  floor.position.y = DICE_TRAY_FLOOR / 2;
  floor.userData.objectId = id;
  group.add(floor);

  const wall = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.7 });
  const walls = [
    [width + WALL_THICKNESS * 2, WALL_THICKNESS, 0, (depth + WALL_THICKNESS) / 2],
    [width + WALL_THICKNESS * 2, WALL_THICKNESS, 0, -(depth + WALL_THICKNESS) / 2],
    [WALL_THICKNESS, depth, (width + WALL_THICKNESS) / 2, 0],
    [WALL_THICKNESS, depth, -(width + WALL_THICKNESS) / 2, 0],
  ];
  for (const [w, d, x, z] of walls) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, DICE_TRAY_WALL, d), wall);
    mesh.position.set(x, DICE_TRAY_WALL / 2, z);
    mesh.userData.objectId = id;
    group.add(mesh);
  }
  return group;
}

// floor lifts a held tray over what's under it.
export function placeDiceTray(group, def, state, { floor = 0, lift = 0 } = {}) {
  const { x, y } = state.drag || state;
  group.position.fromArray(tableToThree([x, def.layer.base + (state.heldBy ? floor + lift : state.z || 0), y]));
  group.rotation.set(0, tableRotationToThree(state.rotation), 0);
}
