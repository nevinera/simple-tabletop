import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { normalizeManifest } from "../manifest/manifest";
import { applyAction, initialState } from "../state/actions";

const BUILTINS = join(__dirname, "../../../public/builtins");

describe.each(readdirSync(BUILTINS))("built-in %s", (slug) => {
  const raw = JSON.parse(readFileSync(join(BUILTINS, slug, "manifest.json"), "utf8"));
  const manifest = normalizeManifest(raw, `https://example.com/builtins/${slug}/manifest.json`);

  it("loads, and sets up a table with nothing overlapping", () => {
    expect(manifest.id).toBe(slug);
    const state = initialState(manifest);
    // Picking up and putting back each loose piece where it sits works only
    // if nothing else is there.
    for (const [id, piece] of Object.entries(state.pieces)) {
      if (piece.containerId || piece.locked) continue;
      const grabbed = applyAction(manifest, state, { type: "grab", id, playerId: "me" });
      const dropped = applyAction(manifest, grabbed.state, { type: "drop", id, x: piece.x, y: piece.y, playerId: "me" });
      expect(dropped.reason, id).toBeUndefined();
    }
  });
});

describe("checkers", () => {
  const raw = JSON.parse(readFileSync(join(BUILTINS, "checkers", "manifest.json"), "utf8"));
  const manifest = normalizeManifest(raw, "https://example.com/builtins/checkers/manifest.json");

  it("sets twelve checkers a side on the dark squares, and crowns one by flipping it", () => {
    const state = initialState(manifest);
    const ids = Object.keys(state.pieces);
    expect(ids.filter((id) => id.startsWith("red-"))).toHaveLength(12);
    expect(ids.filter((id) => id.startsWith("black-"))).toHaveLength(12);
    const crowned = applyAction(manifest, state, { type: "flip", id: "red-1", playerId: "me" });
    expect(crowned.state.pieces["red-1"].faceUp).toBe(false);
    expect(manifest.pieces.find((piece) => piece.id === "red-1").back.url).toMatch(/red-king\.svg$/);
  });
});

describe("pachisi", () => {
  const raw = JSON.parse(readFileSync(join(BUILTINS, "pachisi", "manifest.json"), "utf8"));
  const manifest = normalizeManifest(raw, "https://example.com/builtins/pachisi/manifest.json");

  it("seats four colors with four pawns each, and puts two dice in a tray", () => {
    const state = initialState(manifest);
    for (const seat of ["red", "green", "yellow", "blue"]) {
      expect(Object.keys(state.pieces).filter((id) => id.startsWith(`${seat}-`)), seat).toHaveLength(4);
    }
    expect(state.containers.dice.members).toEqual(["die-1", "die-2"]);
    expect(manifest.pieces.find((piece) => piece.id === "die-1").die).toMatchObject({ name: "d6pips", pips: true });
  });
});

describe("cards", () => {
  const raw = JSON.parse(readFileSync(join(BUILTINS, "cards", "manifest.json"), "utf8"));
  const manifest = normalizeManifest(raw, "https://example.com/builtins/cards/manifest.json");
  const act = (state, action) => applyAction(manifest, state, { playerId: "me", ...action });

  it("starts with all 54 cards in the deck, face down, and an empty discard pile", () => {
    const state = initialState(manifest);
    expect(state.containers.deck).toMatchObject({ faceUp: false });
    expect(state.containers.deck.members).toHaveLength(54);
    expect(new Set(state.containers.deck.members).size).toBe(54);
    expect(state.containers.discard.members).toEqual([]);
  });

  it("hands out chips from the bank that stack together, whatever their value", () => {
    let state = act(initialState(manifest), { type: "draw", id: "bank-5" }).state;
    const five = Object.keys(state.pieces).find((id) => id.startsWith("bank-5#"));
    state = act(state, { type: "drop", id: five, x: 20, y: 20 }).state;
    state = act(state, { type: "draw", id: "bank-100" }).state;
    const hundred = Object.keys(state.pieces).find((id) => id.startsWith("bank-100#"));
    state = act(state, { type: "drop", id: hundred, x: 20, y: 20 }).state;
    const stack = Object.values(state.containers).find((container) => container.spec?.kind === "stack");
    expect(stack.members).toEqual([hundred, five]);
  });
});

describe("chess", () => {
  const raw = JSON.parse(readFileSync(join(BUILTINS, "chess", "manifest.json"), "utf8"));
  const manifest = normalizeManifest(raw, "https://example.com/builtins/chess/manifest.json");

  it("sets up sixteen pieces a side, kings on e, Black's turned to face Black", () => {
    const state = initialState(manifest);
    const side = (color) => Object.keys(state.pieces).filter((id) => id.startsWith(`${color}-`));
    expect(side("white")).toHaveLength(16);
    expect(side("black")).toHaveLength(16);
    const [x1] = [state.pieces["white-king-e"].x];
    expect(state.pieces["black-king-e"].x).toBe(x1);
    expect(state.pieces["white-queen-d"].x).toBeLessThan(x1);
    expect(state.pieces["black-pawn-a"].rotation).toBe(180);
    expect(state.pieces["white-pawn-a"].rotation).toBe(0);
  });
});

describe("global domination", () => {
  const raw = JSON.parse(readFileSync(join(BUILTINS, "global-domination", "manifest.json"), "utf8"));
  const manifest = normalizeManifest(raw, "https://example.com/builtins/global-domination/manifest.json");
  const act = (state, action) => applyAction(manifest, state, { playerId: "me", ...action });

  it("seats six, and deals from 42 territory cards and two wilds", () => {
    const state = initialState(manifest);
    expect(manifest.seats).toHaveLength(6);
    expect(state.containers.deck.members).toHaveLength(44);
    expect(manifest.snaps[0].points).toHaveLength(42);
  });

  it("piles armies of one color on the territory they're dropped near", () => {
    const [x, y] = manifest.snaps[0].points[0];
    let state = initialState(manifest);
    const placed = [];
    for (let i = 0; i < 2; i++) {
      state = act(state, { type: "draw", id: "red-armies" }).state;
      const id = Object.keys(state.pieces).find((piece) => piece.startsWith("red-armies#") && !placed.includes(piece));
      placed.push(id);
      state = act(state, { type: "drop", id, x: x + 1, y: y - 1 }).state;
    }
    const pile = Object.values(state.containers).find((container) => container.spec?.kind === "stack");
    expect(pile.members.sort()).toEqual(placed.sort());
    expect(pile).toMatchObject({ x, y });
  });
});

describe("snapping on boards", () => {
  const load = (slug) => normalizeManifest(JSON.parse(readFileSync(join(BUILTINS, slug, "manifest.json"), "utf8")),
    `https://example.com/builtins/${slug}/manifest.json`);
  const move = (manifest, id, x, y) => {
    let state = applyAction(manifest, initialState(manifest), { type: "grab", id, playerId: "me" }).state;
    state = applyAction(manifest, state, { type: "drop", id, x, y, playerId: "me" }).state;
    return state.pieces[id];
  };

  it("lands a chess piece in the middle of the square it's dropped on", () => {
    const chess = load("chess");
    // e4's middle is 4 squares right of a1's and 3 up.
    const [x, y] = [chess.snaps[0].points[0][0] + 4 * 5.5, chess.snaps[0].points[0][1] + 3 * 5.5];
    expect(move(chess, "white-pawn-e", x + 1.8, y - 2)).toMatchObject({ x, y });
  });

  it("lands a checker on the dark square it's dropped near", () => {
    const checkers = load("checkers");
    expect(move(checkers, "red-9", 27.5, 28)).toMatchObject({ x: 29.5, y: 29.5 });
  });

  it("lands a Go stone from the bowl on the point it's dropped near", () => {
    const go = load("go");
    let state = applyAction(go, initialState(go), { type: "draw", id: "black-bowl", playerId: "me" }).state;
    const stone = Object.keys(state.pieces).find((id) => id.startsWith("black-bowl#"));
    // The middle point, tengen, is the table's middle.
    state = applyAction(go, state, { type: "drop", id: stone, x: 36.8, y: 35.3, playerId: "me" }).state;
    expect(state.pieces[stone]).toMatchObject({ x: 36, y: 36 });
    expect(go.snaps[0].points).toHaveLength(361);
  });
});
