import dayjs from "dayjs";
import { createRecruitmentSchema } from "@/convex/recruitment/schemas";
import type { RegularClosedDay } from "@/convex/shop/schemas";

export {
  type CreateRecruitmentInput as CreateRecruitmentData,
  createRecruitmentSchema,
} from "@/convex/recruitment/schemas";

export const getInclusiveDateCount = (startDate: string, endDate: string): number => {
  if (!startDate || !endDate) return 0;
  return dayjs(endDate).diff(dayjs(startDate), "day") + 1;
};

export const pruneHolidaysInRange = (holidays: string[], startDate: string, endDate: string): string[] => {
  if (!startDate || !endDate) return [];
  return holidays.filter((holiday) => holiday >= startDate && holiday <= endDate).sort();
};

const dayToRegularClosedDay = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export const deriveShopClosedDatesFromRegularDays = (
  startDate: string,
  endDate: string,
  regularClosedDays: RegularClosedDay[],
): string[] => {
  if (!startDate || !endDate || endDate < startDate || regularClosedDays.length === 0) return [];

  const regularClosedDaySet = new Set(regularClosedDays);
  const dates: string[] = [];
  let current = dayjs(startDate);
  const end = dayjs(endDate);

  while (current.isBefore(end) || current.isSame(end, "day")) {
    if (regularClosedDaySet.has(dayToRegularClosedDay[current.day()])) {
      dates.push(current.format("YYYY-MM-DD"));
    }
    current = current.add(1, "day");
  }

  return dates;
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
