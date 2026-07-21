// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getNextJstDayStartMs, useShiftBoardDayKey } from "./useShiftBoardDayKey";

describe("useShiftBoardDayKey", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("次のJST 0:00をUnix msで返す", () => {
    expect(getNextJstDayStartMs(Date.parse("2026-07-20T12:34:56.000Z"))).toBe(
      Date.parse("2026-07-20T15:00:00.000Z"),
    );
  });

  it("JSTの日付を跨ぐとday keyを更新する", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-20T14:59:59.900Z"));
    const { result } = renderHook(() => useShiftBoardDayKey());
    expect(result.current).toBe("2026-07-20");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(101);
    });

    expect(result.current).toBe("2026-07-21");
  });
});
