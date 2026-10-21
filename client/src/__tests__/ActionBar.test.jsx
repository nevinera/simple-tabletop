import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ActionBar } from "../ui/ActionBar";

function Bar({ cameraPoints = {}, openMenu = null }) {
  const [magnifyMode, setMagnifyMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const menus = { openMenu, setOpenMenu: () => {} };
  return (
    <ActionBar scene={null} interaction={null} selectedObject={null} cameraPoints={cameraPoints} menus={menus}
      magnifyMode={magnifyMode} setMagnifyMode={setMagnifyMode} selectMode={selectMode} setSelectMode={setSelectMode} />
  );
}

describe("ActionBar", () => {
  it("keeps only one of magnify and select mode on", () => {
    render(<Bar />);
    const magnify = screen.getByRole("button", { name: "Magnify" });
    const select = screen.getByRole("button", { name: "Select several" });
    fireEvent.click(select);
    expect(select.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(magnify);
    expect([magnify.getAttribute("aria-pressed"), select.getAttribute("aria-pressed")]).toEqual(["true", "false"]);
    fireEvent.click(select);
    expect([magnify.getAttribute("aria-pressed"), select.getAttribute("aria-pressed")]).toEqual(["false", "true"]);
  });

  it("jumps to a view from one row of buttons, and saves to one from the next", () => {
    const cameraPoints = { jump: vi.fn(), save: vi.fn() };
    render(<Bar cameraPoints={cameraPoints} openMenu="camera-points" />);
    fireEvent.click(screen.getByRole("button", { name: "Save view 3" }));
    expect(cameraPoints.save).toHaveBeenCalledWith("3");
    expect(screen.getByRole("status").textContent).toBe("Saved view 3");
    fireEvent.click(screen.getByRole("button", { name: "Go to view 3" }));
    expect(cameraPoints.jump).toHaveBeenCalledWith("3");
    expect(cameraPoints.save).toHaveBeenCalledTimes(1);
  });
});
