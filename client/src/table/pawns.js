import * as THREE from "three";
import { pawnOutline, pawnProfile } from "../state/pawnShapes";
import { finishUpright } from "./upright";

const ROUGHNESS = 0.45;
const LATHE_SEGMENTS = 40;
const MEEPLE_BEVEL = 0.06; // of the width, rounding a meeple's edges

// A built-in pawn: a solid in the manifest's color, standing on the table at
// its footprint's center. Classic pawns and cones are spun from a profile;
// a meeple is its silhouette, cut out and given depth. Every mesh carries the
// piece id in userData.objectId.
export function buildPawn(piece) {
  const [width, depth] = piece.size;
  const height = piece.height;
  const material = new THREE.MeshStandardMaterial({ color: piece.color, roughness: ROUGHNESS });
  const geometry = piece.shape === "meeple"
    ? meepleGeometry(width, height, depth)
    : new THREE.LatheGeometry(pawnProfile(piece.shape).map(([x, y]) => new THREE.Vector2(x * width, y * height)), LATHE_SEGMENTS);
  const body = new THREE.Mesh(geometry, material);
  body.userData.objectId = piece.id;

  const group = new THREE.Group();
  group.name = piece.id;
  group.add(body);
  return finishUpright(group, piece.size, piece.shape !== "meeple");
}

// The meeple's outline, extruded front to back and centered on its footprint.
function meepleGeometry(width, height, depth) {
  const bevel = Math.min(width * MEEPLE_BEVEL, depth / 3);
  const points = pawnOutline("meeple").map(([x, y]) => new THREE.Vector2(x * (width - 2 * bevel), bevel + y * (height - 2 * bevel)));
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points), {
    depth: depth - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 4,
  });
  geometry.translate(0, 0, -(depth - 2 * bevel) / 2);
  return geometry;
}
