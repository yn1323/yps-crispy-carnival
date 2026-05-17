import { z } from "zod";
import { timeToMinutes } from "../_lib/time";

export const regularClosedDaySchema = z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
export const regularClosedDaysSchema = z.array(regularClosedDaySchema);
export const shiftSubmissionPatternKindSchema = z.enum(["time", "dateOnly", "shiftType"]);
export const shiftTypeOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "勤務区分名を入力してください"),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  sortOrder: z.number(),
});
export const shiftSubmissionPatternSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("time"), startTime: z.string().min(1), endTime: z.string().min(1) }),
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
  if (options.length > 8) {
    ctx.addIssue({
      code: "custom",
      message: "勤務区分は8件まで登録できます",
      path: [...path, "options"],
    });
  }

  const idSet = new Set<string>();
  const nameSet = new Set<string>();
  const timeSet = new Set<string>();
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
    if (nameSet.has(name)) {
      ctx.addIssue({
        code: "custom",
        message: "勤務区分名が重複しています",
        path: [...path, "options", index, "name"],
      });
    }

    const start = timeToMinutes(option.startTime);
    const end = timeToMinutes(option.endTime);
    if (end <= start) {
      ctx.addIssue({
        code: "custom",
        message: "終了時間は開始時間より後にしてください",
        path: [...path, "options", index, "endTime"],
      });
    }
    const timeKey = `${option.startTime}-${option.endTime}`;
    if (timeSet.has(timeKey)) {
      ctx.addIssue({
        code: "custom",
        message: "勤務区分の時間帯が重複しています",
        path: [...path, "options", index, "startTime"],
      });
    }

    idSet.add(option.id);
    nameSet.add(name);
    timeSet.add(timeKey);
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
