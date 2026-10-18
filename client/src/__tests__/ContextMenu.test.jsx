import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ContextMenu } from "../ui/ContextMenu";

const menu = { pieceId: "AS", clientX: 100, clientY: 120, pointerType: "mouse" };

function renderMenu(props = {}) {
  const interaction = { flip: vi.fn(), rotate: vi.fn() };
  const onClose = vi.fn();
  render(<ContextMenu menu={menu} interaction={interaction} popover={false} onClose={onClose} {...props} />);
  return { interaction, onClose };
}

describe("ContextMenu", () => {
  it("flips and rotates its piece, then closes", () => {
    const { interaction, onClose } = renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Flip/ }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate left 45°" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate right 22.5°" }));
    expect(interaction.flip).toHaveBeenCalledWith("AS");
    expect(interaction.rotate.mock.calls).toEqual([[-45, "AS"], [22.5, "AS"]]);
    expect(onClose).toHaveBeenCalledTimes(3);
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
