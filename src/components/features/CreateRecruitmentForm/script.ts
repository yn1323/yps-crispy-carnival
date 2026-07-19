import dayjs from "dayjs";
import { getInclusiveIsoDateSpanDays, isValidIsoDateString } from "@/convex/_lib/validation";
import { RECRUITMENT_PERIOD_DAYS_MAX } from "@/convex/constants";
import { createRecruitmentSchema } from "@/convex/recruitment/schemas";
import type { RegularClosedDay } from "@/convex/shop/schemas";
import {
  getInclusiveDateCount as countInclusiveDates,
  deriveDatesFromWeekdays,
  formatCompactDateListWithWeekday,
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

export const getCalendarMonthCount = (startDate?: string, endDate?: string): 1 | 2 => {
  if (!startDate || !endDate) return 1;
  return dayjs(startDate).isSame(endDate, "month") ? 1 : 2;
};

export const getPeriodSelectionMaxDate = (today: string): string =>
  dayjs(today).add(3, "month").endOf("month").format("YYYY-MM-DD");

export const getHolidaySummary = (holidays: string[]): { value: string; detail?: string } => {
  const sortedHolidays = [...holidays].sort();
  if (sortedHolidays.length === 0) {
    return { value: "なし" };
  }

  const visibleHolidays = formatCompactDateListWithWeekday(sortedHolidays.slice(0, 3));
  const hiddenCount = sortedHolidays.length - 3;
  return {
    value: `${sortedHolidays.length}日`,
    detail: hiddenCount > 0 ? `${visibleHolidays} ほか${hiddenCount}日` : visibleHolidays,
  };
};

type PeriodStepValidationInput = {
  periodStart: string;
  periodEnd: string;
  today: string;
};

type PeriodStepValidationError = {
  field: "periodStart" | "periodEnd";
  message: string;
};

export const getPeriodStepValidationError = ({
  periodStart,
  periodEnd,
  today,
}: PeriodStepValidationInput): PeriodStepValidationError | undefined => {
  if (!periodStart) {
    return { field: "periodStart", message: "開始日を選択してください" };
  }
  if (!periodEnd) {
    return { field: "periodEnd", message: "終了日を選択してください" };
  }
  if (periodEnd < periodStart) {
    return { field: "periodEnd", message: "終了日は開始日以降にしてください" };
  }
  if (periodStart <= today) {
    return { field: "periodStart", message: "開始日は明日以降にしてください" };
  }
  const spanDays = getInclusiveIsoDateSpanDays(periodStart, periodEnd);
  if (spanDays !== null && spanDays > RECRUITMENT_PERIOD_DAYS_MAX) {
    return { field: "periodEnd", message: `募集期間は${RECRUITMENT_PERIOD_DAYS_MAX}日以内にしてください` };
  }
  return undefined;
};

type DeadlineStepValidationInput = {
  deadline: string;
  periodStart?: string;
  today: string;
};

export const getDeadlineStepValidationError = ({
  deadline,
  periodStart,
  today,
}: DeadlineStepValidationInput): string | undefined => {
  if (!deadline) return "提出締切日を選択してください";
  if (deadline < today) return "締切日は今日以降にしてください";
  if (periodStart && deadline >= periodStart) return "締切日は開始日より前にしてください";
  return undefined;
};

export const isDeadlineInRange = (deadline: string, today: string, periodStart?: string): boolean =>
  !getDeadlineStepValidationError({ deadline, periodStart, today });

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
