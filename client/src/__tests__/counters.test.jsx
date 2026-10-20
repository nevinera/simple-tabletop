import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { applyAction, initialState } from "../state/actions";
import { normalizeManifest } from "../manifest/manifest";
import { createTableStore } from "../state/store";
import { PieceInteraction } from "../table/interaction";
import { ObjectActions } from "../ui/ObjectActions";
import { visibleSide } from "../state/visibility";
import { inkFor } from "../table/counters";

const raw = (overrides = {}) => ({
  formatVersion: 1, id: "t", name: "T", table: { size: [60, 60] },
  layers: [{ id: "pieces", thickness: 0.03 }],
  pieceTypes: { score: { kind: "counter", size: [7, 3.5], label: "Score" } },
  pieces: [{ id: "tally", type: "score", position: [20, 20], value: 3 }],
  containers: [{ id: "scores", kind: "bag", position: [40, 40], size: [8, 8], infinite: "score" }],
  ...overrides,
});
const manifest = normalizeManifest(raw(), "https://example.com/m.json");
const act = (state, action) => applyAction(manifest, state, { playerId: "me", ...action });

describe("counters", () => {
  it("start with their manifest label and value", () => {
    expect(initialState(manifest).pieces.tally).toMatchObject({ label: "Score", value: 3 });
    expect(visibleSide(manifest, initialState(manifest), "tally")).toEqual({ counter: { label: "Score", value: 3, color: "#f4f1ea" } });
  });

  it("refuse labels past 12 characters, and values that aren't whole numbers", () => {
    const bad = (piece) => () => normalizeManifest(raw({ pieces: [{ id: "x", type: "score", position: [5, 5], ...piece }] }), "https://example.com/m.json");
    expect(bad({ label: "Thirteen chrs" })).toThrow(/12 characters/);
    expect(bad({ value: 1.5 })).toThrow(/whole number/);
    expect(act(initialState(manifest), { type: "setCounter", id: "tally", label: "Thirteen chrs" }).ok).toBe(false);
    expect(act(initialState(manifest), { type: "setCounter", id: "tally", value: "4" }).ok).toBe(false);
  });

  it("change value and label, even when locked", () => {
    let state = act(initialState(manifest), { type: "lock", id: "tally" }).state;
    state = act(state, { type: "setCounter", id: "tally", value: -20 }).state;
    state = act(state, { type: "setCounter", id: "tally", label: "Ann" }).state;
    expect(state.pieces.tally).toMatchObject({ value: -20, label: "Ann" });
  });

  it("come fresh out of an infinite bag", () => {
    const state = act(initialState(manifest), { type: "draw", id: "scores" }).state;
    const id = Object.keys(state.pieces).find((key) => key.startsWith("scores#"));
    expect(state.pieces[id]).toMatchObject({ label: "Score", value: 0 });
  });

  it("pick dark or light ink for their color", () => {
    expect(inkFor("#f4f1ea")).toBe("#1f1f1f");
    expect(inkFor("#222222")).toBe("#f7f5ef");
  });
});

describe("counter controls", () => {
  function setup() {
    const store = createTableStore(manifest);
    const interaction = new PieceInteraction({
      store, manifest, playerId: "me", pick: () => null, tablePoint: () => null, clampToTable: (p) => p,
      setCameraEnabled: () => {}, setCursor: () => {},
    });
    render(<ObjectActions interaction={interaction} objectId="tally" />);
    return store;
  }

  it("adds along the top and subtracts along the bottom, keeping up between taps", () => {
    const store = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 100" }));
    fireEvent.click(screen.getByRole("button", { name: "Subtract 20" }));
    expect(store.getState().pieces.tally.value).toBe(3 + 1 + 1 + 100 - 20);
    expect(screen.getByRole("textbox", { name: "Value" }).value).toBe("85");
    const labels = screen.getAllByRole("button").map((button) => button.textContent);
    expect(labels.indexOf("+1")).toBeLessThan(labels.indexOf("−1"));
  });

  it("takes a typed label and value on Enter", () => {
    const store = setup();
    const label = screen.getByRole("textbox", { name: "Label" });
    expect(label.maxLength).toBe(12);
    fireEvent.change(label, { target: { value: "Bob" } });
    fireEvent.keyDown(label, { key: "Enter" });
    const value = screen.getByRole("textbox", { name: "Value" });
    fireEvent.change(value, { target: { value: "42" } });
    fireEvent.keyDown(value, { key: "Enter" });
    expect(store.getState().pieces.tally).toMatchObject({ label: "Bob", value: 42 });
  });
});
