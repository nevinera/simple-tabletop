import { describe, expect, it } from "vitest";
import { DEFAULT_TABLE_COLOR, ManifestError, normalizeManifest } from "../manifest/manifest";

const BASE = "https://example.com/games/aces/manifest.json";

function manifest(overrides = {}) {
  return {
    formatVersion: 1,
    id: "aces",
    name: "Aces",
    table: { size: [90, 90] },
    layers: [
      { id: "board", thickness: 0.3 },
      { id: "pieces", thickness: 0.03 },
    ],
    seats: [{ id: "south", name: "South", side: "south" }],
    pieceTypes: {
      card: { shape: "rect", size: [6.3, 8.8], back: "assets/back.svg", categories: ["cards"] },
    },
    pieces: [{ id: "AS", type: "card", face: "assets/AS.svg", position: [45, 57] }],
    ...overrides,
  };
}

describe("normalizeManifest", () => {
  it("merges piece types and fills defaults", () => {
    const [piece] = normalizeManifest(manifest(), BASE).pieces;
    expect(piece).toEqual({
      id: "AS",
      shape: "rect",
      size: [6.3, 8.8],
      type: "card",
      categories: ["cards"],
      layer: { id: "pieces", thickness: 0.03, base: 0.3 },
      thickness: 0.03,
      face: { url: "https://example.com/games/aces/assets/AS.svg" },
      back: { url: "https://example.com/games/aces/assets/back.svg" },
      position: [45, 57],
      rotation: 0,
      faceUp: true,
      fixed: false,
    });
  });

  it("lets a piece override its type", () => {
    const pieces = [{ id: "AS", type: "card", face: "AS.svg", position: [0, 0], size: [5, 5] }];
    expect(normalizeManifest(manifest({ pieces }), BASE).pieces[0].size).toEqual([5, 5]);
  });

  it("combines a piece's categories with its type's", () => {
    const pieces = [{ id: "AS", type: "card", face: "AS.svg", position: [0, 0], categories: ["aces", "cards"] }];
    expect(normalizeManifest(manifest({ pieces }), BASE).pieces[0].categories).toEqual(["cards", "aces"]);
  });

  it("stacks each layer on the ones below it", () => {
    expect(normalizeManifest(manifest(), BASE).layers).toEqual([
      { id: "board", thickness: 0.3, base: 0 },
      { id: "pieces", thickness: 0.03, base: 0.3 },
    ]);
  });

  it("defaults the table color", () => {
    expect(normalizeManifest(manifest(), BASE).table.color).toBe(DEFAULT_TABLE_COLOR);
    const table = { size: [90, 90], color: "#123456" };
    expect(normalizeManifest(manifest({ table }), BASE).table.color).toBe("#123456");
  });

  it("fills label defaults, putting labels on the bottom layer", () => {
    const labels = [{ text: "Discard", position: [10, 20] }];
    expect(normalizeManifest(manifest({ labels }), BASE).labels).toEqual([{
      text: "Discard",
      position: [10, 20],
      rotation: 0,
      fontSize: 1,
      color: "#ffffff",
      layer: { id: "board", thickness: 0.3, base: 0 },
    }]);
  });

  it("keeps seat cameras", () => {
    const view = { position: [45, 60, -10], target: [45, 0, 45] };
    const seats = [{ id: "south", name: "South", side: "south", cameras: { 0: view } }];
    expect(normalizeManifest(manifest({ seats }), BASE).seats[0].cameras).toEqual({ 0: view });
  });

  it("resolves sheet references to a grid cell", () => {
    const sheets = { cards: { image: "cards.png", columns: 13, rows: 4 } };
    const pieces = [{ id: "AS", type: "card", face: { sheet: "cards", index: 14 }, position: [0, 0] }];
    const [piece] = normalizeManifest(manifest({ sheets, pieces }), BASE).pieces;
    expect(piece.face).toEqual({
      url: "https://example.com/games/aces/cards.png",
      columns: 13,
      rows: 4,
      index: 14,
    });
  });

  it("allows pieces without a position when a container lists them", () => {
    const pieces = [{ id: "AS", type: "card", face: "AS.svg" }];
    const containers = [{ id: "deck", kind: "deck", position: [0, 0], size: [6, 9], members: ["AS"] }];
    expect(normalizeManifest(manifest({ pieces, containers }), BASE).pieces[0].position).toBeNull();
  });

  it("fills container defaults", () => {
    const pieces = [{ id: "AS", type: "card", face: "AS.svg" }];
    const containers = [{ id: "deck", kind: "deck", position: [10, 10], size: [6.3, 8.8], members: ["AS"] }];
    expect(normalizeManifest(manifest({ pieces, containers }), BASE).containers).toEqual([{
      id: "deck",
      kind: "deck",
      position: [10, 10],
      rotation: 0,
      size: [6.3, 8.8],
      layer: { id: "pieces", thickness: 0.03, base: 0.3 },
      image: null,
      fixed: false,
      faceUp: false,
      members: ["AS"],
      // Decks take more of their members' type.
      accepts: [{ type: "card" }],
    }]);
  });

  it("makes up eight seats when the module lists none, and reads hands", () => {
    const normalized = normalizeManifest(manifest({ seats: undefined, hands: { passing: false } }), BASE);
    expect(normalized.listedSeats).toBe(false);
    expect(normalized.maxSeats).toBe(8);
    expect(normalized.seats.map((seat) => seat.id)).toEqual([
      "south-left", "north-left", "east-left", "west-left", "south-right", "north-right", "east-right", "west-right",
    ]);
    expect(normalized.hands).toEqual({ enabled: true, passing: false });
    expect(normalizeManifest(manifest(), BASE).hands).toEqual({ enabled: false, passing: false });
  });

  it("lets an empty deck take anything", () => {
    const containers = [{ id: "pile", kind: "deck", position: [10, 10], size: [6.3, 8.8] }];
    expect(normalizeManifest(manifest({ containers }), BASE).containers[0].accepts).toBeNull();
  });

  it.each([
    ["a wrong format version", { formatVersion: 2 }, /formatVersion/],
    ["a missing table", { table: undefined }, /"table"/],
    ["an unknown layer id", { layers: [{ id: "sky", thickness: 1 }] }, /Unknown layer/],
    ["a layer without thickness", { layers: [{ id: "board" }] }, /thickness/],
    ["duplicate piece ids", {
      pieces: [
        { id: "AS", type: "card", face: "a.svg", position: [0, 0] },
        { id: "AS", type: "card", face: "b.svg", position: [0, 0] },
      ],
    }, /Duplicate/],
    ["an unknown type", { pieces: [{ id: "AS", type: "tile", face: "a.svg", position: [0, 0] }] }, /unknown type/],
    ["a piece on a missing layer", {
      layers: [{ id: "board", thickness: 0.3 }],
    }, /unknown layer/],
    ["a missing position", { pieces: [{ id: "AS", type: "card", face: "a.svg" }] }, /position/],
    ["an unknown sheet", {
      pieces: [{ id: "AS", type: "card", face: { sheet: "nope", index: 0 }, position: [0, 0] }],
    }, /unknown sheet/],
    ["a bad camera slot", {
      seats: [{ id: "s", name: "S", side: "south", cameras: { 10: { position: [0, 0, 0], target: [0, 0, 0] } } }],
    }, /0 to 9/],
    ["a label without text", { labels: [{ position: [0, 0] }] }, /needs text/],
    ["an unknown container kind", { containers: [{ id: "c", kind: "box", position: [0, 0] }] }, /unknown kind/],
    ["a container with an unknown member", {
      containers: [{ id: "c", kind: "deck", position: [0, 0], size: [6, 9], members: ["KS"] }],
    }, /unknown piece/],
    ["a piece in two containers", {
      containers: [
        { id: "a", kind: "deck", position: [0, 0], size: [6, 9], members: ["AS"] },
        { id: "b", kind: "deck", position: [0, 0], size: [6, 9], members: ["AS"] },
      ],
    }, /both/],
    ["a deck without a size", { containers: [{ id: "c", kind: "deck", position: [0, 0] }] }, /size/],
    ["a container with a piece's id", {
      containers: [{ id: "AS", kind: "bag", position: [0, 0] }],
    }, /same id/],
    ["a seat without a side", { seats: [{ id: "s", name: "S" }] }, /side/],
    ["too many seats", { seats: undefined, maxSeats: 9 }, /maxSeats/],
    ["a piece id that hands use", { pieces: [{ id: "hand-x", type: "card", face: "a.svg", position: [0, 0] }] }, /hand-/],
    ["an empty accepts matcher", {
      containers: [{ id: "c", kind: "bag", position: [0, 0], size: [5, 5], accepts: [{}] }],
    }, /accepts/],
  ])("rejects %s", (_name, overrides, message) => {
    expect(() => normalizeManifest(manifest(overrides), BASE)).toThrow(ManifestError);
    expect(() => normalizeManifest(manifest(overrides), BASE)).toThrow(message);
  });
});
