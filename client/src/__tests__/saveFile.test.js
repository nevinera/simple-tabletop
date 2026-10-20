import { describe, expect, it } from "vitest";
import { applyAction, initialState } from "../state/actions";
import { normalizeManifest } from "../manifest/manifest";
import { readSave, restoreState, saveFileName, savedTable } from "../state/saveFile";

const raw = (pieces) => ({
  formatVersion: 1, id: "cards", name: "Cards", version: "1.0.0", table: { size: [60, 60] },
  layers: [{ id: "pieces", thickness: 0.03 }],
  pieceTypes: { card: { kind: "card", size: [6, 9], back: "b.svg" } },
  pieces,
  containers: [{ id: "deck", kind: "deck", position: [30, 30], size: [6, 9], members: pieces.filter((p) => !p.position).map((p) => p.id) }],
});
const all = [
  { id: "AS", type: "card", face: "AS.svg", position: [10, 10] },
  { id: "KS", type: "card", face: "KS.svg" },
  { id: "QS", type: "card", face: "QS.svg" },
];
const manifest = normalizeManifest(raw(all), "https://example.com/cards.json");
const act = (state, action) => applyAction(manifest, state, { playerId: "me", ...action });

describe("saved tables", () => {
  it("save the table's state with nobody holding anything", () => {
    let state = act(initialState(manifest), { type: "grab", id: "AS" }).state;
    state = act(state, { type: "drag", id: "AS", x: 20, y: 20 }).state;
    const save = savedTable({ manifestUrl: "https://example.com/cards.json", manifest, state, savedAt: "2026-10-21T00:00:00Z" });
    expect(save).toMatchObject({ format: "simple-tabletop-save", moduleName: "Cards", moduleVersion: "1.0.0" });
    expect(save.state.pieces.AS).toMatchObject({ x: 10, y: 10, heldBy: null, drag: null });
    expect(save.state).not.toHaveProperty("players");
    expect(saveFileName(manifest, save.savedAt)).toBe("cards-2026-10-21.table.json");
    expect(readSave(JSON.stringify(save))).toEqual(save);
  });

  it("refuse files that aren't saved tables", () => {
    expect(() => readSave("not json")).toThrow(/isn't a saved table/);
    expect(() => readSave(JSON.stringify({ hello: 1 }))).toThrow(/isn't a saved table/);
    expect(() => readSave(JSON.stringify({ format: "simple-tabletop-save", formatVersion: 1, manifestUrl: "x", state: {} })))
      .toThrow(/missing parts/);
  });

  it("restore as they were, leaving out what the module no longer has", () => {
    let state = act(initialState(manifest), { type: "makeDeck", id: "AS", deckId: "made" }).state;
    state = act(state, { type: "draw", id: "deck", toHand: false }).state;
    const save = savedTable({ manifestUrl: "https://example.com/cards.json", manifest, state });
    const restored = restoreState(manifest, readSave(JSON.stringify(save)));
    expect(restored.dropped).toEqual([]);
    expect(restored.state.containers.made.members).toEqual(["AS"]);

    // The module dropped the ace: its card, and the deck made from it, go.
    const smaller = normalizeManifest(raw(all.slice(1)), "https://example.com/cards.json");
    const { state: trimmed, dropped } = restoreState(smaller, save);
    expect(dropped.sort()).toEqual(["AS", "made"]);
    expect(trimmed.pieces).not.toHaveProperty("AS");
    expect(trimmed.containers).not.toHaveProperty("made");
    expect(trimmed.sequence).toBe(save.state.sequence);
  });
});
