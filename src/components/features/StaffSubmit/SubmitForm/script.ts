import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { buildRestEntry } from "../dayEntryState";
import {
  buildEntriesFromPreviousDateOnlyPattern,
  buildEntriesFromPreviousWeeklyPattern,
  buildEntriesFromPreviousWeeklyPatternForShiftTypes,
} from "../previousWeeklyPattern";
import type { DayEntry, SubmissionData } from "../types";

export function getInstructionText(pattern: ShiftSubmissionPattern): string {
  if (pattern.kind === "dateOnly") return "出勤できる日をタップしてください";
  if (pattern.kind === "shiftType") return "出勤できる日ごとに勤務区分を選んでください";
  return "出勤できる日をタップして、時間を選んでください";
}

export function buildPreviousPatternEntries(dates: string[], data: SubmissionData): DayEntry[] | null {
  let entries: DayEntry[] | null = null;

  if (data.submissionPattern.kind === "dateOnly") {
    entries = data.previousDateOnlyPattern
      ? buildEntriesFromPreviousDateOnlyPattern(dates, data.previousDateOnlyPattern, data.timeRange)
      : null;
  } else if (data.submissionPattern.kind === "shiftType" && data.previousWeeklyPattern) {
    entries = buildEntriesFromPreviousWeeklyPatternForShiftTypes(
      dates,
      data.previousWeeklyPattern,
      data.timeRange,
      data.submissionPattern.options,
    );
  } else if (data.previousWeeklyPattern) {
    entries = buildEntriesFromPreviousWeeklyPattern(dates, data.previousWeeklyPattern, data.timeRange);
  }

  if (!entries) return null;

  const shopClosedDateSet = new Set(data.shopClosedDates);
  return entries.map((entry) => (shopClosedDateSet.has(entry.date) ? buildRestEntry(entry) : entry));
}
