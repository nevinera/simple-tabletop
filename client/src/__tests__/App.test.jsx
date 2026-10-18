import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "../App";

// WebGL isn't available under jsdom, so stand in for the canvas.
vi.mock("../table/TableCanvas", () => ({ default: () => <div data-testid="table-canvas" /> }));
vi.mock("../manifest/manifest", () => ({
  fetchManifest: () => Promise.resolve({ name: "Four Aces", pieces: [], labels: [] }),
}));

function renderAt(forceViewport) {
  window.history.replaceState(null, "", forceViewport ? `/?forceViewport=${forceViewport}` : "/");
  return render(<App manifestUrl="/modules/aces/manifest.json" />);
}

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
});

afterEach(() => {
  delete window.matchMedia;
});

describe("App layouts", () => {
  it("hides the action bar on desktop until Options turns it on", async () => {
    const { container } = renderAt(null);
    expect(container.querySelector(".layout-desktop")).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: "Action bar" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    fireEvent.click(screen.getByLabelText("Show action bar"));
    expect(screen.getByRole("navigation", { name: "Action bar" })).not.toBeNull();
    expect(await screen.findByText("Four Aces")).not.toBeNull();
  });

  it.each(["portrait", "landscape"])("shows the action bar in %s", (viewport) => {
    const { container } = renderAt(viewport);
    expect(container.querySelector(`.layout-${viewport}`)).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Toolbar" })).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Action bar" })).not.toBeNull();
  });

  it("keeps only one menu open at a time", () => {
    renderAt("portrait");
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("dialog", { name: "Help" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Views" }));
    expect(screen.queryByRole("dialog", { name: "Help" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Views" })).not.toBeNull();
  });
});
