import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { RECRUITMENT_PERIOD_DAYS_MAX } from "../constants";
import { addDays, getMondayWeekStart, getWeekday } from "./dateFormat";
import { timeToMinutes } from "./time";

export type PreviousWeekdayNote = {
  weekday: number;
  note: string;
};

export type PreviousWeeklyPattern = {
  sourceWeekStart: string;
  days: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
  }>;
  notes: PreviousWeekdayNote[];
};

export type PreviousDateOnlyPattern = {
  sourceWeekStart: string;
  weekdays: number[];
  notes: PreviousWeekdayNote[];
};

/**
 * 前回の週に本人が添えた日付メモを曜日ごとに返す。
 * メモは週を含む募集から本人の分だけを引き、休みの日のメモも含める。
 */
async function getSourceWeekNotes(
  ctx: Pick<QueryCtx, "db">,
  args: {
    staffId: Id<"staffs">;
    recruitmentIds: Id<"recruitments">[];
    sourceWeekStart: string;
    sourceWeekEnd: string;
    beforeDate: string;
  },
): Promise<PreviousWeekdayNote[]> {
  const notesByRecruitment = await Promise.all(
    [...new Set(args.recruitmentIds)].map((recruitmentId) =>
      ctx.db
        .query("shiftSubmissionDateNotes")
        .withIndex("by_recruitmentId_and_staffId", (q) =>
          q.eq("recruitmentId", recruitmentId).eq("staffId", args.staffId),
        )
        .take(RECRUITMENT_PERIOD_DAYS_MAX),
    ),
  );
  return notesByRecruitment
    .flat()
    .filter(
      (entry) => entry.date >= args.sourceWeekStart && entry.date <= args.sourceWeekEnd && entry.date < args.beforeDate,
    )
    .map((entry) => ({ weekday: getWeekday(entry.date), note: entry.note }))
    .sort((a, b) => a.weekday - b.weekday);
}

function clampSlotToTimeRange(
  slot: { startTime: string; endTime: string },
  timeRange: { startTime: string; endTime: string },
) {
  const startTime =
    timeToMinutes(slot.startTime) < timeToMinutes(timeRange.startTime) ? timeRange.startTime : slot.startTime;
  const endTime = timeToMinutes(slot.endTime) > timeToMinutes(timeRange.endTime) ? timeRange.endTime : slot.endTime;
  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) return null;
  return { startTime, endTime };
}

export async function getPreviousWeeklyPattern(
  ctx: Pick<QueryCtx, "db">,
  args: {
    staffId: Id<"staffs">;
    beforeDate: string;
    timeRange: { startTime: string; endTime: string };
  },
): Promise<PreviousWeeklyPattern | null> {
  const latestPastSlot = await ctx.db
    .query("shiftSubmissionSlots")
    .withIndex("by_staffId_date", (q) => q.eq("staffId", args.staffId).lt("date", args.beforeDate))
    .order("desc")
    .first();

  if (!latestPastSlot) return null;

  const sourceWeekStart = getMondayWeekStart(latestPastSlot.date);
  const sourceWeekEnd = addDays(sourceWeekStart, 6);
  const slots = await ctx.db
    .query("shiftSubmissionSlots")
    .withIndex("by_staffId_date", (q) =>
      q.eq("staffId", args.staffId).gte("date", sourceWeekStart).lte("date", sourceWeekEnd),
    )
    .take(32);

  const days: Array<{ weekday: number; startTime: string; endTime: string }> = [];
  for (const slot of slots) {
    if (slot.date >= args.beforeDate) continue;
    const clamped = clampSlotToTimeRange(slot, args.timeRange);
    if (!clamped) continue;
    const weekday = getWeekday(slot.date);
    days.push({ weekday, ...clamped });
  }

  days.sort((a, b) => a.weekday - b.weekday || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  if (days.length === 0) return null;

  const notes = await getSourceWeekNotes(ctx, {
    staffId: args.staffId,
    recruitmentIds: slots.filter((slot) => slot.date < args.beforeDate).map((slot) => slot.recruitmentId),
    sourceWeekStart,
    sourceWeekEnd,
    beforeDate: args.beforeDate,
  });
  return { sourceWeekStart, days, notes };
}

export async function getPreviousDateOnlyPattern(
  ctx: Pick<QueryCtx, "db">,
  args: {
    staffId: Id<"staffs">;
    beforeDate: string;
  },
): Promise<PreviousDateOnlyPattern | null> {
  const latestPastDate = await ctx.db
    .query("shiftSubmissionDates")
    .withIndex("by_staffId_date", (q) => q.eq("staffId", args.staffId).lt("date", args.beforeDate))
    .order("desc")
    .first();

  if (!latestPastDate) return null;

  const sourceWeekStart = getMondayWeekStart(latestPastDate.date);
  const sourceWeekEnd = addDays(sourceWeekStart, 6);
  const dates = await ctx.db
    .query("shiftSubmissionDates")
    .withIndex("by_staffId_date", (q) =>
      q.eq("staffId", args.staffId).gte("date", sourceWeekStart).lte("date", sourceWeekEnd),
    )
    .take(32);

  const pastDates = dates.filter((entry) => entry.date < args.beforeDate);
  const weekdays = [...new Set(pastDates.map((entry) => getWeekday(entry.date)))].sort((a, b) => a - b);
  if (weekdays.length === 0) return null;

  const notes = await getSourceWeekNotes(ctx, {
    staffId: args.staffId,
    recruitmentIds: pastDates.map((entry) => entry.recruitmentId),
    sourceWeekStart,
    sourceWeekEnd,
    beforeDate: args.beforeDate,
  });
  return { sourceWeekStart, weekdays, notes };
}
