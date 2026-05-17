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

export type PreviousDateOnlyPattern = {
  sourceWeekStart: string;
  weekdays: number[];
};

type ShiftTypeOptionLike = {
  id: string;
  startTime: string;
  endTime: string;
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

export function buildEntriesFromPreviousWeeklyPatternForShiftTypes(
  dates: string[],
  pattern: PreviousWeeklyPattern,
  timeRange: TimeRange,
  options: ShiftTypeOptionLike[],
): DayEntry[] {
  const optionByTime = new Map(options.map((option) => [`${option.startTime}-${option.endTime}`, option]));

  return dates.map((date) => {
    const optionIds = pattern.days
      .filter((day) => day.weekday === getDayOfWeek(date))
      .map((day) => optionByTime.get(`${day.startTime}-${day.endTime}`)?.id)
      .filter((optionId): optionId is string => !!optionId);
    if (optionIds.length === 0) {
      return { date, isWorking: false, startTime: timeRange.startTime, endTime: timeRange.endTime };
    }

    const firstOption = options.find((option) => option.id === optionIds[0]);
    if (!firstOption) return { date, isWorking: false, startTime: timeRange.startTime, endTime: timeRange.endTime };

    return {
      date,
      isWorking: true,
      startTime: firstOption.startTime,
      endTime: firstOption.endTime,
      optionId: firstOption.id,
      optionIds,
    };
  });
}

export function buildEntriesFromPreviousDateOnlyPattern(
  dates: string[],
  pattern: PreviousDateOnlyPattern,
  timeRange: TimeRange,
): DayEntry[] {
  const weekdaySet = new Set(pattern.weekdays);

  return dates.map((date) =>
    weekdaySet.has(getDayOfWeek(date))
      ? { date, isWorking: true, startTime: timeRange.startTime, endTime: timeRange.endTime }
      : { date, isWorking: false, startTime: timeRange.startTime, endTime: timeRange.endTime },
  );
}
