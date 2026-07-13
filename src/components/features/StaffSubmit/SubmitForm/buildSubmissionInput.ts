import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { getSelectedShiftTypeOptionIds } from "../dayEntryState";
import type { DayEntry } from "../types";

export type SubmitShiftSelectionInput =
  | { kind: "time"; requests: Array<{ date: string; startTime: string; endTime: string }> }
  | { kind: "dateOnly"; workingDates: string[] }
  | { kind: "shiftType"; selections: Array<{ date: string; optionId: string }> };

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
