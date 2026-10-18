import { describe, expect, it } from "vitest";
import { CameraSlots } from "../table/cameraSlots";

const view = { position: [1, 2, 3], target: [4, 5, 6] };

describe("CameraSlots", () => {
  it("saves and loads a view per slot", () => {
    const slots = new CameraSlots(localStorage, "game-1");
    slots.save("3", view);
    expect(slots.load("3")).toEqual(view);
    expect(slots.load("4")).toBeNull();
  });

  it("keeps each game's slots separate", () => {
    new CameraSlots(localStorage, "game-1").save("1", view);
    expect(new CameraSlots(localStorage, "game-2").load("1")).toBeNull();
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("simple-tabletop:camera-slots:game-1", "not json");
    expect(new CameraSlots(localStorage, "game-1").load("1")).toBeNull();
  });

  it("maps digit and numpad keys to slots, ignoring zero", () => {
    expect(CameraSlots.slotForKey({ code: "Digit1" })).toBe("1");
    expect(CameraSlots.slotForKey({ code: "Numpad9" })).toBe("9");
    expect(CameraSlots.slotForKey({ code: "Digit0" })).toBeNull();
    expect(CameraSlots.slotForKey({ code: "KeyA" })).toBeNull();
  });
});
