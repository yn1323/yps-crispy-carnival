import { getDayOfWeek } from "@/src/domains/shift/date";
import { timeToMinutes } from "@/src/domains/shift/time";
import type { DayEntry } from "../DayCard";

export type PreviousWeeklyPattern = {
  sourceWeekStart: string;
  days: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
  }>;
};

type TimeRange = {
  startTime: string;
  endTime: string;
};

function clampTimeRange(day: { startTime: string; endTime: string }, timeRange: TimeRange) {
  const startTime =
    timeToMinutes(day.startTime) < timeToMinutes(timeRange.startTime) ? timeRange.startTime : day.startTime;
  const endTime = timeToMinutes(day.endTime) > timeToMinutes(timeRange.endTime) ? timeRange.endTime : day.endTime;
  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) return null;
  return { startTime, endTime };
}

export function buildWorkingEntryFromPreviousWeeklyPattern(
  date: string,
  pattern: PreviousWeeklyPattern,
  timeRange: TimeRange,
): DayEntry | null {
  const patternDay = pattern.days.find((day) => day.weekday === getDayOfWeek(date));
  if (!patternDay) return null;

  const clamped = clampTimeRange(patternDay, timeRange);
  if (!clamped) return null;

  return { date, isWorking: true, startTime: clamped.startTime, endTime: clamped.endTime };
}

export function buildEntriesFromPreviousWeeklyPattern(
  dates: string[],
  pattern: PreviousWeeklyPattern,
  timeRange: TimeRange,
): DayEntry[] {
  return dates.map((date) => {
    const previousEntry = buildWorkingEntryFromPreviousWeeklyPattern(date, pattern, timeRange);
    return previousEntry ?? { date, isWorking: false, startTime: timeRange.startTime, endTime: timeRange.endTime };
  });
}
