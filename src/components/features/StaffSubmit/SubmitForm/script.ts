import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { getDayOfWeek } from "@/src/domains/shift/date";
import { buildRestEntry } from "../dayEntryState";
import {
  buildEntriesFromPreviousDateOnlyPattern,
  buildEntriesFromPreviousWeeklyPattern,
  buildEntriesFromPreviousWeeklyPatternForShiftTypes,
} from "../previousWeeklyPattern";
import type { DayEntry, SubmissionData } from "../types";

export function getInstructionText(pattern: ShiftSubmissionPattern): string {
  if (pattern.kind === "dateOnly") return "出勤できる日をタップしてください";
  if (pattern.kind === "shiftType") return "出勤できる日と勤務パターンを選んでください";
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

/** 前回の週の日付メモを、曜日の合う今回の日付へ写す。定休日には写さない。 */
export function buildPreviousPatternNotes(dates: string[], data: SubmissionData): Record<string, string> {
  const pattern =
    data.submissionPattern.kind === "dateOnly" ? data.previousDateOnlyPattern : data.previousWeeklyPattern;
  if (!pattern) return {};

  const noteByWeekday = new Map(pattern.notes.map(({ weekday, note }) => [weekday, note]));
  const shopClosedDateSet = new Set(data.shopClosedDates);
  const notes: Record<string, string> = {};
  for (const date of dates) {
    const note = noteByWeekday.get(getDayOfWeek(date));
    if (note && !shopClosedDateSet.has(date)) notes[date] = note;
  }
  return notes;
}
