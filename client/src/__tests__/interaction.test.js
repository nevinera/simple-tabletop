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
  seats: [{ id: "south", name: "South", side: "south" }],
  pieceTypes: { card: { kind: "card", size: [6.3, 8.8], back: "back.svg" } },
  pieces: [
    { id: "mat", kind: "board", shape: "circle", size: [40], layer: "board", face: "mat.svg", position: [45, 45], fixed: true },
    { id: "AS", type: "card", face: "AS.svg", position: [10, 10] },
    { id: "AH", type: "card", face: "AH.svg", position: [30, 30] },
    { id: "KS", type: "card", face: "KS.svg" },
    { id: "QS", type: "card", face: "QS.svg" },
    { id: "pawn", kind: "pawn", size: [4], position: [30, 50] },
  ],
  containers: [{ id: "deck", kind: "deck", position: [60, 60], size: [6.3, 8.8], members: ["KS", "QS"] }],
}, "https://example.com/manifest.json");

// Screen pixels map straight to table units, and pieces are hit at their
// table position, so tests can click on things by their coordinates.
const HITS = { AS: [10, 10], AH: [30, 30], mat: [45, 45], deck: [60, 60] };

let store;
let interaction;
let camera;
let timers;
let menus;
let wiggles;

beforeEach(() => {
  store = createTableStore(manifest);
  camera = { enabled: true };
  timers = [];
  menus = [];
  wiggles = [];
  interaction = new PieceInteraction({
    store,
    manifest,
    playerId: "me",
    pick: (x, y) => Object.keys(HITS).find((id) => HITS[id][0] === x && HITS[id][1] === y) || null,
    tablePoint: (x, y) => [x, y],
    clampToTable: ([x, y]) => [Math.min(90, Math.max(0, x)), Math.min(90, Math.max(0, y))],
    setCameraEnabled: (enabled) => { camera.enabled = enabled; },
    setCursor: () => {},
    onContextMenu: (menu) => menus.push(menu),
    onBlockedRotate: (objectId, degrees) => wiggles.push([objectId, degrees]),
    schedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    unschedule: (id) => { if (id) timers[id - 1] = null; },
    random: () => 0,
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

  it("keeps holding a piece dropped onto something it can't rest on, until you place it somewhere open", () => {
    drag([10, 10], [31, 51]);
    expect(piece("AS")).toMatchObject({ x: 10, y: 10, heldBy: "me", drag: { x: 31, y: 51 } });
    click(70, 20);
    expect(piece("AS")).toMatchObject({ x: 70, y: 20, heldBy: null });
  });

  it("drags a floating piece from where you catch it", () => {
    drag([10, 10], [31, 51]); // blocked by the pawn, so it floats there
    HITS.AS = [31, 51];
    try {
      drag([31, 51], [75, 75]);
    } finally {
      HITS.AS = [10, 10];
    }
    expect(piece("AS")).toMatchObject({ x: 75, y: 75, heldBy: null });
  });

  it("reports a rotation blocked by a neighbor", () => {
    drag([10, 10], [24.5, 50]); // just left of the pawn, which spans x 28 to 32
    interaction.rotate(90, "AS");
    expect(piece("AS").rotation).toBe(0);
    expect(wiggles).toEqual([["AS", 90]]);
  });

  it("rests a piece on another card", () => {
    drag([10, 10], [25, 31]);
    expect(piece("AS")).toMatchObject({ x: 25, y: 31, z: 0.03, heldBy: null });
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
    store.dispatch({ type: "grab", id: "AS", playerId: "them" });
    drag([10, 10], [50, 50]);
    expect(piece("AS")).toMatchObject({ x: 10, y: 10, heldBy: "them" });
  });

  it("leaves right-drags to the camera, which pans", () => {
    drag([10, 10], [50, 50], { button: 2 });
    expect(camera.enabled).toBe(true);
    expect(menus).toEqual([]);
    expect(piece("AS")).toMatchObject({ x: 10, y: 10, heldBy: null });
  });

  it("opens a piece's context menu on right-click", () => {
    click(10, 10, { button: 2 });
    expect(menus).toEqual([{ objectId: "AS", clientX: 10, clientY: 10, pointerType: "mouse" }]);
    expect(piece("AS").heldBy).toBeNull();
  });

  it("opens a menu for locked pieces, so they can be unlocked, but not for open table", () => {
    click(45, 45, { button: 2 });
    click(70, 70, { button: 2 });
    expect(menus.map((menu) => menu.objectId)).toEqual(["mat"]);
    expect(interaction.describe("mat")).toMatchObject({ kind: "piece", locked: true });
  });

  describe("flip and rotate", () => {
    it("act on the selected piece", () => {
      click(10, 10);
      interaction.flip();
      interaction.rotate(-45);
      expect(piece("AS")).toMatchObject({ faceUp: false, rotation: 315, heldBy: "me" });
    });

    it("act on the hovered piece when nothing is selected", () => {
      interaction.pointerMove(pointer(30, 30));
      interaction.flip();
      interaction.rotate(22.5);
      expect(piece("AH")).toMatchObject({ faceUp: false, rotation: 22.5, heldBy: null });
    });

    it("prefer the selected piece over the hovered one", () => {
      click(10, 10);
      interaction.pointerMove(pointer(30, 30));
      interaction.flip();
      expect(piece("AS").faceUp).toBe(false);
      expect(piece("AH").faceUp).toBe(true);
    });

    it("do nothing once the pointer leaves the table", () => {
      interaction.pointerMove(pointer(30, 30));
      interaction.pointerLeave();
      interaction.flip();
      expect(piece("AH").faceUp).toBe(true);
    });

    it("leave fixed pieces alone", () => {
      interaction.pointerMove(pointer(45, 45));
      interaction.flip();
      expect(piece("mat").faceUp).toBe(true);
    });
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

    it("opens a piece's context menu with a tap and hold, without selecting it", () => {
      interaction.pointerDown(pointer(10, 10, touch));
      timers.at(-1).fn();
      interaction.pointerMove(pointer(40, 40, touch));
      interaction.pointerUp(pointer(40, 40, touch));
      expect(menus).toEqual([{ objectId: "AS", clientX: 10, clientY: 10, pointerType: "touch" }]);
      expect(piece("AS")).toMatchObject({ x: 10, y: 10, heldBy: null, drag: null });
      expect(camera.enabled).toBe(true);
    });

    it("drags instead of opening a menu when the finger moves first", () => {
      drag([10, 10], [40, 40], touch);
      expect(timers.filter(Boolean)).toHaveLength(0);
      expect(menus).toEqual([]);
      expect(piece("AS")).toMatchObject({ x: 40, y: 40 });
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

  describe("decks", () => {
    const deck = () => store.getState().containers.deck;
    const hover = (x, y) => interaction.pointerMove(pointer(x, y));

    it("moves when you drag it", () => {
      drag([60, 60], [75, 75]);
      expect(deck()).toMatchObject({ x: 75, y: 75, members: ["KS", "QS"] });
    });

    it("deals its top card when you drag it while it's locked", () => {
      interaction.lock("deck");
      drag([60, 60], [75, 75]);
      expect(deck()).toMatchObject({ x: 60, y: 60, members: ["QS"] });
      expect(piece("KS")).toMatchObject({ x: 75, y: 75, heldBy: null });
    });

    it("draws the hovered deck's top card into your grip, for you to place", () => {
      hover(60, 60);
      interaction.draw();
      expect(piece("KS")).toMatchObject({ x: 60, y: 60, heldBy: "me" });
      click(75, 20);
      expect(piece("KS")).toMatchObject({ x: 75, y: 20, heldBy: null });
    });

    it("takes the selected card when you click it", () => {
      interaction.lock("deck");
      click(10, 10);
      click(60, 60);
      expect(deck().members).toEqual(["AS", "KS", "QS"]);
    });

    it("shuffles", () => {
      interaction.shuffle("deck");
      expect(deck().members).toEqual(["QS", "KS"]);
    });

    it("can be made from a card", () => {
      interaction.makeDeck("AH");
      const [id] = Object.keys(store.getState().containers).filter((key) => key !== "deck");
      expect(id).toMatch(/^deck-/);
      expect(interaction.describe(id)).toMatchObject({ kind: "deck", locked: false, count: 1, canMakeDeck: false, inHand: false });
    });
  });

  it("locks and unlocks the hovered piece", () => {
    interaction.pointerMove(pointer(10, 10));
    interaction.lock();
    expect(piece("AS").locked).toBe(true);
    drag([10, 10], [50, 50]);
    expect(piece("AS")).toMatchObject({ x: 10, y: 10 });
    interaction.lock();
    expect(piece("AS").locked).toBe(false);
  });
});

describe("losing a race", () => {
  it("ends the drag, says who has it, and leaves the camera off until you let go", () => {
    const races = [];
    interaction.onLostRace = (race) => races.push(race);
    interaction.pointerDown(pointer(10, 10));
    interaction.pointerMove(pointer(20, 20));
    interaction.lost({ action: { type: "grab", id: "AS", playerId: "me" }, holder: "sam" });
    expect(races).toEqual([{ id: "AS", holder: "sam", clientX: 20, clientY: 20 }]);
    store.dispatch({ type: "release", id: "AS", playerId: "me" }); // what the server's version would show
    interaction.pointerMove(pointer(40, 40));
    expect(piece("AS").drag).toBeNull();
    expect(camera.enabled).toBe(false);
    interaction.pointerUp(pointer(40, 40));
    expect(piece("AS")).toMatchObject({ x: 10, y: 10, heldBy: null });
    expect(camera.enabled).toBe(true);
  });

  it("wiggles a turn or flip that no longer applies", () => {
    interaction.lost({ action: { type: "flip", id: "AH", playerId: "me" }, holder: "sam" });
    expect(wiggles).toEqual([["AH", 1]]);
  });

  it("shows what others hold as off limits, with who has it", () => {
    const cursors = [];
    interaction.setCursor = (cursor) => cursors.push(cursor);
    interaction.nameOf = (id) => ({ sam: "Sam" })[id];
    store.dispatch({ type: "grab", id: "AH", playerId: "sam" });
    interaction.pointerMove(pointer(30, 30));
    expect(cursors.at(-1)).toBe("not-allowed");
    expect(interaction.holderName("AH")).toBe("Sam");
    expect(interaction.holderName("AS")).toBeNull();
    interaction.pointerDown(pointer(30, 30, { button: 2 }));
    interaction.pointerUp(pointer(30, 30, { button: 2 }));
    expect(menus.map((menu) => menu.objectId)).toEqual(["AH"]);
  });
});
