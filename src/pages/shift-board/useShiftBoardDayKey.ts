import { useEffect, useState } from "react";
import { addDays, todayJST } from "@/src/domains/shift/date";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const SHIFT_BOARD_DAY_REFRESH_SAFETY_MS = 60_000;
export const SHIFT_BOARD_PERIODIC_RESYNC_MS = 5 * 60_000;

export function getNextJstDayStartMs(now: number): number {
  const [year, month, day] = addDays(todayJST(now), 1).split("-").map(Number);
  return Date.UTC(year, month - 1, day) - JST_OFFSET_MS;
}

/** client時計がserverより少し進んでいても、server側の日付変更後に再購読できる次の更新時刻。 */
export function getNextJstDayRefreshMs(now: number): number {
  const nextDayStartMs = getNextJstDayStartMs(now);
  const currentDayRefreshMs = nextDayStartMs - DAY_MS + SHIFT_BOARD_DAY_REFRESH_SAFETY_MS;
  return now < currentDayRefreshMs ? currentDayRefreshMs : nextDayStartMs + SHIFT_BOARD_DAY_REFRESH_SAFETY_MS;
}

/** client時計のずれに依存せず、server時刻での期間判定を定期的に再評価する。 */
export function getNextShiftBoardRefreshMs(now: number): number {
  return Math.min(getNextJstDayRefreshMs(now), now + SHIFT_BOARD_PERIODIC_RESYNC_MS);
}

/** Convex queryの引数をJST日付境界で変え、DB更新がなくても期間判定を再評価する。 */
export function useShiftBoardDayKey(): string {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [dayKey, setDayKey] = useState(() => `${todayJST()}:${sessionId}:0`);

  useEffect(() => {
    let timeoutId: number;
    let refreshCount = 0;
    function scheduleNextUpdate() {
      const now = Date.now();
      timeoutId = window.setTimeout(updateSubscription, Math.max(1, getNextShiftBoardRefreshMs(now) - now + 1));
    }
    function updateSubscription() {
      refreshCount += 1;
      setDayKey(`${todayJST()}:${sessionId}:${refreshCount}`);
      scheduleNextUpdate();
    }

    scheduleNextUpdate();
    return () => window.clearTimeout(timeoutId);
  }, [sessionId]);

  return dayKey;
}
