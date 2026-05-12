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

export function buildEntriesFromPreviousWeeklyPattern(
  dates: string[],
  pattern: PreviousWeeklyPattern,
  timeRange: TimeRange,
): DayEntry[] {
  const patternByWeekday = new Map(pattern.days.map((day) => [day.weekday, day]));

  return dates.map((date) => {
    const patternDay = patternByWeekday.get(getDayOfWeek(date));
    if (!patternDay) {
      return { date, isWorking: false, startTime: timeRange.startTime, endTime: timeRange.endTime };
    }

    const clamped = clampTimeRange(patternDay, timeRange);
    if (!clamped) {
      return { date, isWorking: false, startTime: timeRange.startTime, endTime: timeRange.endTime };
    }

    return { date, isWorking: true, startTime: clamped.startTime, endTime: clamped.endTime };
  });
}
