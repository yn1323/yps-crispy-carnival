import { ConvexError, v } from "convex/values";
import { MAX_SHIFT_TYPE_OPTIONS } from "./submissionPatternConstants";
import { isSupportedShiftTime, timeToMinutes } from "./time";

export type ShiftSubmissionPattern =
  | { kind: "time"; startTime: string; endTime: string }
  | { kind: "dateOnly" }
  | { kind: "shiftType"; options: ShiftTypeOption[] };

export type ShiftTypeOption = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
};

function compareShiftTypeOptionsByTime(a: ShiftTypeOption, b: ShiftTypeOption): number {
  const startDiff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  if (startDiff !== 0) return startDiff;

  const endDiff = timeToMinutes(a.endTime) - timeToMinutes(b.endTime);
  if (endDiff !== 0) return endDiff;

  return a.sortOrder - b.sortOrder;
}

export const DEFAULT_SUBMISSION_PATTERN: ShiftSubmissionPattern = {
  kind: "time",
  startTime: "09:00",
  endTime: "22:00",
};

export const shiftTypeOptionValidator = v.object({
  id: v.string(),
  name: v.string(),
  startTime: v.string(),
  endTime: v.string(),
  sortOrder: v.number(),
});

export const submissionPatternValidator = v.union(
  v.object({ kind: v.literal("time"), startTime: v.string(), endTime: v.string() }),
  v.object({ kind: v.literal("dateOnly") }),
  v.object({ kind: v.literal("shiftType"), options: v.array(shiftTypeOptionValidator) }),
);

export function normalizeSubmissionPattern(pattern: ShiftSubmissionPattern | undefined): ShiftSubmissionPattern {
  if (!pattern) return DEFAULT_SUBMISSION_PATTERN;
  if (pattern.kind === "dateOnly") return pattern;

  if (pattern.kind === "time") {
    if (!isSupportedShiftTime(pattern.startTime) || !isSupportedShiftTime(pattern.endTime)) {
      throw new ConvexError("シフト時間が正しくありません");
    }
    if (timeToMinutes(pattern.endTime) <= timeToMinutes(pattern.startTime)) {
      throw new ConvexError("終了時間は開始時間より後にしてください");
    }
    return pattern;
  }

  const idSet = new Set<string>();
  const nameSet = new Set<string>();
  const normalized = pattern.options.map((option) => ({
    ...option,
    id: option.id.trim(),
    name: option.name.trim(),
  }));

  if (normalized.length === 0) {
    throw new ConvexError("勤務区分を1つ以上追加してください");
  }
  if (normalized.length > MAX_SHIFT_TYPE_OPTIONS) {
    throw new ConvexError(`勤務区分は${MAX_SHIFT_TYPE_OPTIONS}件まで登録できます`);
  }

  for (const option of normalized) {
    if (!option.id) throw new ConvexError("勤務区分IDが正しくありません");
    if (!option.name) throw new ConvexError("勤務区分名を入力してください");
    if (idSet.has(option.id)) throw new ConvexError("勤務区分IDが重複しています");
    if (nameSet.has(option.name)) throw new ConvexError(`勤務区分「${option.name}」が重複しています`);
    if (!isSupportedShiftTime(option.startTime) || !isSupportedShiftTime(option.endTime)) {
      throw new ConvexError(`勤務区分「${option.name}」の時間が正しくありません`);
    }

    const start = timeToMinutes(option.startTime);
    const end = timeToMinutes(option.endTime);
    if (end <= start) {
      throw new ConvexError(`勤務区分「${option.name}」の終了時間は開始時間より後にしてください`);
    }

    idSet.add(option.id);
    nameSet.add(option.name);
  }

  return {
    kind: "shiftType",
    options: normalized.sort(compareShiftTypeOptionsByTime).map((option, index) => ({ ...option, sortOrder: index })),
  };
}
