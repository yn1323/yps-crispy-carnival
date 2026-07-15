import { buildRestEntry } from "./dayEntryState";
import { buildEntries } from "./timeOptions";
import type { DayEntry, SubmissionData } from "./types";

export function buildInitialEntries(dates: string[], data: SubmissionData): DayEntry[] {
  const shopClosedDateSet = new Set(data.shopClosedDates);

  if (data.submissionPattern.kind === "dateOnly" && data.existingSelection.kind === "dateOnly") {
    const workingDateSet = new Set(data.existingSelection.workingDates);
    return dates.map((date) => {
      const entry = {
        date,
        isWorking: workingDateSet.has(date),
        startTime: data.timeRange.startTime,
        endTime: data.timeRange.endTime,
      };
      return shopClosedDateSet.has(date) ? buildRestEntry(entry) : entry;
    });
  }

  if (data.submissionPattern.kind === "shiftType" && data.existingSelection.kind === "shiftType") {
    const selectionsByDate = new Map<string, string[]>();
    for (const selection of data.existingSelection.selections) {
      selectionsByDate.set(selection.date, [...(selectionsByDate.get(selection.date) ?? []), selection.optionId]);
    }
    const optionMap = new Map(data.submissionPattern.options.map((option) => [option.id, option]));

    return dates.map((date) => {
      const optionIds = (selectionsByDate.get(date) ?? []).filter((optionId) => optionMap.has(optionId));
      const firstOption = optionIds.length > 0 ? optionMap.get(optionIds[0]) : undefined;
      const entry = firstOption
        ? {
            date,
            isWorking: true,
            startTime: firstOption.startTime,
            endTime: firstOption.endTime,
            optionId: firstOption.id,
            optionIds,
          }
        : { date, isWorking: false, startTime: data.timeRange.startTime, endTime: data.timeRange.endTime };
      return shopClosedDateSet.has(date) ? buildRestEntry(entry) : entry;
    });
  }

  return buildEntries(dates, data.existingRequests, data.timeRange).map((entry) =>
    shopClosedDateSet.has(entry.date) ? buildRestEntry(entry) : entry,
  );
}
