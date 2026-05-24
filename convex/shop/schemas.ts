import { z } from "zod";
import { MAX_SHIFT_TYPE_OPTIONS } from "../_lib/submissionPatternConstants";
import { isSupportedShiftTime, timeToMinutes } from "../_lib/time";

export const regularClosedDaySchema = z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
export const regularClosedDaysSchema = z.array(regularClosedDaySchema);
export const shiftSubmissionPatternKindSchema = z.enum(["time", "dateOnly", "shiftType"]);
export const shiftTypeOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "勤務区分名を入力してください"),
  startTime: z.string().min(1, "開始時間を選択してください"),
  endTime: z.string().min(1, "終了時間を選択してください"),
  sortOrder: z.number(),
});
export const shiftSubmissionPatternSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("time"),
    startTime: z.string().min(1, "開始時間を選択してください"),
    endTime: z.string().min(1, "終了時間を選択してください"),
  }),
  z.object({ kind: z.literal("dateOnly") }),
  z.object({ kind: z.literal("shiftType"), options: z.array(shiftTypeOptionSchema) }),
]);

export type ShiftSubmissionPattern = z.infer<typeof shiftSubmissionPatternSchema>;
export type ShiftTypeOption = z.infer<typeof shiftTypeOptionSchema>;

export function addShiftSubmissionPatternIssues(
  pattern: ShiftSubmissionPattern,
  ctx: z.RefinementCtx,
  path: (string | number)[] = ["submissionPattern"],
) {
  if (pattern.kind === "time") {
    const startTimeSelected = pattern.startTime.length > 0;
    const endTimeSelected = pattern.endTime.length > 0;
    const startTimeValid = startTimeSelected && isSupportedShiftTime(pattern.startTime);
    const endTimeValid = endTimeSelected && isSupportedShiftTime(pattern.endTime);
    if (startTimeSelected && !startTimeValid) {
      ctx.addIssue({
        code: "custom",
        message: "開始時間が正しくありません",
        path: [...path, "startTime"],
      });
    }
    if (endTimeSelected && !endTimeValid) {
      ctx.addIssue({
        code: "custom",
        message: "終了時間が正しくありません",
        path: [...path, "endTime"],
      });
    }
    if (!startTimeValid || !endTimeValid) return;
    if (timeToMinutes(pattern.endTime) <= timeToMinutes(pattern.startTime)) {
      ctx.addIssue({
        code: "custom",
        message: "終了時間は開始時間より後にしてください",
        path: [...path, "endTime"],
      });
    }
    return;
  }

  if (pattern.kind !== "shiftType") return;

  const options = pattern.options;
  if (options.length === 0) {
    ctx.addIssue({
      code: "custom",
      message: "勤務区分を1つ以上追加してください",
      path: [...path, "options"],
    });
    return;
  }
  if (options.length > MAX_SHIFT_TYPE_OPTIONS) {
    ctx.addIssue({
      code: "custom",
      message: `勤務区分は${MAX_SHIFT_TYPE_OPTIONS}件まで登録できます`,
      path: [...path, "options"],
    });
  }

  const idSet = new Set<string>();
  const nameSet = new Set<string>();
  options.forEach((option, index) => {
    const name = option.name.trim();
    if (name.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "勤務区分名を入力してください",
        path: [...path, "options", index, "name"],
      });
    }
    if (idSet.has(option.id)) {
      ctx.addIssue({
        code: "custom",
        message: "勤務区分IDが重複しています",
        path: [...path, "options", index, "id"],
      });
    }
    if (name.length > 0 && nameSet.has(name)) {
      ctx.addIssue({
        code: "custom",
        message: "勤務区分名が重複しています",
        path: [...path, "options", index, "name"],
      });
    }

    const startTimeSelected = option.startTime.length > 0;
    const endTimeSelected = option.endTime.length > 0;
    const startTimeValid = startTimeSelected && isSupportedShiftTime(option.startTime);
    const endTimeValid = endTimeSelected && isSupportedShiftTime(option.endTime);
    if (startTimeSelected && !startTimeValid) {
      ctx.addIssue({
        code: "custom",
        message: "開始時間が正しくありません",
        path: [...path, "options", index, "startTime"],
      });
    }
    if (endTimeSelected && !endTimeValid) {
      ctx.addIssue({
        code: "custom",
        message: "終了時間が正しくありません",
        path: [...path, "options", index, "endTime"],
      });
    }
    if (startTimeValid && endTimeValid) {
      const start = timeToMinutes(option.startTime);
      const end = timeToMinutes(option.endTime);
      if (end <= start) {
        ctx.addIssue({
          code: "custom",
          message: "終了時間は開始時間より後にしてください",
          path: [...path, "options", index, "endTime"],
        });
      }
    }

    idSet.add(option.id);
    if (name.length > 0) nameSet.add(name);
  });
}

export const updateShopSettingsSchema = z
  .object({
    shopName: z.string().min(1),
    regularClosedDays: regularClosedDaysSchema,
    submissionPattern: shiftSubmissionPatternSchema,
  })
  .superRefine((data, ctx) => {
    addShiftSubmissionPatternIssues(data.submissionPattern, ctx);
  });

export type RegularClosedDay = z.infer<typeof regularClosedDaySchema>;
export type UpdateShopSettingsInput = z.infer<typeof updateShopSettingsSchema>;
