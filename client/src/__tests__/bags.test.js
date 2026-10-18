import { describe, expect, it } from "vitest";
import { applyAction, initialState } from "../state/actions";
import { normalizeManifest } from "../manifest/manifest";
import { landing } from "../state/footprint";
import { looseObjects, pieceDef } from "../state/objects";
import { visibleSide } from "../state/visibility";
import { createTableStore } from "../state/store";
import { PieceInteraction } from "../table/interaction";

const BASE = "https://example.com/m.json";
const raw = (overrides = {}) => ({
  formatVersion: 1,
  id: "test",
  name: "Test",
  table: { size: [90, 60] },
  layers: [{ id: "pieces", thickness: 0.03 }],
  pieceTypes: {
    chip: { shape: "circle", size: [2], face: "chip.svg" },
    heart: { shape: "circle", size: [2], face: "heart.svg" },
  },
  hands: true,
  pieces: [
    { id: "c1", type: "chip" },
    { id: "c2", type: "chip" },
    { id: "d6", shape: "die", die: "d6", size: [2] },
    { id: "loose", type: "chip", position: [30, 30] },
    { id: "lonely-heart", type: "heart", position: [40, 30] },
    { id: "card", shape: "rect", size: [6, 9], face: "c.svg", position: [50, 30] },
  ],
  containers: [
    { id: "bag", kind: "bag", position: [10, 10], size: [8, 8], text: "Chips", color: "#204080", image: "lid.svg",
      members: ["c1", "c2", "d6"] },
    { id: "hearts", kind: "bag", position: [70, 10], size: [8, 8], infinite: "heart" },
  ],
  ...overrides,
});
const manifest = normalizeManifest(raw(), BASE);
const act = (state, action) => applyAction(manifest, state, { playerId: "me", ...action });
const seated = () => act(initialState(manifest), { type: "join", seatId: manifest.seats[0].id }).state;

describe("bag manifests", () => {
  it("makes tokens thicker than cards by default", () => {
    const boards = normalizeManifest(raw({ layers: [{ id: "board", thickness: 0.4 }, { id: "pieces", thickness: 0.03 }] }), BASE);
    const thickness = (id) => boards.pieces.find((p) => p.id === id).thickness;
    expect(thickness("loose")).toBe(0.2);
    expect(thickness("card")).toBe(0.03);
    expect(normalizeManifest(raw({
      pieces: [...raw().pieces.filter((p) => p.id !== "loose"), { id: "loose", type: "chip", position: [30, 30], thickness: 0.1 }],
    }), BASE).pieces.find((p) => p.id === "loose").thickness).toBe(0.1);
  });

  it("reads a bag's look, and an infinite bag's template", () => {
    const [bag, hearts] = manifest.containers;
    expect(bag).toMatchObject({ kind: "bag", text: "Chips", color: "#204080", template: null, accepts: null });
    expect(bag.image.url).toBe("https://example.com/lid.svg");
    expect(hearts.template).toMatchObject({ shape: "circle", type: "heart" });
    expect(hearts.accepts).toEqual([{ type: "heart" }]);
  });

  it.each([
    ["no size", { id: "b", kind: "bag", position: [0, 0] }, /size/],
    ["long text", { id: "b", kind: "bag", position: [0, 0], size: [5, 5], text: "x".repeat(17) }, /16/],
    ["an unknown infinite type", { id: "b", kind: "bag", position: [0, 0], size: [5, 5], infinite: "nope" }, /unknown piece type/],
    ["members in an infinite bag", { id: "b", kind: "bag", position: [0, 0], size: [5, 5], infinite: "chip", members: ["loose"] }, /members/],
    ["a # in its id", { id: "b#1", kind: "bag", position: [0, 0], size: [5, 5] }, /#/],
  ])("rejects a bag with %s", (_name, container, message) => {
    const containers = [raw().containers[0], container];
    expect(() => normalizeManifest(raw({ containers }), BASE)).toThrow(message);
  });
});

describe("bags", () => {
  it("hands out the member the draw picks, keeping its facing", () => {
    const state = seated();
    expect(act(state, { type: "draw", id: "bag" }).ok).toBe(false);
    const { state: next } = act(state, { type: "draw", id: "bag", pick: "c2" });
    expect(next.containers.bag.members).toEqual(["c1", "d6"]);
    expect(next.pieces.c2).toMatchObject({ containerId: null, x: 10, y: 10, heldBy: "me", faceUp: true });
  });

  it("takes anything dropped on it, dice included, but no containers", () => {
    let state = seated();
    state = act(state, { type: "grab", id: "loose" }).state;
    expect(landing(manifest, state, "loose", 10, 10, 0, "me")).toEqual({ into: "bag" });
    state = act(state, { type: "drop", id: "loose", x: 10, y: 10 }).state;
    expect(state.containers.bag.members).toEqual(["c1", "c2", "d6", "loose"]);
    expect(state.pieces.loose).toMatchObject({ containerId: "bag", x: null });
  });

  it("can't send a die into a hand", () => {
    const result = act(seated(), { type: "draw", id: "bag", pick: "d6", toHand: true });
    expect(result.reason).toMatch(/hand/);
    expect(act(seated(), { type: "draw", id: "bag", pick: "c1", toHand: true }).state.pieces.c1.containerId).toMatch(/^hand-/);
  });

  it("doesn't shuffle", () => {
    expect(act(seated(), { type: "shuffle", id: "bag", order: ["d6", "c2", "c1"] }).ok).toBe(false);
  });
});

describe("infinite bags", () => {
  it("makes a new piece on every draw", () => {
    let state = seated();
    state = act(state, { type: "draw", id: "hearts" }).state;
    expect(state.pieces["hearts#1"]).toMatchObject({ x: 70, y: 10, heldBy: "me", containerId: null });
    expect(pieceDef(manifest, "hearts#1")).toMatchObject({ id: "hearts#1", type: "heart" });
    state = act(state, { type: "drop", id: "hearts#1", x: 70, y: 30 }).state;
    state = act(state, { type: "draw", id: "hearts", toHand: true }).state;
    expect(state.pieces["hearts#2"].containerId).toMatch(/^hand-/);
    expect(state.containers.hearts).toMatchObject({ spawned: 2, members: [] });
    expect(looseObjects(manifest, state).map((o) => o.id)).toContain("hearts#1");
  });

  it("takes back only its own kind, which stops being a piece", () => {
    let state = seated();
    state = act(state, { type: "grab", id: "lonely-heart" }).state;
    state = act(state, { type: "drop", id: "lonely-heart", x: 70, y: 10 }).state;
    expect(state.pieces["lonely-heart"]).toBeUndefined();
    state = act(state, { type: "grab", id: "loose" }).state;
    expect(landing(manifest, state, "loose", 70, 10, 0, "me")).toEqual({ blocked: ["hearts"] });
  });
});

describe("bag contents", () => {
  it("lists distinct things, most first, and an infinite bag's one kind", () => {
    let state = seated();
    state = act(state, { type: "grab", id: "loose" }).state;
    state = act(state, { type: "drop", id: "loose", x: 10, y: 10 }).state;
    const side = visibleSide(manifest, state, "bag");
    expect(side.title).toBe("Chips");
    expect(side.contents.map(({ name, count }) => [name, count])).toEqual([["chip", 3], ["d6", 1]]);
    expect(visibleSide(manifest, state, "hearts").contents).toEqual([expect.objectContaining({ name: "heart", count: null })]);
  });
});

describe("drawing from bags by hand", () => {
  const makeInteraction = (store) => new PieceInteraction({
    store,
    manifest,
    playerId: "me",
    pick: () => "bag",
    tablePoint: (x, y) => [x, y],
    clampToTable: (point) => point,
    setCameraEnabled: () => {},
    setCursor: () => {},
    schedule: () => 0,
    unschedule: () => {},
    random: () => 0.5,
  });

  it("draws a random member, or a new piece from an infinite bag", () => {
    const store = createTableStore(manifest);
    store.dispatch({ type: "join", playerId: "me", seatId: manifest.seats[0].id });
    const interaction = makeInteraction(store);
    expect(interaction.draw("bag")).toBe("c2");
    expect(interaction.draw("hearts")).toBe("hearts#1");
    expect(store.getState().pieces.c2.heldBy).toBeNull();
    expect(store.getState().pieces["hearts#1"].heldBy).toBe("me");
    expect(interaction.describe("hearts")).toMatchObject({ kind: "bag", infinite: true, count: null });
  });
});
