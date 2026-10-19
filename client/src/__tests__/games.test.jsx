import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "../App";
import { fetchGameState, joinGame, startGame } from "../server/api";

vi.mock("../table/TableCanvas", () => ({ default: () => <div data-testid="table-canvas" /> }));
vi.mock("../server/api", () => ({ fetchGameState: vi.fn(), joinGame: vi.fn(), startGame: vi.fn() }));
vi.mock("../manifest/manifest", async (importActual) => {
  const actual = await importActual();
  const raw = {
    formatVersion: 1,
    id: "aces",
    name: "Four Aces",
    table: { size: [90, 90] },
    layers: [{ id: "pieces", thickness: 0.03 }],
    pieces: [{ id: "AS", kind: "card", size: [6.3, 8.8], face: "AS.svg", position: [45, 45] }],
  };
  return { ...actual, fetchManifest: () => Promise.resolve(actual.normalizeManifest(raw, "https://example.com/m.json")) };
});

const SERVER_STATE = {
  sequence: 4,
  seating: "four",
  tableLocked: false,
  players: {},
  roster: [{ id: "p1", name: "Sam", host: true }],
  pieces: { AS: { x: 20, y: 30, rotation: 0, faceUp: true, stackOrder: 0, containerId: null, heldBy: null, drag: null, locked: false } },
  containers: {},
};

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.history.replaceState(null, "", "/");
  fetchGameState.mockResolvedValue(SERVER_STATE);
});

afterEach(() => {
  delete window.matchMedia;
  delete window.tableStore;
  vi.clearAllMocks();
});

describe("server games", () => {
  it("asks a new player's name, then for a seat", async () => {
    joinGame.mockResolvedValue({ id: "p2", name: "Alex", host: false });
    render(<App manifestUrl="/m.json" game={{ token: "abc", name: "Friday", player: null }} />);
    fireEvent.change(await screen.findByRole("textbox", { name: "Your name" }), { target: { value: "Alex" } });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(await screen.findByRole("dialog", { name: "Pick a seat" })).toBeTruthy();
    expect(joinGame).toHaveBeenCalledWith("abc", "Alex");
    expect(window.tableStore.getState().pieces.AS).toMatchObject({ x: 20, y: 30 });
    fireEvent.click(screen.getByRole("button", { name: "South" }));
    expect(window.tableStore.getState().players.p2).toEqual({ seatId: "south-left" });
  });

  it("hosts the sandbox table as a new game", async () => {
    startGame.mockResolvedValue({ path: "/games/xyz" });
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign, href: "http://localhost/" });
    render(<App manifestUrl="/m.json" />);
    fireEvent.click(await screen.findByRole("button", { name: "Game" }));
    fireEvent.click(await screen.findByRole("button", { name: "Host it as a game…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Game name" }), { target: { value: "Friday" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), { target: { value: "Sam" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/games/xyz"));
    expect(startGame).toHaveBeenCalledWith(expect.objectContaining({ manifestUrl: "/m.json", name: "Friday", playerName: "Sam" }));
    expect(fetchGameState).not.toHaveBeenCalled();
  });
});
