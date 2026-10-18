import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderHook } from "@testing-library/react";
import { useTableKeys } from "../useTableKeys";

let scene;
let cameraPoints;
let interaction;
let onEscape;

beforeEach(() => {
  scene = { setMotion: vi.fn() };
  cameraPoints = { jump: vi.fn(), save: vi.fn() };
  interaction = { flip: vi.fn(), rotate: vi.fn(), draw: vi.fn(), lock: vi.fn() };
  onEscape = vi.fn();
  renderHook(() => useTableKeys({ scene, cameraPoints, interaction, onEscape }));
});

const key = (code, extra = {}) => fireEvent.keyDown(window, { code, ...extra });

describe("useTableKeys", () => {
  it("flips with F, once per press", () => {
    key("KeyF");
    key("KeyF", { repeat: true });
    expect(interaction.flip).toHaveBeenCalledOnce();
  });

  it("rotates 45° with R and T, and 22.5° with Shift", () => {
    key("KeyR");
    key("KeyT");
    key("KeyR", { shiftKey: true });
    key("KeyT", { shiftKey: true });
    expect(interaction.rotate.mock.calls).toEqual([[-45], [45], [-22.5], [22.5]]);
  });

  it("draws with G, saving Shift+G for hands, and locks with L", () => {
    key("KeyG");
    key("KeyG", { shiftKey: true });
    key("KeyL");
    key("KeyL", { repeat: true });
    expect(interaction.draw).toHaveBeenCalledOnce();
    expect(interaction.lock).toHaveBeenCalledOnce();
  });

  it("jumps to and saves camera points", () => {
    key("Digit3");
    key("Digit3", { shiftKey: true });
    expect(cameraPoints.jump).toHaveBeenCalledWith("3");
    expect(cameraPoints.save).toHaveBeenCalledWith("3");
  });

  it("hands Esc to the app", () => {
    key("Escape");
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it("drives camera motion from held keys", () => {
    key("KeyW");
    expect(scene.setMotion).toHaveBeenLastCalledWith("keys", expect.objectContaining({ pan: [0, 1] }));
    fireEvent.keyUp(window, { code: "KeyW" });
    expect(scene.setMotion).toHaveBeenLastCalledWith("keys", expect.objectContaining({ pan: [0, 0] }));
  });

  it("ignores keys typed into inputs", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { code: "KeyF" });
    expect(interaction.flip).not.toHaveBeenCalled();
    input.remove();
  });
});
