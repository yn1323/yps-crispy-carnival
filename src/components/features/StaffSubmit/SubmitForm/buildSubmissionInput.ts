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
  /** 計測だけに使う。前回の提出内容を反映したときだけ`true`を置き、mutationへは渡さない。 */
  usedPreviousPattern?: true;
};

export const buildSubmissionInput = (
  pattern: ShiftSubmissionPattern,
  entries: DayEntry[],
): SubmitShiftSelectionInput => {
  if (pattern.kind === "dateOnly") {
    return { kind: "dateOnly", workingDates: entries.filter((entry) => entry.isWorking).map((entry) => entry.date) };
  }
  if (pattern.kind === "shiftType") {
    // 選んだ順に左右されず同じ選択を同じ内容として比べられるよう、勤務パターンの並び順にそろえる。
    const optionOrder = new Map(pattern.options.map((option, index) => [option.id, index]));
    const byOptionOrder = (left: string, right: string) =>
      (optionOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (optionOrder.get(right) ?? Number.MAX_SAFE_INTEGER);
    return {
      kind: "shiftType",
      selections: entries.flatMap((entry) => {
        const optionIds = getSelectedShiftTypeOptionIds(entry);
        if (!entry.isWorking || optionIds.length === 0) return [];
        return [...optionIds].sort(byOptionOrder).map((optionId) => ({ date: entry.date, optionId }));
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
