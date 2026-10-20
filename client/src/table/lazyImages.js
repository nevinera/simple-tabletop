// A piece's images load the first time it shows on the table, not when its
// mesh is built, so a module with hundreds of pieces in bags and decks opens
// quickly and only spends GPU memory on what players can see.
//
// A builder marks each material that shows an image with lazyMaterial(),
// keyed by which image it shows ("face", "back", or a die face's index), then
// calls deferImages() on the object. The scene calls showImages() for every
// piece after placing it, and that loads the images once the object is
// visible. setImages() swaps in new ones, like a card's other state, which
// load the next time it shows.

const PLACEHOLDER = 0x9a9a9a;
const WHITE = 0xffffff;

// tint: whether the material starts gray and turns white once its image
// loads. Dice tint their faces themselves, so they don't.
export function lazyMaterial(material, key, { tint = true } = {}) {
  material.userData.lazyImage = key;
  material.userData.lazyTint = tint;
  if (tint) material.color.set(PLACEHOLDER);
  return material;
}

// images maps each key to a manifest image. others are objects outside root
// whose materials show the same images, like a ghost.
export function deferImages(root, images, ...others) {
  const materials = [];
  for (const object of [root, ...others]) {
    object.traverse((node) => {
      for (const material of [node.material].flat()) {
        if (material?.userData.lazyImage !== undefined) materials.push(material);
      }
    });
  }
  root.userData.lazy = { images, loaded: null, materials };
}

export function setImages(root, images) {
  const lazy = root.userData.lazy;
  if (lazy) lazy.images = images;
}

// Loads an object's images if it's visible and they aren't loaded yet.
export function showImages(root, textures) {
  const lazy = root.userData.lazy;
  if (!lazy || !root.visible || lazy.loaded === lazy.images) return;
  const images = lazy.images;
  lazy.loaded = images;
  const byKey = new Map();
  for (const material of lazy.materials) {
    const key = material.userData.lazyImage;
    byKey.set(key, [...(byKey.get(key) || []), material]);
  }
  for (const [key, materials] of byKey) {
    if (!images[key]) continue;
    textures.get(images[key]).then((texture) => {
      if (lazy.images !== images) return;
      for (const material of materials) {
        material.map = texture;
        if (material.userData.lazyTint) material.color.set(WHITE);
        material.needsUpdate = true;
      }
    });
  }
}
