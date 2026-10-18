import * as THREE from "three";

const TILE_PIXELS = 256;
export const FELT_TILE_CM = 20;

// A tileable noise texture in the given color, so a plain table color reads
// as felt instead of flat plastic.
export function feltTexture(color, random = Math.random) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TILE_PIXELS;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TILE_PIXELS, TILE_PIXELS);

  const pixels = ctx.getImageData(0, 0, TILE_PIXELS, TILE_PIXELS);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const shift = (random() - 0.5) * 24;
    pixels.data[i] += shift;
    pixels.data[i + 1] += shift;
    pixels.data[i + 2] += shift;
  }
  ctx.putImageData(pixels, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
