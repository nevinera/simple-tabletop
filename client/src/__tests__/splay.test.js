import { describe, expect, it } from "vitest";
import { applyAction, initialState } from "../state/actions";
import { normalizeManifest } from "../manifest/manifest";
import { landing, outline } from "../state/footprint";
import { fanSpots, findObject, objectHeight } from "../state/objects";
import { createTableStore } from "../state/store";
import { PieceInteraction } from "../table/interaction";

const BASE = "https://example.com/m.json";
const card = (id, position) => ({ id, type: "card", ...(position && { position }) });
const raw = (overrides = {}) => ({
  formatVersion: 1,
  id: "test",
  name: "Test",
  table: { size: [120, 80] },
  layers: [{ id: "pieces", thickness: 0.03 }],
  pieceTypes: {
    card: { kind: "card", size: [6, 9], face: "f.svg", back: "b.svg" },
    big: { kind: "card", size: [8, 11], face: "f.svg", back: "b.svg" },
  },
  pieces: [
    card("a", [10, 10]),
    card("b", [30, 10]),
    { id: "huge", type: "big", position: [50, 10] },
    card("d1"), card("d2"), card("d3"),
    { id: "wall", kind: "tile", size: [4, 4], face: "w.svg", position: [72, 60] },
  ],
  containers: [{ id: "deck", kind: "deck", position: [60, 60], size: [6, 9], members: ["d1", "d2", "d3"] }],
  ...overrides,
});
const manifest = normalizeManifest(raw(), BASE);
const act = (state, action) => applyAction(manifest, state, { playerId: "me", ...action });
const move = (state, id, x, y) => act(act(state, { type: "grab", id }).state, { type: "drop", id, x, y });

describe("card piles", () => {
  it("makes a deck when a card drops on one like it", () => {
    let state = act(initialState(manifest), { type: "flip", id: "b" }).state;
    expect(landing(manifest, act(state, { type: "grab", id: "a" }).state, "a", 30, 10, 0, "me")).toEqual({ onto: "b" });
    state = move(state, "a", 30, 10).state;
    const [id] = Object.keys(state.containers).filter((key) => key.startsWith("#deck-"));
    expect(state.containers[id]).toMatchObject({ x: 30, y: 10, faceUp: false, members: ["a", "b"], splay: null });
    expect(findObject(manifest, state, id).def).toMatchObject({ kind: "deck", size: [6, 9], accepts: [{ type: "card" }] });
    expect(state.pieces.a).toMatchObject({ containerId: id, faceUp: false });
  });

  it("won't pile cards of a different type", () => {
    const state = act(initialState(manifest), { type: "grab", id: "a" }).state;
    expect(landing(manifest, state, "a", 50, 10, 0, "me")).toEqual({ blocked: ["huge"] });
  });
});

describe("splayed decks", () => {
  const splayed = (direction = "right", extra = {}) =>
    act(initialState(manifest), { type: "splay", id: "deck", direction, ...extra }).state;

  it("fans out from the bottom card, top card furthest along", () => {
    const state = splayed();
    expect(fanSpots(findObject(manifest, state, "deck"))).toEqual([{ x: 64, y: 60 }, { x: 62, y: 60 }, { x: 60, y: 60 }]);
    const turned = act(state, { type: "rotate", id: "deck", degrees: 90 }).state;
    const spots = fanSpots(findObject(manifest, turned, "deck"));
    expect(spots[0].x).toBeCloseTo(60);
    expect(spots[0].y).toBeCloseTo(56);
  });

  it("uses a player's spacing, then the module's, then 2cm", () => {
    expect(fanSpots(findObject(manifest, splayed("away", { distance: 5 }), "deck"))[0]).toEqual({ x: 60, y: 70 });
    const spaced = normalizeManifest(raw({ containers: [{ ...raw().containers[0], splay: "toward", splayDistance: 1 }] }), BASE);
    expect(fanSpots(findObject(spaced, initialState(spaced), "deck"))[0]).toEqual({ x: 60, y: 58 });
  });

  it("covers its whole fan, and lies flat", () => {
    const deck = findObject(manifest, splayed(), "deck");
    expect(outline(deck, 60, 60, 0)).toEqual(outline({ kind: "piece", def: { shape: "rect", size: [10, 9] } }, 62, 60, 0));
    expect(objectHeight(deck)).toBeCloseTo(0.09);
  });

  it("won't fan into something", () => {
    const result = act(initialState(manifest), { type: "splay", id: "deck", direction: "right", distance: 5 });
    expect(result).toMatchObject({ ok: false, blocked: true });
    expect(act(initialState(manifest), { type: "splay", id: "deck", direction: "sideways" }).ok).toBe(false);
  });

  it("splays a locked deck, and closes back up", () => {
    let state = act(initialState(manifest), { type: "lock", id: "deck" }).state;
    state = act(state, { type: "splay", id: "deck", direction: "left" }).state;
    expect(state.containers.deck.splay).toBe("left");
    expect(act(state, { type: "splay", id: "deck", direction: null }).state.containers.deck.splay).toBeNull();
  });

  it("lets you pull any card out, facing the deck's way", () => {
    let state = act(splayed(), { type: "rotate", id: "deck", degrees: 0 }).state;
    expect(act(initialState(manifest), { type: "grab", id: "d2" }).ok).toBe(false);
    state = move(state, "d2", 30, 40).state;
    expect(state.containers.deck.members).toEqual(["d1", "d3"]);
    expect(state.pieces.d2).toMatchObject({ containerId: null, x: 30, y: 40, faceUp: false, rotation: 0 });
  });

  it("draws its top card from where it lies", () => {
    const state = act(splayed(), { type: "draw", id: "deck" }).state;
    expect(state.pieces.d1).toMatchObject({ x: 64, y: 60, heldBy: "me" });
  });

  it("takes a card dropped anywhere on the fan, on top", () => {
    const state = move(splayed(), "a", 63.5, 60).state;
    expect(state.containers.deck.members).toEqual(["a", "d1", "d2", "d3"]);
  });
});

describe("splaying by hand", () => {
  it("wiggles when the fan is blocked, and offers splay in the menu", () => {
    const store = createTableStore(manifest);
    const wiggles = [];
    const interaction = new PieceInteraction({
      store, manifest, playerId: "me",
      pick: () => null, tablePoint: () => null, clampToTable: (p) => p,
      setCameraEnabled: () => {}, setCursor: () => {},
      onBlockedRotate: (id, degrees) => wiggles.push([id, degrees]),
    });
    interaction.splay("deck", { direction: "right", distance: 5 });
    expect(wiggles).toEqual([["deck", 1]]);
    interaction.splay("deck", { direction: "away", distance: 3 });
    expect(interaction.describe("deck")).toMatchObject({ splay: "away", splayDistance: 3 });
    expect(interaction.describe("d2")).toMatchObject({ inDeck: true });
  });
});
