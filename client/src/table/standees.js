import * as THREE from "three";
import { finishUpright } from "./upright";

const HOLDER_COLOR = 0xdfeaf2;
const HOLDER_OPACITY = 0.35;
const HOLDER_HEIGHT = 0.5; // cm
const SLOT_DEPTH = 0.25; // cm the standee sits down into its holder

// A standee stands upright in a clear holder: its face toward the front, its
// back behind, and see-through where its images are. The group sits on the
// table at its holder's center. Every mesh carries the piece id in
// userData.objectId.
export async function buildStandee(piece, textures) {
  const [width, height] = piece.size;
  const [holderWidth, holderDepth] = piece.holder;
  const [faceTexture, backTexture] = await Promise.all([textures.get(piece.face), textures.get(piece.back)]);

  // The edges are straight, but the figure may not be, so they don't draw.
  const edge = new THREE.MeshBasicMaterial({ visible: false });
  const face = new THREE.MeshBasicMaterial({ map: faceTexture, alphaTest: 0.5 });
  const back = new THREE.MeshBasicMaterial({ map: backTexture, alphaTest: 0.5 });
  // Box material order: +x, -x, +y, -y, +z (front, toward the near edge), -z.
  const figure = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, piece.thickness),
    [edge, edge, edge, edge, face, back]
  );
  figure.position.y = HOLDER_HEIGHT - SLOT_DEPTH + height / 2;

  const holder = new THREE.Mesh(
    new THREE.BoxGeometry(holderWidth, HOLDER_HEIGHT, holderDepth),
    new THREE.MeshStandardMaterial({
      color: HOLDER_COLOR, transparent: true, opacity: HOLDER_OPACITY, roughness: 0.2, depthWrite: false,
    })
  );
  holder.position.y = HOLDER_HEIGHT / 2;

  const group = new THREE.Group();
  group.name = piece.id;
  group.add(figure, holder);
  for (const mesh of [figure, holder]) mesh.userData.objectId = piece.id;

  return finishUpright(group, piece.holder);
}
