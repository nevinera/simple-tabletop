import { describe, expect, it, vi } from "vitest";
import { createTableStore } from "../state/store";
import { normalizeManifest } from "../manifest/manifest";

const manifest = normalizeManifest({
  formatVersion: 1,
  id: "test",
  name: "Test",
  table: { size: [90, 90] },
  layers: [{ id: "pieces", thickness: 0.03 }],
  seats: [{ id: "south", name: "South", side: "south" }],
  pieces: [{ id: "AS", kind: "card", size: [6.3, 8.8], face: "AS.svg", position: [10, 20] }],
}, "https://example.com/manifest.json");

describe("createTableStore", () => {
  it("applies actions and tells subscribers", () => {
    const store = createTableStore(manifest);
    const listener = vi.fn();
    store.subscribe(listener);

    const action = { type: "flip", id: "AS", playerId: "p1" };
    expect(store.dispatch(action).ok).toBe(true);
    expect(store.getState().pieces.AS.faceUp).toBe(false);
    expect(listener).toHaveBeenCalledWith(store.getState(), action);
  });

  it("doesn't notify for rejected actions", () => {
    const store = createTableStore(manifest);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.dispatch({ type: "drop", id: "AS", playerId: "p1", x: 0, y: 0 }).ok).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe", () => {
    const store = createTableStore(manifest);
    const listener = vi.fn();
    store.subscribe(listener)();
    store.dispatch({ type: "flip", id: "AS", playerId: "p1" });
    expect(listener).not.toHaveBeenCalled();
  });
});
