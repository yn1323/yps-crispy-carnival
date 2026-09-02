// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeadlineActive } from "./useDeadlineActive";

describe("useDeadlineActive", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T12:00:00+09:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("未来のdeadlineまでactiveを維持し、ちょうど到達したら解除する", () => {
    const deadline = Date.now() + 1_000;
    const { result } = renderHook(() => useDeadlineActive(deadline));

    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(999));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it("nullと過去のdeadlineはactiveにしない", () => {
    const { result, rerender } = renderHook(({ deadline }) => useDeadlineActive(deadline), {
      initialProps: { deadline: null as number | null },
    });

    expect(result.current).toBe(false);
    rerender({ deadline: Date.now() - 1 });
    expect(result.current).toBe(false);
  });

  it("deadlineが差し替わったら旧timerを破棄して新しい期限まで待つ", () => {
    const { result, rerender } = renderHook(({ deadline }) => useDeadlineActive(deadline), {
      initialProps: { deadline: Date.now() + 1_000 },
    });
    rerender({ deadline: Date.now() + 2_000 });

    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(false);
  });

  it("timer上限より遠いdeadlineでも上限到達時に解除せず実際の期限まで待つ", () => {
    const maxTimeoutDelayMs = 2_147_483_647;
    const deadline = Date.now() + maxTimeoutDelayMs + 1_000;
    const { result } = renderHook(() => useDeadlineActive(deadline));

    act(() => vi.advanceTimersByTime(maxTimeoutDelayMs));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(999));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });
});
