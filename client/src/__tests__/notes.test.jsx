import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { applyAction, initialState } from "../state/actions";
import { normalizeManifest } from "../manifest/manifest";
import { MAX_NOTE_LENGTH, totals } from "../state/notes";
import { wrap } from "../table/notes";
import { NoteEditor, ScoreSheetEditor } from "../ui/WritingPanel";

const raw = (extra = {}) => ({
  formatVersion: 1,
  id: "notes",
  name: "Notes",
  table: { size: [60, 40] },
  layers: [{ id: "pieces", thickness: 0.4 }],
  pieces: [
    { id: "memo", kind: "note", size: [10, 7], text: "Remember the bridge", position: [15, 15] },
    { id: "scores", kind: "scoresheet", size: [10, 8], players: ["Ann", "Bo"], position: [40, 15] },
  ],
  ...extra,
});
const manifest = normalizeManifest(raw(), "https://example.com/manifest.json");
const act = (state, action) => applyAction(manifest, state, { playerId: "me", ...action });

describe("notes", () => {
  it("start with the manifest's text and take new writing, even locked, up to the limit", () => {
    let state = initialState(manifest);
    expect(state.pieces.memo.text).toBe("Remember the bridge");
    state = act(state, { type: "lock", id: "memo" }).state;
    state = act(state, { type: "setNote", id: "memo", text: "Line one\nLine two" }).state;
    expect(state.pieces.memo.text).toBe("Line one\nLine two");
    expect(act(state, { type: "setNote", id: "memo", text: "x".repeat(MAX_NOTE_LENGTH + 1) }).ok).toBe(false);
    expect(act(state, { type: "setNote", id: "scores", text: "hi" }).ok).toBe(false);
  });

  it("wrap at newlines and words, and break words too long for a line", () => {
    const ctx = { measureText: (text) => ({ width: text.length }) };
    expect(wrap(ctx, "one two three\nfour", 8)).toEqual(["one two", "three", "four"]);
    expect(wrap(ctx, "abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
    expect(wrap(ctx, "a b c d e f", 1, 3)).toEqual(["a", "b", "c"]);
  });

  it("save from the editor", () => {
    const onSave = vi.fn();
    render(<NoteEditor text="old" onSave={onSave} onClose={() => {}} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "new words" } });
    expect(screen.getByText(`9 / ${MAX_NOTE_LENGTH}`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("new words");
  });
});

describe("score sheets", () => {
  it("start with their headings and no rounds, and keep rounds that fit them", () => {
    let state = initialState(manifest);
    expect(state.pieces.scores).toMatchObject({ label: "Scores", players: ["Ann", "Bo"], rounds: [] });
    const sheet = { players: ["Ann", "Bo"], rounds: [[5, null], [-2, 7]] };
    state = act(state, { type: "setScores", id: "scores", ...sheet, label: "Hearts" }).state;
    expect(state.pieces.scores).toMatchObject({ ...sheet, label: "Hearts" });
    expect(totals(sheet.players, sheet.rounds)).toEqual([3, 7]);
    expect(act(state, { type: "setScores", id: "scores", players: ["Ann"], rounds: [[1, 2]] }).ok).toBe(false);
    expect(act(state, { type: "setScores", id: "scores", players: ["Ann", "Bo"], rounds: [[1.5, 2]] }).ok).toBe(false);
  });

  it("default to four players", () => {
    const sheet = normalizeManifest(raw({ pieces: [{ id: "s", kind: "scoresheet", size: [8, 8], position: [5, 5] }] }), "https://example.com/m.json");
    expect(sheet.pieces[0].players).toEqual(["Player 1", "Player 2", "Player 3", "Player 4"]);
  });

  it("add rounds and players in the editor, total them, and won't save a score that isn't a number", () => {
    const onSave = vi.fn();
    render(<ScoreSheetEditor sheet={{ label: "Scores", players: ["Ann", "Bo"], rounds: [[5, null]] }} onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a round" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Round 2, Ann" }), { target: { value: "-1" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Round 2, Bo" }), { target: { value: "x" } });
    expect(screen.getByRole("button", { name: "Save" }).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Round 2, Bo" }), { target: { value: "4" } });
    expect(screen.getByLabelText("Ann total").textContent).toBe("4");
    fireEvent.click(screen.getByRole("button", { name: "Add a player" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ label: "Scores", players: ["Ann", "Bo", "Player 3"], rounds: [[5, null, null], [-1, 4, null]] });
  });
});
