import { normalizeShiftDateNote } from "@/convex/shiftSubmission/schemas";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { getSelectedShiftTypeOptionIds } from "../dayEntryState";
import type { DayEntry } from "../types";

export type SubmitShiftSelectionInput =
  | { kind: "time"; requests: Array<{ date: string; startTime: string; endTime: string }> }
  | { kind: "dateOnly"; workingDates: string[] }
  | { kind: "shiftType"; selections: Array<{ date: string; optionId: string }> };

export type ShiftDateNoteInput = { date: string; note: string };

/** 提出ボタンで送る内容。日付メモは希望と同じ提出で全置換する。 */
export type SubmitShiftPayload = {
  submission: SubmitShiftSelectionInput;
  dateNotes: ShiftDateNoteInput[];
};

export const buildSubmissionInput = (
  pattern: ShiftSubmissionPattern,
  entries: DayEntry[],
): SubmitShiftSelectionInput => {
  if (pattern.kind === "dateOnly") {
    return { kind: "dateOnly", workingDates: entries.filter((entry) => entry.isWorking).map((entry) => entry.date) };
  }
  if (pattern.kind === "shiftType") {
    return {
      kind: "shiftType",
      selections: entries.flatMap((entry) => {
        const optionIds = getSelectedShiftTypeOptionIds(entry);
        if (!entry.isWorking || optionIds.length === 0) return [];
        return optionIds.map((optionId) => ({ date: entry.date, optionId }));
      }),
    };
  }
  return {
    kind: "time",
    requests: entries
      .filter((entry) => entry.isWorking)
      .map((entry) => ({ date: entry.date, startTime: entry.startTime, endTime: entry.endTime })),
  };
};

/** 提出する日付メモ。定休日と空のメモは送らない。 */
export const buildDateNotesInput = (
  dateNotes: Readonly<Record<string, string>>,
  shopClosedDates: readonly string[],
): ShiftDateNoteInput[] => {
  const shopClosedDateSet = new Set(shopClosedDates);
  return Object.entries(dateNotes)
    .map(([date, note]) => ({ date, note: normalizeShiftDateNote(note) }))
    .filter(({ date, note }) => note.length > 0 && !shopClosedDateSet.has(date))
    .sort((left, right) => left.date.localeCompare(right.date));
};
