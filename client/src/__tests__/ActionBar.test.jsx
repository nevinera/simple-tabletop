import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ActionBar } from "../ui/ActionBar";

function Bar() {
  const [magnifyMode, setMagnifyMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const menus = { openMenu: null, setOpenMenu: () => {} };
  return (
    <ActionBar scene={null} interaction={null} selectedObject={null} cameraPoints={{}} menus={menus}
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
});
