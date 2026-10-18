import { beforeEach, describe, expect, it, vi } from "vitest";
import { DRAG_THRESHOLD_PX, LONG_PRESS_MS, PieceInteraction } from "../table/interaction";
import { createTableStore } from "../state/store";
import { normalizeManifest } from "../manifest/manifest";

const manifest = normalizeManifest({
  formatVersion: 1,
  id: "test",
  name: "Test",
  table: { size: [90, 90] },
  layers: [{ id: "board", thickness: 0.3 }, { id: "pieces", thickness: 0.03 }],
  seats: [{ id: "south", name: "South" }],
  pieceTypes: { card: { shape: "rect", size: [6.3, 8.8], back: "back.svg" } },
  pieces: [
    { id: "mat", shape: "circle", size: [40], layer: "board", face: "mat.svg", position: [45, 45], fixed: true },
    { id: "AS", type: "card", face: "AS.svg", position: [10, 10] },
    { id: "AH", type: "card", face: "AH.svg", position: [30, 30] },
  ],
}, "https://example.com/manifest.json");

// Screen pixels map straight to table units, and pieces are hit at their
// table position, so tests can click on things by their coordinates.
const HITS = { AS: [10, 10], AH: [30, 30], mat: [45, 45] };

let store;
let interaction;
let camera;
let timers;

beforeEach(() => {
  store = createTableStore(manifest);
  camera = { enabled: true };
  timers = [];
  interaction = new PieceInteraction({
    store,
    manifest,
    playerId: "me",
    pick: (x, y) => Object.keys(HITS).find((id) => HITS[id][0] === x && HITS[id][1] === y) || null,
    tablePoint: (x, y) => [x, y],
    clampToTable: ([x, y]) => [Math.min(90, Math.max(0, x)), Math.min(90, Math.max(0, y))],
    setCameraEnabled: (enabled) => { camera.enabled = enabled; },
    setCursor: () => {},
    schedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    unschedule: (id) => { if (id) timers[id - 1] = null; },
  });
});

const pointer = (x, y, extra = {}) => ({
  clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, pointerType: "mouse", ...extra,
});
const piece = (id) => store.getState().pieces[id];

function click(x, y, extra) {
  interaction.pointerDown(pointer(x, y, extra));
  interaction.pointerUp(pointer(x, y, extra));
}

function drag(from, to, extra) {
  interaction.pointerDown(pointer(...from, extra));
  interaction.pointerMove(pointer(from[0] + DRAG_THRESHOLD_PX, from[1], extra));
  interaction.pointerMove(pointer(...to, extra));
  interaction.pointerUp(pointer(...to, extra));
}

describe("PieceInteraction", () => {
  it("selects a piece on click", () => {
    click(10, 10);
    expect(piece("AS").heldBy).toBe("me");
    expect(interaction.selectedId()).toBe("AS");
  });

  it("drags a piece by where it was caught, and drops it on release", () => {
    interaction.pointerDown(pointer(10, 10));
    expect(camera.enabled).toBe(false);
    interaction.pointerMove(pointer(10 + DRAG_THRESHOLD_PX, 10));
    interaction.pointerMove(pointer(50, 60));
    expect(piece("AS")).toMatchObject({ heldBy: "me", drag: { x: 50, y: 60 } });
    interaction.pointerUp(pointer(50, 60));
    expect(piece("AS")).toMatchObject({ x: 50, y: 60, heldBy: null, drag: null });
    expect(camera.enabled).toBe(true);
  });

  it("keeps the table edge in bounds while dragging", () => {
    drag([10, 10], [-40, 200]);
    expect(piece("AS")).toMatchObject({ x: 0, y: 90 });
  });

  it("ignores small wobbles during a click", () => {
    interaction.pointerDown(pointer(10, 10));
    interaction.pointerMove(pointer(11, 11));
    interaction.pointerUp(pointer(10, 10));
    expect(piece("AS")).toMatchObject({ x: 10, y: 10, heldBy: "me", drag: null });
  });

  it("places the selected piece where you click open table", () => {
    click(10, 10);
    click(70, 20);
    expect(piece("AS")).toMatchObject({ x: 70, y: 20, heldBy: null });
  });

  it("sets the selected piece down in place when you click it again", () => {
    click(10, 10);
    click(10, 10);
    expect(piece("AS")).toMatchObject({ x: 10, y: 10, heldBy: null });
  });

  it("puts the first piece back when you select another", () => {
    click(10, 10);
    click(30, 30);
    expect(piece("AS").heldBy).toBeNull();
    expect(piece("AH").heldBy).toBe("me");
  });

  it("leaves a camera drag on open table alone", () => {
    click(10, 10);
    drag([70, 20], [80, 30]);
    expect(piece("AS")).toMatchObject({ x: 10, y: 10, heldBy: "me" });
  });

  it("leaves fixed pieces to the camera", () => {
    interaction.pointerDown(pointer(45, 45));
    expect(camera.enabled).toBe(true);
    interaction.pointerUp(pointer(45, 45));
    expect(piece("mat").heldBy).toBeNull();
  });

  it("won't take a piece someone else holds", () => {
    store.dispatch({ type: "grab", pieceId: "AS", playerId: "them" });
    drag([10, 10], [50, 50]);
    expect(piece("AS")).toMatchObject({ x: 10, y: 10, heldBy: "them" });
  });

  it("ignores right-drags, which pan", () => {
    interaction.pointerDown(pointer(10, 10, { button: 2 }));
    expect(camera.enabled).toBe(true);
    expect(interaction.gesture).toBeNull();
  });

  describe("on touch", () => {
    const touch = { pointerType: "touch" };

    it("places the selected piece with a tap and hold on open table", () => {
      click(10, 10, touch);
      interaction.pointerDown(pointer(70, 20, touch));
      expect(timers.at(-1).ms).toBe(LONG_PRESS_MS);
      timers.at(-1).fn();
      expect(piece("AS")).toMatchObject({ x: 70, y: 20, heldBy: null });
      interaction.pointerUp(pointer(70, 20, touch));
      expect(piece("AS")).toMatchObject({ x: 70, y: 20, heldBy: null });
    });

    it("cancels with a plain tap on open table", () => {
      click(10, 10, touch);
      click(70, 20, touch);
      expect(piece("AS")).toMatchObject({ x: 10, y: 10, heldBy: null });
    });

    it("doesn't place when the hold turns into a camera drag", () => {
      click(10, 10, touch);
      drag([70, 20], [80, 30], touch);
      expect(timers.filter(Boolean)).toHaveLength(0);
      expect(piece("AS")).toMatchObject({ x: 10, y: 10, heldBy: "me" });
    });
  });

  it("puts a dragged piece back if the browser cancels the pointer", () => {
    interaction.pointerDown(pointer(10, 10));
    interaction.pointerMove(pointer(50, 50));
    interaction.pointerCancel(pointer(50, 50));
    expect(piece("AS")).toMatchObject({ x: 10, y: 10, heldBy: null, drag: null });
    expect(camera.enabled).toBe(true);
  });

  it("cancels the selection on request", () => {
    click(10, 10);
    interaction.cancelSelection();
    expect(piece("AS").heldBy).toBeNull();
  });

  it("never calls timer functions as methods, which browsers reject", () => {
    // Like the browser's clearTimeout: throws when called with a `this`.
    function strict(fn) {
      return function (...args) {
        if (this !== undefined) throw new TypeError("Illegal invocation");
        return fn(...args);
      };
    }
    const real = new PieceInteraction({
      store,
      manifest,
      playerId: "me",
      pick: interaction.pick,
      tablePoint: interaction.tablePoint,
      clampToTable: interaction.clampToTable,
      setCameraEnabled: () => {},
      setCursor: () => {},
      schedule: strict(() => 1),
      unschedule: strict(() => {}),
    });
    real.pointerDown(pointer(10, 10));
    real.pointerMove(pointer(50, 50));
    real.pointerUp(pointer(50, 50));
    expect(piece("AS")).toMatchObject({ x: 50, y: 50, heldBy: null });
  });

  it("shows a grab cursor over movable pieces", () => {
    const setCursor = vi.fn();
    interaction.setCursor = setCursor;
    interaction.pointerMove(pointer(10, 10));
    expect(setCursor).toHaveBeenLastCalledWith("grab");
    interaction.pointerMove(pointer(45, 45));
    expect(setCursor).toHaveBeenLastCalledWith("");
  });
});
