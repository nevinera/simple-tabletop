import * as THREE from "three";
import { tableRotationToThree, tableToThree } from "./coordinates";

const PIXELS_PER_CM = 64;
const MAX_CANVAS = 4096;
const LINE_HEIGHT = 1.25; // times the font size
const FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const LIFT = 0.005; // just above the layer
// Depth bias, so the layer's surface never shows through the text at a distance.
const POLYGON_OFFSET_UNITS = -4;

// Draws a manifest label as text on a transparent plane lying on its layer.
export function buildLabel(label) {
  const lines = label.text.split("\n");
  const scale = Math.min(PIXELS_PER_CM, MAX_CANVAS / (label.fontSize * LINE_HEIGHT * lines.length));
  const fontPx = label.fontSize * scale;
  const font = `600 ${fontPx}px ${FONT_FAMILY}`;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
  canvas.width = Math.min(MAX_CANVAS, Math.ceil(textWidth + fontPx * 0.5));
  canvas.height = Math.ceil(fontPx * LINE_HEIGHT * lines.length);

  // Resizing the canvas resets its context.
  ctx.font = font;
  ctx.fillStyle = label.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, fontPx * LINE_HEIGHT * (i + 0.5), canvas.width);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(canvas.width / scale, canvas.height / scale),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetUnits: POLYGON_OFFSET_UNITS,
    })
  );
  mesh.rotation.order = "YXZ";
  mesh.rotation.set(-Math.PI / 2, tableRotationToThree(label.rotation), 0);
  const [x, y] = label.position;
  mesh.position.fromArray(tableToThree([x, label.layer.base + label.layer.thickness + LIFT, y]));
  return mesh;
}
