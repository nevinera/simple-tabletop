import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { buildPiece, applyCardState } from "../table/pieces";
import { showImages } from "../table/lazyImages";

const layer = { base: 0.3, thickness: 0.04 };
const card = { id: "card", shape: "rect", size: [6, 9], layer, thickness: 0.04, face: { url: "f.png" }, back: { url: "b.png" } };

function fakeTextures() {
  const loaded = [];
  return {
    loaded,
    get: vi.fn(async (image) => {
      loaded.push(image.url);
      return new THREE.Texture();
    }),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const [, , top, bottom] = [0, 1, 2, 3];

describe("lazy images", () => {
  it("loads nothing until the piece shows, then loads its images once", async () => {
    const textures = fakeTextures();
    const mesh = buildPiece(card);
    mesh.visible = false;
    showImages(mesh, textures);
    expect(textures.get).not.toHaveBeenCalled();

    mesh.visible = true;
    showImages(mesh, textures);
    showImages(mesh, textures);
    await flush();
    expect(textures.loaded.sort()).toEqual(["b.png", "f.png"]);
    expect(mesh.material[top].map).toBeInstanceOf(THREE.Texture);
    expect(mesh.material[top].color.getHex()).toBe(0xffffff);
    expect(mesh.userData.ghost.material[bottom].map).toBeInstanceOf(THREE.Texture);
  });

  it("shows a gray placeholder until then", () => {
    const mesh = buildPiece(card);
    expect(mesh.material[top].map).toBeNull();
    expect(mesh.material[top].color.getHex()).not.toBe(0xffffff);
  });

  it("loads a card's new state the next time it shows", async () => {
    const textures = fakeTextures();
    const states = [{ name: "Normal", face: card.face, back: card.back }, { name: "Up", face: { url: "up.png" }, back: card.back }];
    const def = { ...card, states };
    const mesh = buildPiece(def);
    showImages(mesh, textures);
    await flush();
    applyCardState(mesh, def, { stateIndex: 1 });
    showImages(mesh, textures);
    await flush();
    expect(textures.loaded).toContain("up.png");
  });
});
