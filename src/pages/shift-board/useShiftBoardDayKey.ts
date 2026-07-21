import { useEffect, useState } from "react";
import { addDays, todayJST } from "@/src/domains/shift/date";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getNextJstDayStartMs(now: number): number {
  const [year, month, day] = addDays(todayJST(now), 1).split("-").map(Number);
  return Date.UTC(year, month - 1, day) - JST_OFFSET_MS;
}

/** Convex queryの引数をJST日付境界で変え、DB更新がなくても期間判定を再評価する。 */
export function useShiftBoardDayKey(): string {
  const [dayKey, setDayKey] = useState(() => todayJST());

  useEffect(() => {
    let timeoutId: number;
    const updateAtNextDay = () => {
      setDayKey(todayJST());
      timeoutId = window.setTimeout(updateAtNextDay, Math.max(1, getNextJstDayStartMs(Date.now()) - Date.now() + 1));
    };

    updateAtNextDay();
    return () => window.clearTimeout(timeoutId);
  }, []);

  return dayKey;
}
