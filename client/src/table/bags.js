import * as THREE from "three";
import { bagHeight } from "../state/objects";
import { tableRotationToThree, tableToThree } from "./coordinates";
import { HELD_LIFT, restingTurn } from "./pieces";

const TEXT_PIXELS = 64; // canvas pixels per cm of lid
const TEXT_HEIGHT = 0.32; // of the lid's depth, at most
const TEXT_MARGIN = 0.08; // of the lid's width, kept clear at each end
const TEXT_BAND = 0.14; // of the lid's depth: where text sits under a lid image, measured from the near edge
const LID_IMAGE = 0.35; // the lid image's radius, as a share of the shorter side
const RING_WIDTH = 0.08; // of the lid image's radius
const RING_COLOR = 0xf1ece0;
const SURFACE_LIFT = 0.005; // keeps the lid image off the lid, so it never z-fights
const SHADOW_OPACITY = 0.35;
const SHADOW_SCALE = 1.08;
const SHADOW_LIFT = 0.003;
const BLOCKED_SHADOW_COLOR = 0xd0302a;
const GHOST_OPACITY = 0.35;

// A bag is a box in its color, its text printed on the lid, reading from
// the near edge, and its image in a ringed circle on the lid (with the text
// along the near edge below it). Every pickable mesh carries the bag's
// id in userData.objectId.
export function buildBag(id, def, textures) {
  const [width, depth] = def.size;
  const height = bagHeight(def);
  const color = new THREE.Color(def.color);
  const plain = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const lid = lidMaterial(def, width, depth);
  // Box material order: +x, -x, +y (top), -y (bottom), +z, -z.
  const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), [plain, plain, lid, plain, plain, plain]);
  box.position.y = height / 2;
  box.userData.objectId = id;

  const group = new THREE.Group();
  group.name = id;
  group.add(box);

  if (def.image) {
    const radius = Math.min(width, depth) * LID_IMAGE;
    const ring = new THREE.Mesh(
      new THREE.CircleGeometry(radius * (1 + RING_WIDTH), 48),
      new THREE.MeshBasicMaterial({ color: RING_COLOR })
    );
    const picture = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    textures.get(def.image).then((texture) => {
      picture.material.map = texture;
      picture.material.needsUpdate = true;
    });
    for (const [mesh, lift] of [[ring, SURFACE_LIFT], [picture, SURFACE_LIFT * 2]]) {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = height + lift;
      mesh.userData.objectId = id;
      group.add(mesh);
    }
  }

  const ghost = new THREE.Mesh(box.geometry, box.material.map((material) => {
    const copy = material.clone();
    copy.transparent = true;
    copy.opacity = GHOST_OPACITY;
    copy.depthWrite = false;
    return copy;
  }));
  ghost.visible = false;

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW_OPACITY, depthWrite: false })
  );
  shadow.rotation.order = "YXZ";
  shadow.scale.setScalar(SHADOW_SCALE);
  shadow.visible = false;

  group.userData = { ghost, shadow, height };
  return group;
}

// Places the bag for its state. floor lifts a held bag over whatever is
// under it; blocked tints its shadow red, and color tints it otherwise.
export function applyBagPlacement(group, def, state, { blocked = false, floor = 0, color = 0x000000 } = {}) {
  const { ghost, shadow, height } = group.userData;
  const rest = restingTurn(group, state);
  const held = Boolean(state.heldBy);
  const { x, y } = state.drag || state;
  const rotation = tableRotationToThree(state.rotation);
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
    ghost.position.fromArray(tableToThree([state.x, def.layer.base + (state.z || 0) + height / 2, state.y]));
    ghost.rotation.set(0, tableRotationToThree(rest.rotation), 0);
  }
}

// The lid: the bag's color, with its text sized to fit, in black or white,
// whichever stands out. The canvas's top edge is the lid's far edge, so the
// text reads upright from the near side.
function lidMaterial(def, width, depth) {
  if (!def.text) return new THREE.MeshStandardMaterial({ color: new THREE.Color(def.color), roughness: 0.8 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * TEXT_PIXELS);
  canvas.height = Math.ceil(depth * TEXT_PIXELS);
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.MeshStandardMaterial({ color: new THREE.Color(def.color), roughness: 0.8 });
  ctx.fillStyle = def.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Under a lid image, the text takes a band along the near edge.
  const band = def.image ? canvas.height * TEXT_BAND : canvas.height;
  let fontPx = Math.min(canvas.height * TEXT_HEIGHT, band * 0.8);
  ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
  const room = canvas.width * (1 - 2 * TEXT_MARGIN);
  const measured = ctx.measureText(def.text).width;
  if (measured > room) fontPx *= room / measured;
  ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
  ctx.fillStyle = darkText(def.color) ? "#1d1d1f" : "#f6f3ec";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(def.text, canvas.width / 2, def.image ? canvas.height - band / 2 : canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 });
}

function darkText(color) {
  const { r, g, b } = new THREE.Color(color);
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.55;
}
