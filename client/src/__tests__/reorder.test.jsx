import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { applyAction, initialState } from "../state/actions";
import { normalizeManifest } from "../manifest/manifest";
import { ContextMenu } from "../ui/ContextMenu";
import { ReorderPanel } from "../ui/ReorderPanel";

const manifest = normalizeManifest({
  formatVersion: 1,
  id: "test",
  name: "Test",
  table: { size: [90, 60] },
  layers: [{ id: "pieces", thickness: 0.03 }],
  pieceTypes: { card: { kind: "card", size: [6, 9], face: "f.svg", back: "b.svg" } },
  pieces: [{ id: "c1", type: "card" }, { id: "c2", type: "card" }, { id: "c3", type: "card" }],
  containers: [{ id: "deck", kind: "deck", position: [30, 30], size: [6, 9], members: ["c1", "c2", "c3"], fixed: true }],
}, "https://example.com/m.json");
const act = (state, action) => applyAction(manifest, state, { playerId: "me", ...action });

describe("reorder action", () => {
  it("puts a locked deck's cards in the chosen order", () => {
    const { state } = act(initialState(manifest), { type: "reorder", id: "deck", order: ["c3", "c1", "c2"] });
    expect(state.containers.deck.members).toEqual(["c3", "c1", "c2"]);
  });

  it("refuses an order that doesn't match the deck", () => {
    expect(act(initialState(manifest), { type: "reorder", id: "deck", order: ["c3", "c1"] }).reason).toMatch(/changed/);
  });
});

describe("ReorderPanel", () => {
  const cards = ["c1", "c2", "c3"].map((id) => ({ id, label: id, side: { image: null, size: [6, 9] } }));

  it("moves cards with the arrows, then saves top first", () => {
    const onSave = vi.fn(() => true);
    const onClose = vi.fn();
    render(<ReorderPanel cards={cards} onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Move c3 up" }));
    fireEvent.click(screen.getByRole("button", { name: "Move c1 down" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(["c3", "c1", "c2"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open and says so when the deck changed", () => {
    const onClose = vi.fn();
    render(<ReorderPanel cards={cards} onSave={() => false} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toMatch(/changed/);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens from a deck's menu", () => {
    const onReorder = vi.fn();
    const interaction = { describe: () => ({ kind: "deck", locked: false, count: 3, canFlip: true }) };
    render(<ContextMenu menu={{ objectId: "deck", clientX: 0, clientY: 0 }} interaction={interaction} popover={false}
      onReorder={onReorder} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Reorder…" }));
    expect(onReorder).toHaveBeenCalledWith("deck");
  });
});
