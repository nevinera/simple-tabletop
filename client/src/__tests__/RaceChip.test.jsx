import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RaceChip } from "../ui/RaceChip";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("RaceChip", () => {
  it("says who has it for a second and a half", () => {
    const onDone = vi.fn();
    render(<RaceChip chip={{ name: "Sam", color: "#2980b9", x: 100, y: 50 }} onDone={onDone} />);
    expect(screen.getByRole("status").textContent).toBe("Sam has that");
    vi.advanceTimersByTime(1499);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalled();
  });
});
