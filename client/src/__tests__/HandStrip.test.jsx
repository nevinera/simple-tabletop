import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HandStrip } from "../ui/HandStrip";

const cards = ["c1", "c2"].map((id) => ({ id, side: { image: null, size: [6, 9] } }));

function renderStrip(selectedIds = [], selectMode = false) {
  const interaction = { handGrab: vi.fn(() => true), toggleSelect: vi.fn(), cancelSelection: vi.fn() };
  render(<HandStrip cards={cards} selectedIds={selectedIds} selectMode={selectMode} interaction={interaction} canvas={null} />);
  return interaction;
}

const tap = (name, extra = {}) => {
  const card = screen.getByRole("button", { name });
  card.setPointerCapture = () => {};
  fireEvent.pointerDown(card, { button: 0, pointerId: 1, clientX: 5, clientY: 5, ...extra });
  fireEvent.pointerUp(card, { button: 0, pointerId: 1, clientX: 5, clientY: 5, ...extra });
};

describe("HandStrip", () => {
  it("marks every selected card", () => {
    renderStrip(["c1", "c2"]);
    expect(screen.getAllByRole("button").map((card) => card.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
  });

  it("adds a card to the selection with shift, and selects just it without", () => {
    const interaction = renderStrip(["c1"]);
    tap("c2", { shiftKey: true });
    expect(interaction.toggleSelect).toHaveBeenCalledWith("c2");
    tap("c2");
    expect(interaction.handGrab).toHaveBeenCalledWith("c2");
    tap("c1");
    expect(interaction.cancelSelection).toHaveBeenCalled();
  });

  it("adds cards with a plain tap in select mode", () => {
    const interaction = renderStrip(["c1"], true);
    tap("c2");
    tap("c1");
    expect(interaction.toggleSelect.mock.calls).toEqual([["c2"], ["c1"]]);
    expect(interaction.handGrab).not.toHaveBeenCalled();
  });
});
