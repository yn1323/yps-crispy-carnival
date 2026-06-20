import { z } from "zod";
import { MAX_SHIFT_TYPE_OPTIONS } from "../_lib/submissionPatternConstants";
import { isSupportedShiftTime, timeToMinutes } from "../_lib/time";
import { requiredDisplayTextSchema, supportedShiftTimeSchema } from "../_lib/validation";
import { SHIFT_TYPE_NAME_MAX_LENGTH, SHOP_NAME_MAX_LENGTH } from "../constants";

export const regularClosedDaySchema = z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
export const regularClosedDaysSchema = z.array(regularClosedDaySchema);
export const shiftSubmissionPatternKindSchema = z.enum(["time", "dateOnly", "shiftType"]);
export const shopNameSchema = requiredDisplayTextSchema({ label: "店舗名", maxLength: SHOP_NAME_MAX_LENGTH });
export const shiftTypeNameSchema = requiredDisplayTextSchema({
  label: "勤務区分名",
  maxLength: SHIFT_TYPE_NAME_MAX_LENGTH,
});
const startTimeSchema = supportedShiftTimeSchema("開始時間を選択してください", "開始時間が正しくありません");
const endTimeSchema = supportedShiftTimeSchema("終了時間を選択してください", "終了時間が正しくありません");
export const shiftTypeOptionSchema = z.object({
  id: z.string().min(1),
  name: shiftTypeNameSchema,
  startTime: startTimeSchema,
  endTime: endTimeSchema,
  sortOrder: z.number(),
});
export const shiftSubmissionPatternSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("time"),
    startTime: startTimeSchema,
    endTime: endTimeSchema,
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
    const startTimeValid = isSupportedShiftTime(pattern.startTime);
    const endTimeValid = isSupportedShiftTime(pattern.endTime);
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
    const name = option.name;
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

    const startTimeValid = isSupportedShiftTime(option.startTime);
    const endTimeValid = isSupportedShiftTime(option.endTime);
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
    shopName: shopNameSchema,
    regularClosedDays: regularClosedDaysSchema,
    submissionPattern: shiftSubmissionPatternSchema,
  })
  .superRefine((data, ctx) => {
    addShiftSubmissionPatternIssues(data.submissionPattern, ctx);
  });

export type RegularClosedDay = z.infer<typeof regularClosedDaySchema>;
export type UpdateShopSettingsInput = z.infer<typeof updateShopSettingsSchema>;
