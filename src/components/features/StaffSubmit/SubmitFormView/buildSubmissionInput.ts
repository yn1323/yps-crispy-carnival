import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { DayEntry } from "../DayCard";

export type SubmitShiftSelectionInput =
  | { kind: "time"; requests: Array<{ date: string; startTime: string; endTime: string }> }
  | { kind: "dateOnly"; workingDates: string[] }
  | { kind: "shiftType"; selections: Array<{ date: string; optionId: string }> };

const getSelectedShiftTypeOptionIds = (entry: DayEntry): string[] => {
  if (entry.optionIds) return entry.optionIds;
  return entry.optionId ? [entry.optionId] : [];
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
