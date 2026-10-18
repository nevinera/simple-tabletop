import { describe, expect, it } from "vitest";
import { cameraSlotForKey, isTypingTarget, motionFromKeys } from "../table/keys";

const motion = (...codes) => motionFromKeys(new Set(codes));

describe("motionFromKeys", () => {
  it("is still with nothing pressed", () => {
    expect(motion()).toEqual({ pan: [0, 0], turn: 0, tilt: 0, zoom: 0 });
  });

  it("pans with WASD", () => {
    expect(motion("KeyW", "KeyD").pan).toEqual([1, 1]);
    expect(motion("KeyS", "KeyA").pan).toEqual([-1, -1]);
    expect(motion("KeyW", "KeyS").pan).toEqual([0, 0]);
  });

  it("turns left with Q and right with E", () => {
    expect(motion("KeyQ").turn).toBe(1);
    expect(motion("KeyE").turn).toBe(-1);
  });

  it("zooms with - and =, and tilts with them under Shift", () => {
    expect(motion("Equal")).toMatchObject({ zoom: 1, tilt: 0 });
    expect(motion("Minus")).toMatchObject({ zoom: -1, tilt: 0 });
    expect(motion("ShiftLeft", "Equal")).toMatchObject({ zoom: 0, tilt: 1 });
    expect(motion("ShiftRight", "Minus")).toMatchObject({ zoom: 0, tilt: -1 });
  });

  it("zooms with the numpad", () => {
    expect(motion("NumpadAdd").zoom).toBe(1);
    expect(motion("NumpadSubtract").zoom).toBe(-1);
  });
});

describe("cameraSlotForKey", () => {
  it("maps digit and numpad keys, including zero", () => {
    expect(cameraSlotForKey({ code: "Digit0" })).toBe("0");
    expect(cameraSlotForKey({ code: "Digit7" })).toBe("7");
    expect(cameraSlotForKey({ code: "Numpad9" })).toBe("9");
    expect(cameraSlotForKey({ code: "KeyA" })).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("spots the app's own inputs", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
