import * as THREE from "three";
import { tableRotationToThree, tableToThree } from "./coordinates";

const EDGE_COLOR = 0xe8e4da;

// A piece is a slab its layer's thickness, resting on the layer's base: the
// face image on top, the back image underneath, and plain edges.
export async function buildPiece(piece, textures) {
  const [width, depth] = piece.size;
  const thickness = piece.layer.thickness;
  const [faceTexture, backTexture] = await Promise.all([textures.get(piece.face), textures.get(piece.back)]);

  const edge = new THREE.MeshStandardMaterial({ color: EDGE_COLOR, roughness: 0.9 });
  const top = sideMaterial(piece.faceUp ? faceTexture : backTexture);
  const bottom = sideMaterial(piece.faceUp ? backTexture : faceTexture);

  const mesh = piece.shape === "circle"
    // Cylinder material groups: edge, top cap, bottom cap.
    ? new THREE.Mesh(new THREE.CylinderGeometry(width / 2, width / 2, thickness, 48), [edge, top, bottom])
    // Box material order: +x, -x, +y (top), -y (bottom), +z, -z.
    : new THREE.Mesh(new THREE.BoxGeometry(width, thickness, depth), [edge, edge, top, bottom, edge, edge]);

  mesh.name = piece.id;
  const [x, y] = piece.position;
  mesh.position.fromArray(tableToThree([x, piece.layer.base + thickness / 2, y]));
  mesh.rotation.y = tableRotationToThree(piece.rotation);
  return mesh;
}

function sideMaterial(texture) {
  // Unlit, so faces stay readable from any camera angle. alphaTest cuts out
  // transparent corners on rounded cards.
  return new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5 });
}
