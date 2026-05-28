import dayjs from "dayjs";
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

export const createRecruitmentFormSchema = createRecruitmentSchema
  .refine((data) => data.deadline >= dayjs().format("YYYY-MM-DD"), {
    message: "締切日は今日以降にしてください",
    path: ["deadline"],
  })
  .refine((data) => data.periodStart > dayjs().format("YYYY-MM-DD"), {
    message: "開始日は明日以降にしてください",
    path: ["periodStart"],
  });
