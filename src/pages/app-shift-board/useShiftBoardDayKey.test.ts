// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNextJstDayRefreshMs,
  getNextJstDayStartMs,
  getNextShiftBoardRefreshMs,
  SHIFT_BOARD_DAY_REFRESH_SAFETY_MS,
  SHIFT_BOARD_PERIODIC_RESYNC_MS,
  useShiftBoardDayKey,
} from "./useShiftBoardDayKey";

const SESSION_A = "00000000-0000-4000-8000-00000000000a";
const SESSION_B = "00000000-0000-4000-8000-00000000000b";
const SESSION_C = "00000000-0000-4000-8000-00000000000c";

describe("useShiftBoardDayKey", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("次のJST 0:00をUnix msで返す", () => {
    expect(getNextJstDayStartMs(Date.parse("2026-07-20T12:34:56.000Z"))).toBe(Date.parse("2026-07-20T15:00:00.000Z"));
  });

  it("JST 0:00直後は当日分の安全マージン後を次の更新時刻にする", () => {
    expect(getNextJstDayRefreshMs(Date.parse("2026-07-20T15:00:30.000Z"))).toBe(Date.parse("2026-07-20T15:01:00.000Z"));
  });

  it("日付境界が遠い場合も周期的な再購読時刻を返す", () => {
    const now = Date.parse("2026-07-20T03:00:00.000Z");
    expect(getNextShiftBoardRefreshMs(now)).toBe(now + SHIFT_BOARD_PERIODIC_RESYNC_MS);
  });

  it("JSTの日付を跨いでも安全マージンまではday keyを更新しない", async () => {
    vi.useFakeTimers();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(SESSION_A);
    vi.setSystemTime(Date.parse("2026-07-20T14:59:59.900Z"));
    const { result } = renderHook(() => useShiftBoardDayKey());
    expect(result.current).toBe(`2026-07-20:${SESSION_A}:0`);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(101);
    });
    expect(result.current).toBe(`2026-07-20:${SESSION_A}:0`);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SHIFT_BOARD_DAY_REFRESH_SAFETY_MS);
    });
    expect(result.current).toBe(`2026-07-21:${SESSION_A}:1`);
  });

  it("安全マージン中にmountしても別keyで再購読する", async () => {
    vi.useFakeTimers();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(SESSION_B);
    vi.setSystemTime(Date.parse("2026-07-20T15:00:30.000Z"));
    const { result } = renderHook(() => useShiftBoardDayKey());
    expect(result.current).toBe(`2026-07-21:${SESSION_B}:0`);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_001);
    });
    expect(result.current).toBe(`2026-07-21:${SESSION_B}:1`);
  });

  it("client時計が安全マージンより進んでいても周期再購読で翌日まで待たない", async () => {
    vi.useFakeTimers();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(SESSION_C);
    vi.setSystemTime(Date.parse("2026-07-20T15:02:00.000Z"));
    const { result } = renderHook(() => useShiftBoardDayKey());
    expect(result.current).toBe(`2026-07-21:${SESSION_C}:0`);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SHIFT_BOARD_PERIODIC_RESYNC_MS + 1);
    });
    expect(result.current).toBe(`2026-07-21:${SESSION_C}:1`);
  });

  it("同日中に再mountしてもConvex query keyを再利用しない", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(SESSION_A).mockReturnValueOnce(SESSION_B);
    const first = renderHook(() => useShiftBoardDayKey());
    first.unmount();
    const second = renderHook(() => useShiftBoardDayKey());

    expect(first.result.current).not.toBe(second.result.current);
  });
});
