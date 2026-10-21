import { describe, expect, it } from "vitest";
import { normalizeManifest } from "../manifest/manifest";
import { initialState } from "../state/actions";
import { createTableStore, rowsBetween, withRows } from "../state/store";

const manifest = normalizeManifest({
  formatVersion: 1,
  id: "test",
  name: "Test",
  table: { size: [90, 60] },
  layers: [{ id: "pieces", thickness: 0.03 }],
  pieceTypes: { card: { kind: "card", size: [6, 9], face: "f.svg", back: "b.svg" } },
  pieces: [{ id: "a", type: "card", position: [10, 10] }, { id: "b", type: "card", position: [30, 10] }],
}, "https://example.com/m.json");

// The server's half of the protocol: saves a change only if it was made
// against the newest sequence. It holds messages until deliver() so a test
// can make two players act at once.
function fakeServer() {
  let state = initialState(manifest);
  const stores = [];
  const outbox = []; // [store, message]
  const server = {
    get state() { return state; },
    join(store, playerId) {
      stores.push(store);
      store.connect({
        act: (message) => {
          if (message.base !== state.sequence) {
            outbox.push([store, { type: "refused", actionId: message.actionId, sequence: state.sequence }]);
            return;
          }
          state = withRows(state, message.rows, state.sequence + 1);
          const change = { type: "change", sequence: state.sequence, actionId: message.actionId, action: message.tableAction, rows: message.rows };
          stores.forEach((each) => outbox.push([each, change]));
        },
        drag: (message) => stores.forEach((each) => each !== store && outbox.push([each, { type: "drag", ...message, actor: playerId }])),
        resync: () => outbox.push([store, { type: "snapshot", ...state }]),
      });
      store.receive({ type: "snapshot", ...state });
      return store;
    },
    // Hands every waiting message over, including any they cause.
    deliver() {
      while (outbox.length) {
        const [store, message] = outbox.shift();
        store.receive(message);
      }
    },
  };
  return server;
}

const player = (server, playerId) => server.join(createTableStore(manifest, null, { synced: true }), playerId);

describe("rows", () => {
  it("lists what changed, and what's gone", () => {
    const before = initialState(manifest);
    const after = { ...before, seating: "eight", players: { p1: { seatId: "south" } }, pieces: { a: { ...before.pieces.a, x: 5, drag: { x: 1, y: 1 } } } };
    expect(rowsBetween(before, after)).toEqual({
      pieces: { a: expect.not.objectContaining({ drag: expect.anything() }), b: null },
      players: { p1: { seatId: "south" } },
      seating: "eight",
    });
    expect(withRows(before, rowsBetween(before, after), 7)).toMatchObject({ sequence: 7, seating: "eight", pieces: { a: { x: 5, drag: null } } });
  });
});

describe("a synced store", () => {
  it("shows your action at once, and sends it", () => {
    const server = fakeServer();
    const sam = player(server);
    const alex = player(server);
    expect(sam.dispatch({ type: "grab", id: "a", playerId: "sam" }).ok).toBe(true);
    expect(sam.getState().pieces.a.heldBy).toBe("sam");
    expect(alex.getState().pieces.a.heldBy).toBeNull();
    server.deliver();
    expect(alex.getState().pieces.a.heldBy).toBe("sam");
    expect(server.state.sequence).toBe(1);
  });

  it("sends one action at a time, in order", () => {
    const server = fakeServer();
    const sam = player(server);
    sam.dispatch({ type: "grab", id: "a", playerId: "sam" });
    sam.dispatch({ type: "drag", id: "a", playerId: "sam", x: 40, y: 40 });
    sam.dispatch({ type: "drop", id: "a", playerId: "sam", x: 50, y: 40 });
    expect(server.state.sequence).toBe(1);
    server.deliver();
    expect(server.state.pieces.a).toMatchObject({ x: 50, y: 40, heldBy: null });
    expect(sam.getState().pieces.a).toMatchObject({ x: 50, heldBy: null });
  });

  it("keeps your drag when someone else's change arrives", () => {
    const server = fakeServer();
    const sam = player(server);
    const alex = player(server);
    sam.dispatch({ type: "grab", id: "a", playerId: "sam" });
    server.deliver();
    sam.dispatch({ type: "drag", id: "a", playerId: "sam", x: 40, y: 40 });
    alex.dispatch({ type: "flip", id: "b", playerId: "alex" });
    server.deliver();
    expect(sam.getState().pieces.a.drag).toEqual({ x: 40, y: 40 });
    expect(sam.getState().pieces.b.faceUp).toBe(false);
  });

  it("gives a contested grab to whoever the server heard first", () => {
    const server = fakeServer();
    const sam = player(server);
    const alex = player(server);
    sam.dispatch({ type: "grab", id: "a", playerId: "sam" });
    alex.dispatch({ type: "grab", id: "a", playerId: "alex" });
    expect(alex.getState().pieces.a.heldBy).toBe("alex");
    server.deliver();
    expect(server.state.pieces.a.heldBy).toBe("sam");
    expect(alex.getState().pieces.a.heldBy).toBe("sam");
    expect(sam.getState().pieces.a.heldBy).toBe("sam");
  });

  it("tells the loser who got there first", () => {
    const server = fakeServer();
    const sam = player(server, "sam");
    const alex = player(server, "alex");
    const lost = [];
    alex.onLost((each) => lost.push(each));
    sam.dispatch({ type: "grab", id: "a", playerId: "sam" });
    alex.dispatch({ type: "grab", id: "a", playerId: "alex" });
    server.deliver();
    expect(lost).toEqual([{ action: { type: "grab", id: "a", playerId: "alex" }, reason: "Someone else is holding that.", holder: "sam" }]);
  });

  it("retries a refused action that still works on the newer state", () => {
    const server = fakeServer();
    const sam = player(server);
    const alex = player(server);
    sam.dispatch({ type: "flip", id: "a", playerId: "sam" });
    alex.dispatch({ type: "flip", id: "b", playerId: "alex" });
    server.deliver();
    expect(server.state.sequence).toBe(2);
    for (const store of [sam, alex]) expect(store.getState().pieces).toMatchObject({ a: { faceUp: false }, b: { faceUp: false } });
  });

  it("starts over from a snapshot after missing a change", () => {
    const server = fakeServer();
    const sam = player(server);
    sam.receive({ type: "change", sequence: 5, rows: {}, action: null });
    server.deliver();
    expect(sam.getState().sequence).toBe(0);
    sam.dispatch({ type: "flip", id: "a", playerId: "sam" });
    server.deliver();
    expect(server.state.pieces.a.faceUp).toBe(false);
  });

  it("keeps an action made before connecting, and sends it once connected", () => {
    const server = fakeServer();
    const sam = createTableStore(manifest, null, { synced: true });
    sam.dispatch({ type: "grab", id: "a", playerId: "sam" });
    server.join(sam, "sam");
    server.deliver();
    expect(server.state.pieces.a.heldBy).toBe("sam");
    expect(sam.getState().pieces.a.heldBy).toBe("sam");
  });

  it("drops the action in flight when the connection drops, and goes on with the rest", () => {
    const server = fakeServer();
    const sam = player(server);
    sam.dispatch({ type: "grab", id: "a", playerId: "sam" });
    sam.disconnect();
    expect(sam.getState().pieces.a.heldBy).toBeNull();
  });

  it("tells listeners about others' actions, but not your own coming back", () => {
    const server = fakeServer();
    const sam = player(server);
    const alex = player(server);
    const heard = [];
    sam.subscribe((_state, action) => heard.push(action?.type ?? null));
    sam.dispatch({ type: "flip", id: "a", playerId: "sam" });
    alex.dispatch({ type: "flip", id: "b", playerId: "alex" });
    server.deliver();
    expect(heard).toEqual(["flip", null, "flip"]);
  });
});

describe("drags", () => {
  it("go out once the grab is confirmed, newest first", () => {
    const server = fakeServer();
    const sam = player(server, "sam");
    const alex = player(server, "alex");
    sam.dispatch({ type: "grab", id: "a", playerId: "sam" });
    sam.dispatch({ type: "drag", id: "a", playerId: "sam", x: 40, y: 40 });
    sam.dispatch({ type: "drag", id: "a", playerId: "sam", x: 45, y: 40 });
    server.deliver();
    expect(alex.getState().pieces.a.drag).toEqual({ x: 45, y: 40 });
    sam.dispatch({ type: "drag", id: "a", playerId: "sam", x: 50, y: 40 });
    server.deliver();
    expect(alex.getState().pieces.a.drag).toEqual({ x: 50, y: 40 });
  });

  it("show only on objects their sender holds, until the hold ends", () => {
    const server = fakeServer();
    const sam = player(server, "sam");
    const alex = player(server, "alex");
    alex.receive({ type: "drag", id: "a", x: 1, y: 1, actor: "sam" });
    expect(alex.getState().pieces.a.drag).toBeNull();
    sam.dispatch({ type: "grab", id: "a", playerId: "sam" });
    sam.dispatch({ type: "drag", id: "a", playerId: "sam", x: 40, y: 40 });
    server.deliver();
    alex.dispatch({ type: "flip", id: "b", playerId: "alex" });
    server.deliver();
    expect(alex.getState().pieces.a.drag).toEqual({ x: 40, y: 40 });
    sam.dispatch({ type: "release", id: "a", playerId: "sam" });
    server.deliver();
    expect(alex.getState().pieces.a).toMatchObject({ heldBy: null, drag: null });
  });
});
