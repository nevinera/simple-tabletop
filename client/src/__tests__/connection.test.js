import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectGame } from "../server/sync";

const cable = vi.hoisted(() => ({ performed: [], callbacks: null, received: null, disconnected: false }));
vi.mock("@rails/actioncable", () => ({
  createConsumer: () => ({
    subscriptions: {
      create: (_params, callbacks) => {
        cable.callbacks = callbacks;
        cable.received = callbacks.received;
        return { perform: (action, data) => cable.performed.push([action, data]) };
      },
    },
    disconnect: () => { cable.disconnected = true; },
  }),
}));

const fakeStore = () => ({ connect: vi.fn(), disconnect: vi.fn(), receive: vi.fn() });

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(cable, { performed: [], callbacks: null, received: null, disconnected: false });
});
afterEach(() => vi.useRealTimers());

describe("connectGame", () => {
  it("sends about 20 drags a second, always the newest", () => {
    const store = fakeStore();
    connectGame("abc", store);
    cable.callbacks.connected();
    const { drag } = store.connect.mock.calls[0][0];
    drag({ id: "a", x: 1, y: 0 });
    drag({ id: "a", x: 2, y: 0 });
    drag({ id: "a", x: 3, y: 0 });
    expect(cable.performed).toEqual([["drag", { id: "a", x: 1, y: 0 }]]);
    vi.advanceTimersByTime(50);
    expect(cable.performed.at(-1)).toEqual(["drag", { id: "a", x: 3, y: 0 }]);
  });

  it("drops a waiting drag when an action goes out", () => {
    const store = fakeStore();
    connectGame("abc", store);
    cable.callbacks.connected();
    const { act, drag } = store.connect.mock.calls[0][0];
    drag({ id: "a", x: 1, y: 0 });
    drag({ id: "a", x: 2, y: 0 });
    act({ actionId: "x" });
    vi.advanceTimersByTime(100);
    expect(cable.performed.map(([action]) => action)).toEqual(["drag", "act"]);
  });

  it("hands the store its connection only once the subscription is confirmed, and takes it back on a drop", () => {
    const store = fakeStore();
    connectGame("abc", store);
    expect(store.connect).not.toHaveBeenCalled();
    cable.callbacks.connected();
    expect(store.connect).toHaveBeenCalledTimes(1);
    cable.callbacks.disconnected();
    expect(store.disconnect).toHaveBeenCalledTimes(1);
  });

  it("pings every 8 to 10 seconds", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    connectGame("abc", fakeStore());
    vi.advanceTimersByTime(8999);
    expect(cable.performed).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(cable.performed).toEqual([["ping", undefined]]);
  });

  it("passes the roster along from snapshots and joins", () => {
    const store = fakeStore();
    const onRoster = vi.fn();
    connectGame("abc", store, { onRoster });
    cable.received({ type: "snapshot", sequence: 0, roster: [{ id: "p1" }] });
    cable.received({ type: "roster", roster: [{ id: "p1" }, { id: "p2" }] });
    expect(onRoster.mock.calls).toEqual([[[{ id: "p1" }]], [[{ id: "p1" }, { id: "p2" }]]]);
    expect(store.receive).toHaveBeenCalledTimes(1);
  });

  it("disconnects when the game opens somewhere else", () => {
    const store = fakeStore();
    const onReplaced = vi.fn();
    connectGame("abc", store, { onReplaced });
    cable.received({ type: "change", sequence: 1 });
    expect(store.receive).toHaveBeenCalledWith({ type: "change", sequence: 1 });
    cable.received({ type: "replaced" });
    expect(onReplaced).toHaveBeenCalled();
    expect(store.disconnect).toHaveBeenCalled();
    expect(cable.disconnected).toBe(true);
    vi.advanceTimersByTime(20000);
    expect(cable.performed).toEqual([]);
  });
});
