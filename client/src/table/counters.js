import * as THREE from "three";
import { buildGhost, buildShadow } from "./pieces";

const PIXELS_WIDE = 768;
const DARK_INK = "#1f1f1f";
const LIGHT_INK = "#f7f5ef";

// A counter is a plaque its own thickness, its color all over, with its
// label and number drawn on top. showCount redraws them when they change.
// Placed like any flat piece, with applyPlacement.
export function buildCounter(def) {
  const [width, depth] = def.size;
  const body = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.8 });
  const top = new THREE.MeshBasicMaterial({ color: def.color });
  // Box material order: +x, -x, +y (top), -y (bottom), +z, -z.
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, def.thickness, depth), [body, body, top, body, body, body]);
  mesh.name = def.id;
  mesh.userData.objectId = def.id;
  for (const material of [body, top]) material.polygonOffset = true;
  mesh.userData.shadow = buildShadow(def);
  mesh.userData.ghost = buildGhost(mesh);
  mesh.userData.countKey = null;
  return mesh;
}

// Draws the counter's label and number on its top, if they changed.
export function showCount(mesh, def, state) {
  paintTop(mesh, def, `${state.label}\n${state.value}`, (ctx, w, h) => drawCount(ctx, w, h, state.label, state.value));
}

// Paints a plaque's top with draw(ctx, width, height) on its color, unless
// key is what's there already. Used by counters, notes, and score sheets.
export function paintTop(mesh, def, key, draw) {
  if (mesh.userData.countKey === key) return;
  const [width, depth] = def.size;
  const canvas = document.createElement("canvas");
  canvas.width = PIXELS_WIDE;
  canvas.height = Math.round((PIXELS_WIDE * depth) / width);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = def.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = inkFor(def.color);
  draw(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  mesh.userData.countKey = key;
  const top = mesh.material[2];
  top.map?.dispose();
  top.map = texture;
  top.color.set(0xffffff);
  top.needsUpdate = true;
}

function drawCount(ctx, w, h, label, value) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const hasLabel = Boolean(label);
  if (hasLabel) {
    ctx.globalAlpha = 0.75;
    ctx.font = `600 ${Math.round(h * 0.24)}px system-ui, sans-serif`;
    ctx.fillText(label, w / 2, h * 0.24, w * 0.9);
    ctx.globalAlpha = 1;
  }
  ctx.font = `800 ${Math.round(h * (hasLabel ? 0.5 : 0.62))}px system-ui, sans-serif`;
  ctx.fillText(String(value), w / 2, hasLabel ? h * 0.64 : h / 2, w * 0.92);
}

// Dark text on light counters, light text on dark ones.
export function inkFor(color) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.55 ? DARK_INK : LIGHT_INK;
}
