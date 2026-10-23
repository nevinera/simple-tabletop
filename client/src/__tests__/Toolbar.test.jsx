import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Toolbar } from "../ui/Toolbar";

function Bar({ documents, ...rest }) {
  const [openMenu, setOpenMenu] = useState(null);
  return <Toolbar title="Game" layout="desktop" menus={{ openMenu, setOpenMenu }} documents={documents} {...rest} />;
}

describe("Toolbar documents", () => {
  it("links each document in a new tab", () => {
    render(<Bar documents={[{ name: "Rulebook", url: "https://example.com/rules.pdf" }]} />);
    fireEvent.click(screen.getByRole("button", { name: /Docs/ }));
    const link = screen.getByRole("link", { name: "Rulebook" });
    expect(link.getAttribute("href")).toBe("https://example.com/rules.pdf");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("has no Docs menu without documents", () => {
    render(<Bar documents={[]} />);
    expect(screen.queryByRole("button", { name: /Docs/ })).toBeNull();
  });
});

describe("Toolbar setups", () => {
  const setups = [{ id: "skyrim", name: "Skyrim", description: null }];

  it("runs a setup once the player confirms", () => {
    const onSetup = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<Bar setups={setups} onSetup={onSetup} />);
    fireEvent.click(screen.getByRole("button", { name: "Setup" }));
    fireEvent.click(screen.getByRole("button", { name: "Skyrim" }));
    expect(onSetup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Skyrim" }));
    expect(onSetup).toHaveBeenCalledWith("skyrim");
    confirm.mockRestore();
  });

  it("has no Setup menu without setups", () => {
    render(<Bar />);
    expect(screen.queryByRole("button", { name: "Setup" })).toBeNull();
  });

  it("asks an unseated player to sit first", () => {
    render(<Bar setups={setups} onSetup={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Setup" }));
    expect(screen.getByText("Take a seat to set up the table.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skyrim" }).disabled).toBe(true);
  });
});
