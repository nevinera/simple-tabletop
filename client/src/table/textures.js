import * as THREE from "three";

// Loads each image URL once and hands out textures for it, cropped to a grid
// cell for sheet images (see normalizeImage in manifest.js).
export class TextureCache {
  constructor(anisotropy) {
    this.anisotropy = anisotropy;
    this.loader = new THREE.TextureLoader();
    this.loader.setCrossOrigin("anonymous");
    this.loading = new Map();
    this.textures = [];
  }

  async get(image) {
    const base = await this.#load(image.url);
    if (image.index == null) return base;

    const texture = base.clone();
    const column = image.index % image.columns;
    const row = Math.floor(image.index / image.columns);
    texture.repeat.set(1 / image.columns, 1 / image.rows);
    // Texture v runs bottom to top; sheet rows run top to bottom.
    texture.offset.set(column / image.columns, 1 - (row + 1) / image.rows);
    this.textures.push(texture);
    return texture;
  }

  dispose() {
    this.textures.forEach((texture) => texture.dispose());
  }

  #load(url) {
    if (!this.loading.has(url)) {
      this.loading.set(url, this.loader.loadAsync(url).then((texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = this.anisotropy;
        this.textures.push(texture);
        return texture;
      }));
    }
    return this.loading.get(url);
  }
}
