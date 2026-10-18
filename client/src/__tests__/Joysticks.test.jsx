import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { JOYSTICK_IDLE_MS, Joysticks } from "../ui/Joysticks";

// Mocks nipplejs's manager the way the real library calls handlers: a single
// `evt` argument shaped { type, data }.
let managers;

vi.mock("nipplejs", () => ({
  default: {
    create: () => {
      const handlers = {};
      const manager = { handlers, on: (event, cb) => { handlers[event] = cb; }, destroy: vi.fn() };
      managers.push(manager);
      return manager;
    },
  },
}));

beforeEach(() => {
  managers = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const fire = (manager, event, data) => manager.handlers[event]({ type: event, data });
const push = (x, y, force = 1) => ({ angle: { degree: 0 }, force, vector: { x, y } });

describe("Joysticks", () => {
  it("pans with the left stick and turns and tilts with the right", () => {
    const scene = { setMotion: vi.fn() };
    render(<Joysticks scene={scene} onIdle={() => {}} />);
    const [left, right] = managers;

    fire(left, "move", push(0.5, 1, 2));
    expect(scene.setMotion).toHaveBeenLastCalledWith("joystick-pan", { pan: [0.5, 1] });

    fire(right, "move", push(1, -0.5));
    expect(scene.setMotion).toHaveBeenLastCalledWith("joystick-look", { turn: -1, tilt: -0.5 });

    fire(right, "end");
    expect(scene.setMotion).toHaveBeenLastCalledWith("joystick-look", null);
  });

  it("goes idle after 10 seconds without use, but not while a stick is held", () => {
    const onIdle = vi.fn();
    render(<Joysticks scene={{ setMotion: () => {} }} onIdle={onIdle} />);
    const [left] = managers;

    fire(left, "move", push(1, 0));
    vi.advanceTimersByTime(JOYSTICK_IDLE_MS * 2);
    expect(onIdle).not.toHaveBeenCalled();

    fire(left, "end");
    vi.advanceTimersByTime(JOYSTICK_IDLE_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it("stops the camera when hidden mid-push", () => {
    const scene = { setMotion: vi.fn() };
    const { unmount } = render(<Joysticks scene={scene} onIdle={() => {}} />);
    fire(managers[0], "move", push(1, 0));
    unmount();
    expect(scene.setMotion).toHaveBeenCalledWith("joystick-pan", null);
    expect(scene.setMotion).toHaveBeenCalledWith("joystick-look", null);
  });
});
