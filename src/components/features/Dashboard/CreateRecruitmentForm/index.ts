import dayjs from "dayjs";
import { isValidIsoDateString } from "@/convex/_lib/validation";
import { createRecruitmentSchema } from "@/convex/recruitment/schemas";
import type { RegularClosedDay } from "@/convex/shop/schemas";
import {
  getInclusiveDateCount as countInclusiveDates,
  deriveDatesFromWeekdays,
  pruneDatesInRange,
} from "@/src/domains/shift/date";

export {
  type CreateRecruitmentInput as CreateRecruitmentData,
  createRecruitmentSchema,
} from "@/convex/recruitment/schemas";

export const getInclusiveDateCount = countInclusiveDates;

export const pruneHolidaysInRange = (holidays: string[], startDate: string, endDate: string): string[] => {
  return pruneDatesInRange(holidays, startDate, endDate);
};

export const deriveShopClosedDatesFromRegularDays = (
  startDate: string,
  endDate: string,
  regularClosedDays: RegularClosedDay[],
): string[] => {
  return deriveDatesFromWeekdays(startDate, endDate, regularClosedDays);
};

export const createRecruitmentFormSchema = createRecruitmentSchema.superRefine((data, ctx) => {
  const today = dayjs().format("YYYY-MM-DD");
  if (isValidIsoDateString(data.deadline) && data.deadline < today) {
    ctx.addIssue({
      code: "custom",
      message: "締切日は今日以降にしてください",
      path: ["deadline"],
    });
  }
  if (isValidIsoDateString(data.periodStart) && data.periodStart <= today) {
    ctx.addIssue({
      code: "custom",
      message: "開始日は明日以降にしてください",
      path: ["periodStart"],
    });
  }
});
