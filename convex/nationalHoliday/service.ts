import type { MutationCtx, QueryCtx } from "../_generated/server";
import { RECRUITMENT_PERIOD_DAYS_MAX } from "../constants";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

/**
 * 期間に含まれる祝日の日付を返す。期間は募集期間（最大31日）を前提にする。
 * 祝日の表は1日1件で、運営者のinternal mutationだけが書き込む。
 */
export async function listNationalHolidayDates(
  ctx: DbCtx,
  periodStart: string,
  periodEnd: string,
): Promise<Set<string>> {
  const holidays = await ctx.db
    .query("nationalHolidays")
    .withIndex("by_date", (q) => q.gte("date", periodStart).lte("date", periodEnd))
    .take(RECRUITMENT_PERIOD_DAYS_MAX);
  return new Set(holidays.map((holiday) => holiday.date));
}
