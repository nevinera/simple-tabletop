import * as THREE from "three";
import { HAND_TRAY_HEIGHT } from "../state/objects";
import { tableRotationToThree, tableToThree } from "./coordinates";

const TRAY_COLOR = 0x2c2622;
const RIM_LIFT = 0.01; // just above the tray, so the rim never z-fights with it

// A hand tray: a low dark slab with a rim in the seat's color. Cards lie on
// top of it; see applyHandSlot in pieces.js.
export function buildTray(id, def, color) {
  const [width, depth] = def.size;
  const group = new THREE.Group();
  group.name = id;

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(width, HAND_TRAY_HEIGHT, depth),
    new THREE.MeshStandardMaterial({ color: TRAY_COLOR, roughness: 0.8 })
  );
  slab.position.y = HAND_TRAY_HEIGHT / 2;
  slab.userData.objectId = id;

  const rim = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, depth)),
    new THREE.LineBasicMaterial({ color: new THREE.Color(color || "#cccccc") })
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = HAND_TRAY_HEIGHT + RIM_LIFT;

  group.add(slab, rim);
  return group;
}

export function placeTray(group, def) {
  const [x, y] = def.position;
  group.position.fromArray(tableToThree([x, def.layer.base, y]));
  group.rotation.set(0, tableRotationToThree(def.rotation), 0);
}
