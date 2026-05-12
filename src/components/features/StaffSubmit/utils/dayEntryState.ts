import type { DayEntry } from "../DayCard";
import { buildWorkingEntryFromPreviousWeeklyPattern, type PreviousWeeklyPattern } from "./previousWeeklyPattern";

export type TimeRange = {
  startTime: string;
  endTime: string;
};

export type WorkingTime = {
  startTime: string;
  endTime: string;
};

type BuildWorkingEntryParams = {
  entry: DayEntry;
  timeRange: TimeRange;
  previousWeeklyPattern: PreviousWeeklyPattern | null;
  latestWorkingTime?: WorkingTime;
};

export function buildWorkingEntry({
  entry,
  timeRange,
  previousWeeklyPattern,
  latestWorkingTime,
}: BuildWorkingEntryParams): DayEntry {
  if (latestWorkingTime) {
    return {
      ...entry,
      isWorking: true,
      startTime: latestWorkingTime.startTime,
      endTime: latestWorkingTime.endTime,
    };
  }

  const previousEntry = previousWeeklyPattern
    ? buildWorkingEntryFromPreviousWeeklyPattern(entry.date, previousWeeklyPattern, timeRange)
    : null;

  return previousEntry ?? { ...entry, isWorking: true };
}

export function buildRestEntry(entry: DayEntry): DayEntry {
  // 休みに戻しても時間は残し、次に別日を出勤にするときの初期値として使う。
  return { ...entry, isWorking: false };
}
