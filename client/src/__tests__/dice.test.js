import { describe, expect, it } from "vitest";
import { applyAction, initialState } from "../state/actions";
import { normalizeManifest } from "../manifest/manifest";
import { hasRoom, scatter, traySpot } from "../state/trays";
import { createTableStore } from "../state/store";
import { PieceInteraction } from "../table/interaction";
import { visibleSide } from "../state/visibility";

const raw = (overrides = {}) => ({
  formatVersion: 1,
  id: "test",
  name: "Test",
  table: { size: [90, 60] },
  layers: [{ id: "pieces", thickness: 0.03 }],
  pieces: [
    { id: "red", shape: "die", die: "d6", size: [2], position: [10, 10], value: 2 },
    { id: "blue", shape: "die", die: "d20", size: [2] },
    { id: "green", shape: "die", die: "d10t", size: [2] },
    { id: "card", shape: "rect", size: [6, 9], face: "c.svg", position: [30, 30] },
  ],
  containers: [{ id: "tray", kind: "tray", position: [60, 30], size: [20, 14], members: ["blue", "green"] }],
  ...overrides,
});
const manifest = normalizeManifest(raw(), "https://example.com/m.json");
const act = (state, action) => applyAction(manifest, state, { playerId: "me", ...action });

describe("dice", () => {
  it("reads built-in and custom dice", () => {
    const red = manifest.pieces[0];
    expect(red).toMatchObject({ shape: "die", value: 2, die: { name: "d6", sides: 6 } });
    expect(manifest.pieces[2].die.labels).toEqual(["00", "10", "20", "30", "40", "50", "60", "70", "80", "90"]);
    const custom = normalizeManifest(raw({
      dieTypes: { fate: { sides: 6, faces: ["+.png", "+.png", "0.png", "0.png", "-.png", "-.png"] } },
      pieces: [{ id: "f", shape: "die", die: "fate", size: [2], position: [5, 5] }],
      containers: [],
    }), "https://example.com/m.json");
    expect(custom.pieces[0].die.images[0].url).toBe("https://example.com/+.png");
  });

  it("grows a d4 by half, so it doesn't look small next to other dice", () => {
    const d4 = normalizeManifest(raw({
      pieces: [{ id: "x", shape: "die", die: "d4", size: [2], position: [5, 5] }],
      containers: [],
    }), "https://example.com/m.json");
    expect(d4.pieces[0].size).toEqual([3, 3]);
  });

  it("magnifies to its die and value, in a tray or not", () => {
    const state = initialState(manifest);
    expect(visibleSide(manifest, state, "red")).toEqual({ die: manifest.pieces[0].die, value: 2 });
    expect(visibleSide(manifest, state, "blue")).toMatchObject({ die: { sides: 20 }, value: 0 });
  });

  it.each([
    ["an unknown die", { pieces: [{ id: "x", shape: "die", die: "d7", size: [2], position: [0, 0] }], containers: [] }, /unknown die/],
    ["a built-in name reused", { dieTypes: { d6: { sides: 6, faces: [] } } }, /built-in/],
    ["the wrong number of faces", { dieTypes: { odd: { sides: 6, faces: ["a.png"] } } }, /exactly 6/],
    ["an out-of-range value", { pieces: [{ id: "x", shape: "die", die: "d4", size: [2], position: [0, 0], value: 4 }], containers: [] }, /value/],
  ])("rejects %s", (_name, overrides, message) => {
    expect(() => normalizeManifest(raw(overrides), "https://example.com/m.json")).toThrow(message);
  });

  it("rolls a die in place, counting the roll", () => {
    const result = act(initialState(manifest), { type: "roll", id: "red", values: { red: 5 } });
    expect(result.state.pieces.red).toMatchObject({ value: 5, rolls: 1, x: 10, y: 10 });
    expect(act(initialState(manifest), { type: "roll", id: "red", values: { red: 6 } }).ok).toBe(false);
    expect(act(initialState(manifest), { type: "flip", id: "red" }).reason).toMatch(/roll/);
  });
});

describe("trays", () => {
  it("lays out its starting dice the same way every time, inside it and apart", () => {
    const a = initialState(manifest).containers.tray.spots;
    expect(initialState(manifest).containers.tray.spots).toEqual(a);
    const [blue, green] = [a.blue, a.green];
    expect(Math.hypot(blue[0] - green[0], blue[1] - green[1])).toBeGreaterThanOrEqual(2);
    for (const [x, y] of [blue, green]) {
      expect(Math.abs(x)).toBeLessThanOrEqual(9);
      expect(Math.abs(y)).toBeLessThanOrEqual(6);
    }
  });

  it("takes a die dropped in it, where it lands, but not a card", () => {
    const empty = normalizeManifest(raw({
      containers: [{ id: "tray", kind: "tray", position: [60, 30], size: [20, 14] }],
      pieces: raw().pieces.filter((piece) => piece.position),
    }), "https://example.com/m.json");
    const grabbed = applyAction(empty, initialState(empty), { type: "grab", id: "red", playerId: "me" }).state;
    const result = applyAction(empty, grabbed, { type: "drop", id: "red", playerId: "me", x: 52, y: 25 });
    expect(result.state.containers.tray.members).toContain("red");
    const [x, y] = traySpot(result.state, "red");
    expect(x).toBeCloseTo(52);
    expect(y).toBeCloseTo(25);

    const card = act(initialState(manifest), { type: "grab", id: "card" }).state;
    expect(act(card, { type: "drop", id: "card", x: 60, y: 30 })).toMatchObject({ ok: false, blocked: true });
  });

  it("lets anyone take a die out, and rolls one die in place", () => {
    let state = initialState(manifest);
    const before = state.containers.tray.spots.blue;
    state = act(state, { type: "roll", id: "blue", values: { blue: 19 } }).state;
    expect(state.containers.tray.spots.blue).toEqual(before);
    state = act(state, { type: "grab", id: "blue" }).state;
    state = act(state, { type: "drop", id: "blue", x: 20, y: 40 }).state;
    expect(state.pieces.blue).toMatchObject({ containerId: null, x: 20, y: 40, value: 19 });
    expect(state.containers.tray).toMatchObject({ members: ["green"], spots: { green: expect.any(Array) } });
  });

  it("rolls every die in a tray to new faces and spots", () => {
    const result = act(initialState(manifest), {
      type: "roll", id: "tray", values: { blue: 3, green: 7 }, spots: { blue: [1, 1], green: [-5, -3] },
    });
    expect(result.state.pieces.blue).toMatchObject({ value: 3, rolls: 1 });
    expect(result.state.containers.tray.spots).toEqual({ blue: [1, 1], green: [-5, -3] });
    expect(act(initialState(manifest), { type: "roll", id: "tray", values: { blue: 3 } }).ok).toBe(false);
  });

  it("fills at most an eighth of its area", () => {
    const tray = { size: [10, 10] };
    const die = { id: "d", size: [2] };
    // Each die covers about 3.14 of the 12.5 allowed.
    expect(hasRoom(tray, [die, die], die)).toBe(true);
    expect(hasRoom(tray, [die, die, die], die)).toBe(false);
    expect(scatter({ size: [3, 3] }, [die, { ...die, id: "e" }])).toBeNull();
  });
});

describe("rolling from the table", () => {
  const makeInteraction = (store, hits) => new PieceInteraction({
    store,
    manifest,
    playerId: "me",
    pick: (x, y) => Object.keys(hits).find((id) => hits[id][0] === x && hits[id][1] === y) || null,
    tablePoint: (x, y) => [x, y],
    clampToTable: (point) => point,
    setCameraEnabled: () => {},
    setCursor: () => {},
    schedule: () => 0,
    unschedule: () => {},
    random: () => 0.99,
  });
  const pointer = (x, y) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, pointerType: "mouse" });

  it("rolls the hovered die with X, and its whole tray only with Shift+X", () => {
    const store = createTableStore(manifest);
    const interaction = makeInteraction(store, { red: [10, 10], blue: [61, 31], tray: [60, 30] });
    interaction.pointerMove(pointer(10, 10));
    interaction.roll();
    expect(store.getState().pieces.red).toMatchObject({ value: 5, rolls: 1 });

    interaction.pointerMove(pointer(61, 31));
    interaction.roll();
    expect(store.getState().pieces.blue).toMatchObject({ value: 19, rolls: 1 });
    expect(store.getState().pieces.green.rolls).toBe(0);
    interaction.rollTray();
    expect(store.getState().pieces.green).toMatchObject({ value: 9, rolls: 1 });
  });

  it("leaves tray dice where they are when relocateOnTrayRoll is off", () => {
    const store = createTableStore(manifest);
    const interaction = makeInteraction(store, { tray: [60, 30] });
    const before = store.getState().containers.tray.spots;
    interaction.relocateOnTrayRoll = false;
    interaction.rollTray("tray");
    expect(store.getState().containers.tray.spots).toEqual(before);
    expect(store.getState().pieces.green.rolls).toBe(1);
    interaction.relocateOnTrayRoll = true;
    interaction.rollTray("tray");
    expect(store.getState().containers.tray.spots).not.toEqual(before);
  });

  it("takes a die out of a tray by dragging it", () => {
    const store = createTableStore(manifest);
    const interaction = makeInteraction(store, { blue: [61, 31] });
    interaction.pointerDown(pointer(61, 31));
    interaction.pointerMove(pointer(70, 31));
    interaction.pointerMove(pointer(30, 50));
    interaction.pointerUp(pointer(30, 50));
    expect(store.getState().pieces.blue).toMatchObject({ containerId: null, x: 30, y: 50 });
  });
});
