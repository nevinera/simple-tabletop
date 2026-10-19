import * as THREE from "three";
import { tableRotationToThree, tableToThree } from "./coordinates";
import { HELD_LIFT, restingTurn } from "./pieces";

const HOLDER_COLOR = 0xdfeaf2;
const HOLDER_OPACITY = 0.35;
const HOLDER_HEIGHT = 0.5; // cm
const SLOT_DEPTH = 0.25; // cm the standee sits down into its holder
const SHADOW_OPACITY = 0.35;
const SHADOW_SCALE = 1.08;
const SHADOW_LIFT = 0.003;
const BLOCKED_SHADOW_COLOR = 0xd0302a;
const GHOST_OPACITY = 0.35;

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
    new THREE.PlaneGeometry(holderWidth, holderDepth),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW_OPACITY, depthWrite: false })
  );
  shadow.rotation.order = "YXZ";
  shadow.scale.setScalar(SHADOW_SCALE);
  shadow.visible = false;

  group.userData = { ...group.userData, shadow, ghost };
  return group;
}

// Places a standee for its state, like applyPlacement does for flat pieces.
export function applyStandeePlacement(group, def, state, { blocked = false, floor = 0, color = 0x000000 } = {}) {
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
  const lift = held ? floor + HELD_LIFT : 0;
  group.position.fromArray(tableToThree([x, def.layer.base + lift, y]));
  group.rotation.set(0, rotation, 0);

  if (shadow.visible) {
    shadow.position.fromArray(tableToThree([x, def.layer.base + floor + SHADOW_LIFT, y]));
    shadow.rotation.set(-Math.PI / 2, rotation, 0);
    shadow.material.color.set(blocked ? BLOCKED_SHADOW_COLOR : color);
  }
  if (ghost.visible) {
    ghost.position.fromArray(tableToThree([state.x, def.layer.base, state.y]));
    ghost.rotation.set(0, tableRotationToThree(rest.rotation), 0);
  }
}
