import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Toolbar } from "../ui/Toolbar";

function Bar({ documents }) {
  const [openMenu, setOpenMenu] = useState(null);
  return <Toolbar title="Game" layout="desktop" menus={{ openMenu, setOpenMenu }} documents={documents} />;
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
