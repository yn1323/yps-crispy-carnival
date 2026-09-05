import { type Infer, v } from "convex/values";

const recruitmentConditionsValidator = v.object({
  periodStart: v.string(),
  periodEnd: v.string(),
  deadline: v.string(),
  shopClosedDates: v.array(v.string()),
});

// 通知が遅延しても、その編集で変わった条件を表示する。宛先・希望・tokenは保持しない。
export const recruitmentUpdateValidator = v.object({
  before: recruitmentConditionsValidator,
  after: recruitmentConditionsValidator,
});

export type RecruitmentUpdate = Infer<typeof recruitmentUpdateValidator>;
