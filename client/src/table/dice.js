import * as THREE from "three";
import { tableRotationToThree, tableToThree } from "./coordinates";
import { dieRegions, orientation, restHeight } from "./diceGeometry";
import { HELD_LIFT, restingTurn } from "./pieces";
import { D4_SCALE, PIP_RADIUS, labelSize, pipSpots } from "../state/dice";

const LABEL_PIXELS = 128;
const INK = "#2a2a2a";
const EDGE_COLOR = 0x3a3a3a;
const BRIGHT = 0xffffff;
const DIM = 0x5c5c5c;
const SHADOW_OPACITY = 0.35;
const SHADOW_LIFT = 0.003;
const BLOCKED_SHADOW_COLOR = 0xd0302a;
const GHOST_OPACITY = 0.3;
const SWIRL_OPACITY = 0.85;

const labelTextures = new Map();

// A die: a solid whose face (or for a d4, corner section) materials carry
// its numbers or images. setDieValue brightens the top and dims the rest.
// Every mesh carries the piece id in userData.objectId.
export function buildDie(def, textures) {
  const { sides, labels, images, color, pips } = def.die;
  const regions = dieRegions(sides);
  const geometry = regionGeometry(regions);
  const materials = regions.map((region) => {
    const material = new THREE.MeshBasicMaterial({ color: DIM });
    if (labels) {
      material.map = labelTexture(labels[region.label], color, sides, pips);
    } else {
      textures.get(images[region.label]).then((texture) => {
        material.map = texture;
        material.needsUpdate = true;
      });
    }
    return material;
  });

  const body = new THREE.Mesh(geometry, materials);
  body.userData.objectId = def.id;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), new THREE.LineBasicMaterial({ color: EDGE_COLOR }));

  const group = new THREE.Group();
  group.name = def.id;
  group.add(body, edges);
  group.scale.setScalar(def.size[0]);

  const ghost = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: BRIGHT, transparent: true, opacity: GHOST_OPACITY, depthWrite: false,
  }));
  ghost.scale.setScalar(def.size[0]);
  ghost.visible = false;

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(def.size[0] / 2, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW_OPACITY, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.visible = false;

  // The swirl is as big as other dice of the d4's listed size.
  const swirlWidth = sides === 4 ? def.size[0] / D4_SCALE : def.size[0];
  const swirl = new THREE.Mesh(
    new THREE.SphereGeometry(swirlWidth / 2, 24, 16),
    new THREE.MeshBasicMaterial({ map: swirlTexture(), transparent: true, opacity: SWIRL_OPACITY, depthWrite: false })
  );
  swirl.visible = false;
  swirl.userData.radius = swirlWidth / 2;

  group.userData = { regions, materials, ghost, shadow, swirl, value: null };
  return group;
}

// Places a die: spot is { x, y, base }, where base is the height it rests
// on. floor lifts a held die over what's under it; blocked tints its shadow
// red, and color tints it otherwise; rest is { x, y, base } of where it came
// from, for the ghost.
export function applyDiePlacement(group, def, state, spot, { blocked = false, floor = 0, color = 0x000000, rest = null } = {}) {
  const { ghost, shadow, swirl } = group.userData;
  const resting = restingTurn(group, state);
  const sides = def.die.sides;
  const size = def.size[0];
  const held = Boolean(state.heldBy);
  const lift = held ? floor + HELD_LIFT : 0;
  const center = restHeight(sides) * size;
  const turn = orientation(sides, state.value, tableRotationToThree(state.rotation));

  group.visible = !swirl.visible;
  group.position.fromArray(tableToThree([spot.x, spot.base + lift + center, spot.y]));
  group.quaternion.copy(turn);
  swirl.position.fromArray(tableToThree([spot.x, spot.base + lift + swirl.userData.radius, spot.y]));
  setDieValue(group, state.value);

  shadow.visible = held;
  if (held) {
    shadow.position.fromArray(tableToThree([spot.x, spot.base + floor + SHADOW_LIFT, spot.y]));
    shadow.material.color.set(blocked ? BLOCKED_SHADOW_COLOR : color);
  }
  ghost.visible = held && Boolean(rest);
  if (ghost.visible) {
    ghost.position.fromArray(tableToThree([rest.x, rest.base + center, rest.y]));
    ghost.quaternion.copy(orientation(sides, resting.value, tableRotationToThree(resting.rotation)));
  }
}

export function hideDie(group) {
  const { ghost, shadow } = group.userData;
  group.visible = ghost.visible = shadow.visible = false;
}

// Brightens the face (or d4 corners) for `value` and dims the rest.
export function setDieValue(group, value) {
  if (group.userData.value === value) return;
  group.userData.value = value;
  group.userData.regions.forEach((region, i) => {
    group.userData.materials[i].color.setHex(region.label === value ? BRIGHT : DIM);
  });
}

// Shows the swirl in the die's place, or the die again.
export function setSwirling(group, swirling, elapsed = 0) {
  const { swirl } = group.userData;
  swirl.visible = swirling;
  group.visible = !swirling;
  if (swirling) {
    swirl.rotation.set(elapsed * 9, elapsed * 13, elapsed * 5);
    swirl.material.map.offset.set(elapsed * 1.7, elapsed * 0.9);
  }
}

// One triangle fan per region, with UVs that put the middle of its texture
// at the region's center, upright along its `up`.
function regionGeometry(regions) {
  const positions = [];
  const uvs = [];
  const geometry = new THREE.BufferGeometry();
  regions.forEach((region, i) => {
    const right = new THREE.Vector3().crossVectors(region.up, region.normal).normalize();
    const flat = region.polygon.map((p) => {
      const d = p.clone().sub(region.center);
      return [d.dot(right), d.dot(region.up)];
    });
    const extent = Math.max(...flat.flat().map(Math.abs)) * 2;
    const start = positions.length / 3;
    for (let k = 1; k < region.polygon.length - 1; k++) {
      for (const index of [0, k, k + 1]) {
        positions.push(...region.polygon[index].toArray());
        uvs.push(0.5 + flat[index][0] / extent, 0.5 + flat[index][1] / extent);
      }
    }
    geometry.addGroup(start, positions.length / 3 - start, i);
  });
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

// A number, or pips, on the die's color. 6 and 9 get underlined on dice
// where they could be confused.
function labelTexture(label, color, sides, pips = false) {
  const key = `${label}|${color}|${sides}|${pips}`;
  if (labelTextures.has(key)) return labelTextures.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = LABEL_PIXELS;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, LABEL_PIXELS, LABEL_PIXELS);
  if (pips) {
    ctx.fillStyle = INK;
    for (const [x, y] of pipSpots(label)) {
      ctx.beginPath();
      ctx.arc((0.5 + x) * LABEL_PIXELS, (0.5 + y) * LABEL_PIXELS, PIP_RADIUS * LABEL_PIXELS, 0, Math.PI * 2);
      ctx.fill();
    }
    return cacheTexture(key, canvas);
  }
  const fontPx = labelSize(label, sides) * LABEL_PIXELS;
  ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const middle = LABEL_PIXELS / 2;
  ctx.fillText(label, middle, middle);
  if (sides >= 6 && (label === "6" || label === "9")) {
    const width = ctx.measureText(label).width;
    ctx.fillRect(middle - width / 2, middle + fontPx * 0.42, width, fontPx * 0.08);
  }
  return cacheTexture(key, canvas);
}

function cacheTexture(key, canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  labelTextures.set(key, texture);
  return texture;
}

let swirlCanvas = null;

// Soft gray noise that blurs into a fuzzy blob when it spins.
function swirlTexture() {
  if (!swirlCanvas) {
    swirlCanvas = document.createElement("canvas");
    swirlCanvas.width = swirlCanvas.height = 64;
    const ctx = swirlCanvas.getContext("2d");
    for (let i = 0; i < 400; i++) {
      const shade = 150 + Math.floor(Math.random() * 105);
      ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade + 10}, ${0.3 + Math.random() * 0.5})`;
      ctx.beginPath();
      ctx.arc(Math.random() * 64, Math.random() * 64, 2 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(swirlCanvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
