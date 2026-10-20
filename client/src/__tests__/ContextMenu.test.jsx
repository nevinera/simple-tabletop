import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ContextMenu } from "../ui/ContextMenu";

const menu = { objectId: "AS", clientX: 100, clientY: 120, pointerType: "mouse" };

const PIECE = { kind: "piece", locked: false, count: null, canMakeDeck: true, canFlip: true };

function renderMenu(props = {}, object = PIECE) {
  const interaction = {
    describe: () => object, flip: vi.fn(), rotate: vi.fn(), lock: vi.fn(), draw: vi.fn(), shuffle: vi.fn(), makeDeck: vi.fn(),
  };
  const onClose = vi.fn();
  render(<ContextMenu menu={menu} interaction={interaction} popover={false} onClose={onClose} {...props} />);
  return { interaction, onClose };
}

describe("ContextMenu", () => {
  it("flips and rotates its piece, then closes", () => {
    const { interaction, onClose } = renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Flip/ }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate left 45°" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate right 15°" }));
    expect(interaction.flip).toHaveBeenCalledWith("AS");
    expect(interaction.rotate.mock.calls).toEqual([[-45, "AS"], [15, "AS"]]);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("offers a locked piece only unlocking", () => {
    const { interaction } = renderMenu({}, { ...PIECE, locked: true, canMakeDeck: false });
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Unlock L"]);
    fireEvent.click(screen.getByRole("button", { name: /Unlock/ }));
    expect(interaction.lock).toHaveBeenCalledWith("AS");
  });

  it("draws several into your hand, stepping the count within the deck", () => {
    localStorage.clear();
    const { interaction, onClose } = renderMenu({}, { kind: "deck", locked: false, count: 6, hasHand: true });
    fireEvent.click(screen.getByRole("button", { name: "Draw more" }));
    expect(screen.getByRole("button", { name: "Draw more" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Draw 6" }));
    expect(interaction.draw).toHaveBeenCalledWith("AS", { count: 6 });
    expect(onClose).toHaveBeenCalled();
    expect(localStorage.getItem("simple-tabletop:draw-count")).toBe("6");
  });

  it("offers a deck drawing and shuffling, but not flipping", () => {
    const { interaction } = renderMenu({}, { kind: "deck", locked: false, count: 3, canMakeDeck: false });
    expect(screen.getByText("Deck: 3 cards")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Flip/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Draw G/ }));
    fireEvent.click(screen.getByRole("button", { name: /Shuffle/ }));
    expect(interaction.draw).toHaveBeenCalledWith("AS");
    expect(interaction.shuffle).toHaveBeenCalledWith("AS");
  });

  it("turns a card into a deck", () => {
    const { interaction } = renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Make a deck" }));
    expect(interaction.makeDeck).toHaveBeenCalledWith("AS");
  });

  it("sits at the cursor", () => {
    renderMenu();
    expect(screen.getByRole("menu").style.left).toBe("100px");
  });

  it("centers as a popover", () => {
    renderMenu({ popover: true });
    expect(screen.getByRole("menu").className).toContain("context-menu-popover");
    expect(screen.getByRole("menu").style.left).toBe("");
  });
});

describe("bag titles", () => {
  it("lead with a bag's label", () => {
    renderMenu({}, { kind: "bag", locked: true, count: 3, text: "Skyrim" });
    expect(screen.getByText("Skyrim: 3 things")).toBeTruthy();
  });

  it("say Bag without one", () => {
    renderMenu({}, { kind: "bag", locked: true, count: 0, text: null });
    expect(screen.getByText("Empty bag")).toBeTruthy();
  });
});
