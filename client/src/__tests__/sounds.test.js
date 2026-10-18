import { describe, expect, it } from "vitest";
import { normalizeManifest } from "../manifest/manifest";
import { initialState } from "../state/actions";
import { SOUNDS, soundFor } from "../sound/sounds";

const manifest = normalizeManifest({
  formatVersion: 1,
  id: "test",
  name: "Test",
  table: { size: [90, 60] },
  layers: [{ id: "pieces", thickness: 0.03 }],
  pieces: [
    { id: "die", kind: "die", die: "d6", size: [2], position: [10, 10] },
    { id: "blue", kind: "die", die: "d20", size: [2] },
    { id: "card", kind: "card", size: [6, 9], face: "c.svg", position: [30, 30] },
  ],
  containers: [{ id: "tray", kind: "tray", position: [60, 30], size: [20, 14], members: ["blue"] }],
}, "https://example.com/m.json");
const state = initialState(manifest);
const sound = (action) => soundFor(manifest, state, action)?.sound ?? null;

describe("soundFor", () => {
  it("shakes one die, and rattles a tray's dice together", () => {
    expect(sound({ type: "roll", id: "die" })).toBe("dieShake");
    expect(sound({ type: "roll", id: "tray" })).toBe("diceShake");
  });

  it("slides a drawn card and shuffles a deck", () => {
    expect(sound({ type: "draw", id: "deck" })).toBe("cardSlide");
    expect(sound({ type: "shuffle", id: "deck" })).toBe("shuffle");
  });

  it("keeps picking up and setting down quiet and short", () => {
    expect(soundFor(manifest, state, { type: "grab", id: "die" })).toMatchObject({ sound: "diceGrab", volume: 0.12, length: 0.25 });
    expect(sound({ type: "grab", id: "card" })).toBe("cardSlide");
    expect(soundFor(manifest, state, { type: "drop", id: "card" })).toMatchObject({ sound: "cardPlace", length: 0.3 });
    expect(sound({ type: "release", id: "card" })).toBe("cardPlace");
  });

  it("stays silent for dragging and the rest", () => {
    expect(sound({ type: "drag", id: "card" })).toBeNull();
    expect(sound({ type: "flip", id: "card" })).toBeNull();
  });

  it("has a recording for every sound it names", () => {
    for (const name of ["dieShake", "diceShake", "diceGrab", "shuffle", "cardSlide", "cardPlace"]) {
      expect(SOUNDS[name].length).toBeGreaterThan(0);
    }
  });
});
