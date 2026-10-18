import * as THREE from "three";
import { tableRotationToThree, tableToThree } from "./coordinates";

const EDGE_COLOR = 0xe8e4da;
export const HELD_LIFT = 0.3; // cm a held piece floats above its resting height

// A piece is a slab its layer's thickness: the face image on top, the back
// image underneath, and plain edges. Flipping turns the whole slab over, so
// placement() decides which side shows.
export async function buildPiece(piece, textures) {
  const [width, depth] = piece.size;
  const thickness = piece.layer.thickness;
  const [faceTexture, backTexture] = await Promise.all([textures.get(piece.face), textures.get(piece.back)]);

  const edge = new THREE.MeshStandardMaterial({ color: EDGE_COLOR, roughness: 0.9 });
  const top = sideMaterial(faceTexture);
  const bottom = sideMaterial(backTexture);

  const mesh = piece.shape === "circle"
    // Cylinder material groups: edge, top cap, bottom cap.
    ? new THREE.Mesh(new THREE.CylinderGeometry(width / 2, width / 2, thickness, 48), [edge, top, bottom])
    // Box material order: +x, -x, +y (top), -y (bottom), +z, -z.
    : new THREE.Mesh(new THREE.BoxGeometry(width, thickness, depth), [edge, edge, top, bottom, edge, edge]);
  mesh.name = piece.id;
  return mesh;
}

// Where a piece's mesh goes for its current state, in Three's coordinates,
// or null when it's inside a container and shouldn't draw on its own.
export function placement(def, state) {
  if (state.containerId) return null;
  const { x, y } = state.drag || state;
  const lift = state.heldBy ? HELD_LIFT : 0;
  return {
    position: tableToThree([x, def.layer.base + def.layer.thickness / 2 + lift, y]),
    // Euler XYZ applies z first: turn the slab over along its length, then
    // spin it to its table rotation.
    rotation: [0, tableRotationToThree(state.rotation), state.faceUp ? 0 : Math.PI],
  };
}

export function applyPlacement(mesh, def, state) {
  const place = placement(def, state);
  mesh.visible = Boolean(place);
  if (!place) return;
  mesh.position.fromArray(place.position);
  mesh.rotation.set(...place.rotation);
}

function sideMaterial(texture) {
  // Unlit, so faces stay readable from any camera angle. alphaTest cuts out
  // transparent corners on rounded cards.
  return new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5 });
}
