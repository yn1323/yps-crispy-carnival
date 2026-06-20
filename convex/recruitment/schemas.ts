import { z } from "zod";
import { getInclusiveIsoDateSpanDays, isoDateStringSchema, isValidIsoDateString } from "../_lib/validation";
import { RECRUITMENT_PERIOD_DAYS_MAX } from "../constants";

const recruitmentDateSchema = isoDateStringSchema("入力してください", "日付の形式が正しくありません");

export const createRecruitmentSchema = z
  .object({
    periodStart: recruitmentDateSchema,
    periodEnd: recruitmentDateSchema,
    deadline: recruitmentDateSchema,
    shopClosedDates: z
      .array(isoDateStringSchema("定休日の日付形式が正しくありません", "定休日の日付形式が正しくありません"))
      .max(RECRUITMENT_PERIOD_DAYS_MAX, {
        message: `定休日は${RECRUITMENT_PERIOD_DAYS_MAX}件まで選択できます`,
      }),
  })
  .superRefine((data, ctx) => {
    if (
      !isValidIsoDateString(data.periodStart) ||
      !isValidIsoDateString(data.periodEnd) ||
      !isValidIsoDateString(data.deadline)
    ) {
      return;
    }

    if (data.periodEnd < data.periodStart) {
      ctx.addIssue({
        code: "custom",
        message: "終了日は開始日以降にしてください",
        path: ["periodEnd"],
      });
    }
    if (data.deadline >= data.periodStart) {
      ctx.addIssue({
        code: "custom",
        message: "締切日は開始日より前にしてください",
        path: ["deadline"],
      });
    }

    const spanDays = getInclusiveIsoDateSpanDays(data.periodStart, data.periodEnd);
    if (spanDays !== null && spanDays > RECRUITMENT_PERIOD_DAYS_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `募集期間は${RECRUITMENT_PERIOD_DAYS_MAX}日以内にしてください`,
        path: ["periodEnd"],
      });
    }
  });

export type CreateRecruitmentInput = z.infer<typeof createRecruitmentSchema>;
