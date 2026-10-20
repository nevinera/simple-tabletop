import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Home } from "../ui/Home";
import { startGame } from "../server/api";
import { rememberModule } from "../browserMemory";

vi.mock("../server/api", () => ({ startGame: vi.fn() }));
vi.mock("../manifest/manifest", async (importActual) => {
  const actual = await importActual();
  const raw = {
    formatVersion: 1, id: "aces", name: "Four Aces", table: { size: [90, 90] },
    layers: [{ id: "pieces", thickness: 0.03 }],
    pieces: [{ id: "AS", kind: "card", size: [6.3, 8.8], face: "AS.svg", position: [45, 45] }],
  };
  return { ...actual, fetchManifest: vi.fn((url) => Promise.resolve(actual.normalizeManifest(raw, new URL(url, "http://localhost/").href))) };
});

const BUILT_INS = [
  { url: "/builtins/checkers/manifest.json", name: "Checkers", description: "Crown your checkers.", thumbnailUrl: "/builtins/checkers/thumbnail.svg" },
];
let assign;

beforeEach(() => {
  localStorage.clear();
  assign = vi.fn();
  vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign, href: "http://localhost/" });
});
afterEach(() => vi.restoreAllMocks());

describe("Home", () => {
  it("lists the tables you joined", () => {
    render(<Home tables={[{ path: "/tables/01ABC", name: "Friday", playerName: "Sam" }]} builtIns={BUILT_INS} />);
    expect(screen.getByRole("link", { name: "Friday" }).getAttribute("href")).toBe("/tables/01ABC");
    expect(screen.getByText("as Sam")).toBeTruthy();
  });

  it("starts a table from the built-in module", async () => {
    startGame.mockResolvedValue({ path: "/tables/01XYZ" });
    render(<Home tables={[]} builtIns={BUILT_INS} />);
    expect(screen.queryByRole("region", { name: "Your tables" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), { target: { value: "Sam" } });
    fireEvent.click(screen.getByRole("button", { name: "Start table" }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/tables/01XYZ"));
    expect(startGame).toHaveBeenCalledWith(expect.objectContaining({
      manifestUrl: "/builtins/checkers/manifest.json", name: "Four Aces", playerName: "Sam",
    }));
    expect(localStorage.getItem("simple-tabletop:player-name")).toBe("Sam");
  });

  it("offers modules you played, newest first, and picks the newest", () => {
    rememberModule({ url: "https://a.test/old.json", name: "Old", version: "1.0" }, localStorage, 1);
    rememberModule({ url: "https://b.test/new.json", name: "New", version: "2.0" }, localStorage, 2);
    rememberModule({ url: "http://localhost/builtins/checkers/manifest.json", name: "Checkers" }, localStorage, 0);
    render(<Home tables={[]} builtIns={BUILT_INS} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => radio.closest("label").textContent)).toEqual([
      "CheckersCrown your checkers.", "New2.0 · b.test", "Old1.0 · a.test", "", "",
    ]);
    expect(radios[1].checked).toBe(true);
    expect(screen.getByRole("link", { name: "Try it alone" }).getAttribute("href")).toBe(
      `/sandbox?manifest=${encodeURIComponent("https://b.test/new.json")}`
    );
  });

  it("takes a pasted manifest URL", async () => {
    startGame.mockResolvedValue({ path: "/tables/01XYZ" });
    render(<Home tables={[]} builtIns={BUILT_INS} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Manifest URL" }), { target: { value: "https://c.test/m.json" } });
    fireEvent.focus(screen.getByRole("textbox", { name: "Manifest URL" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Table name" }), { target: { value: "Friday" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), { target: { value: "Alex" } });
    fireEvent.click(screen.getByRole("button", { name: "Start table" }));
    await vi.waitFor(() => expect(startGame).toHaveBeenCalledWith(expect.objectContaining({ manifestUrl: "https://c.test/m.json", name: "Friday" })));
  });
});

describe("resuming a saved table", () => {
  it("reads the file, says what it resumes, and starts the table from the saved state", async () => {
    const { normalizeManifest } = await import("../manifest/manifest");
    const raw = {
      formatVersion: 1, id: "t", name: "Tiny", table: { size: [20, 20] }, layers: [{ id: "pieces", thickness: 0.03 }],
      pieces: [{ id: "AS", kind: "card", size: [6, 9], face: "AS.svg", position: [5, 5] }],
    };
    const manifest = normalizeManifest(raw, "https://example.com/tiny.json");
    vi.spyOn(await import("../manifest/manifest"), "fetchManifest").mockResolvedValue(manifest);
    const api = await import("../server/api");
    const startGame = vi.spyOn(api, "startGame").mockResolvedValue({ path: "/tables/new" });
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign, href: "http://localhost/" });

    render(<Home tables={[]} builtIns={BUILT_INS} />);
    const save = {
      format: "simple-tabletop-save", formatVersion: 1, manifestUrl: "https://example.com/tiny.json", moduleName: "Tiny",
      savedAt: "2026-10-21T12:00:00Z",
      state: {
        sequence: 9, seating: "four",
        pieces: {
          AS: { x: 12, y: 3, rotation: 90, faceUp: false, stackOrder: 0, containerId: null, heldBy: null, drag: null, locked: false },
          gone: { x: 1, y: 1, rotation: 0, faceUp: true, stackOrder: 1, containerId: null, heldBy: null, drag: null, locked: false },
        },
        containers: {},
      },
    };
    const file = new File([JSON.stringify(save)], "tiny.table.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Saved table file"), { target: { files: [file] } });
    expect(await screen.findByText(/Resumes Tiny, saved .*1 piece it no longer has will be left out/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), { target: { value: "Sam" } });
    fireEvent.click(screen.getByRole("button", { name: "Resume table" }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/tables/new"));
    const { state } = startGame.mock.calls[0][0];
    expect(state.sequence).toBe(9);
    expect(Object.keys(state.pieces)).toEqual(["AS"]);
    expect(state.pieces.AS).toMatchObject({ x: 12, y: 3, faceUp: false });
  });
});
