import { describe, expect, it, vi } from "vitest";
import { act as react, fireEvent, render, screen } from "@testing-library/react";
import { applyAction, initialState } from "../state/actions";
import { normalizeManifest } from "../manifest/manifest";
import { createTableStore } from "../state/store";
import { PieceInteraction } from "../table/interaction";
import { ContainerSearch, SearchPanel, pieceLabel } from "../ui/SearchPanel";

const manifest = normalizeManifest({
  formatVersion: 1, id: "t", name: "T", table: { size: [90, 60] },
  layers: [{ id: "pieces", thickness: 0.03 }],
  hands: true,
  seats: [{ id: "south", name: "South", side: "south" }],
  pieceTypes: { card: { kind: "card", size: [6, 9], back: "b.svg" } },
  pieces: [
    { id: "fire-bolt", type: "card", face: "f.svg" },
    { id: "ice-shard", type: "card", face: "i.svg" },
    { id: "heal", type: "card", face: "h.svg" },
    { id: "red-gem", kind: "token", size: [2], face: "r.svg" },
    { id: "d6", kind: "die", die: "d6", size: [2] },
  ],
  containers: [
    { id: "deck", kind: "deck", position: [20, 30], size: [6, 9], members: ["fire-bolt", "ice-shard", "heal"] },
    { id: "bag", kind: "bag", position: [60, 30], size: [8, 8], members: ["red-gem", "d6"] },
  ],
}, "https://example.com/m.json");

describe("drawing a picked card", () => {
  const act = (state, action) => applyAction(manifest, state, { playerId: "me", ...action });

  it("takes any card from a deck, held to place", () => {
    const state = act(initialState(manifest), { type: "draw", id: "deck", pick: "ice-shard" }).state;
    expect(state.containers.deck.members).toEqual(["fire-bolt", "heal"]);
    expect(state.pieces["ice-shard"]).toMatchObject({ containerId: null, heldBy: "me" });
  });

  it("refuses a pick that isn't in the deck", () => {
    expect(act(initialState(manifest), { type: "draw", id: "deck", pick: "red-gem" }).ok).toBe(false);
  });
});

describe("SearchPanel", () => {
  const items = ["fire-bolt", "ice-shard", "heal"].map((id) => ({ id, label: pieceLabel(id), side: { image: null, size: [6, 9] } }));

  it("filters by every word typed, and takes or hands over a piece", () => {
    const onTake = vi.fn();
    const onToHand = vi.fn();
    render(<SearchPanel title="Search the deck" items={items} onTake={onTake} onToHand={onToHand} onClose={() => {}} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "SHARD ice" } });
    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual(["ice shardTakeTo hand"]);
    fireEvent.click(screen.getByRole("button", { name: "Take ice shard" }));
    fireEvent.click(screen.getByRole("button", { name: "Put ice shard in your hand" }));
    expect(onTake).toHaveBeenCalledWith("ice-shard");
    expect(onToHand).toHaveBeenCalledWith("ice-shard");
  });
});

describe("ContainerSearch", () => {
  function setup() {
    const store = createTableStore(manifest);
    store.dispatch({ type: "join", playerId: "me", seatId: "south" });
    const interaction = new PieceInteraction({
      store, manifest, playerId: "me", pick: () => null, tablePoint: () => null, clampToTable: (p) => p,
      setCameraEnabled: () => {}, setCursor: () => {},
    });
    const onClose = vi.fn();
    render(<ContainerSearch store={store} manifest={manifest} interaction={interaction} containerId="bag" onClose={onClose} />);
    return { store, onClose };
  }

  it("takes a searched piece out to place, and closes", () => {
    const { store, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Take red gem" }));
    expect(store.getState().pieces["red-gem"]).toMatchObject({ containerId: null, heldBy: "me" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes once the bag runs empty", () => {
    const { store, onClose } = setup();
    react(() => {
      store.dispatch({ type: "draw", id: "bag", pick: "red-gem", playerId: "me" });
      store.dispatch({ type: "release", id: "red-gem", playerId: "me" });
      store.dispatch({ type: "draw", id: "bag", pick: "d6", playerId: "me" });
    });
    expect(onClose).toHaveBeenCalled();
  });
});
