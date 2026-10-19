import * as THREE from "three";

const FONT = "600 40px system-ui, -apple-system, 'Segoe UI', sans-serif";
const PADDING = 14; // px around the text
const HEIGHT = 0.035; // roughly the share of the screen's height, at any distance
const LIFT = 1.5; // cm above the object it names

// A pill with a player's name, in their seat color, floating over something
// they hold. It stays the same size on screen however far away it is.
export function buildNameTag(name, color) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = FONT;
  canvas.width = Math.ceil(ctx.measureText(name).width + PADDING * 2);
  canvas.height = 40 + PADDING * 2;
  // Resizing the canvas resets its context.
  ctx.font = FONT;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, canvas.height / 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: false }));
  tag.center.set(0.5, 0);
  tag.scale.set((HEIGHT * canvas.width) / canvas.height, HEIGHT, 1);
  tag.renderOrder = 10;
  tag.userData.key = `${name}\n${color}`;
  return tag;
}

// Keeps a tag over the object it names.
export function placeNameTag(tag, object3d) {
  tag.position.copy(object3d.position);
  tag.position.y += LIFT;
}

export function disposeNameTag(tag) {
  tag.material.map.dispose();
  tag.material.dispose();
}
