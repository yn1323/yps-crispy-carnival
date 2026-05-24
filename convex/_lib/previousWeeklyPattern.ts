import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { timeToMinutes } from "./time";

export type PreviousWeeklyPattern = {
  sourceWeekStart: string;
  days: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
  }>;
};

export type PreviousDateOnlyPattern = {
  sourceWeekStart: string;
  weekdays: number[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateToUtcMs(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function formatUtcDate(ms: number): string {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number): string {
  return formatUtcDate(dateToUtcMs(date) + days * MS_PER_DAY);
}

function getWeekday(date: string): number {
  return new Date(dateToUtcMs(date)).getUTCDay();
}

function getMondayWeekStart(date: string): string {
  const weekday = getWeekday(date);
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(date, mondayOffset);
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
  return days.length > 0 ? { sourceWeekStart, days } : null;
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

  const weekdays = [
    ...new Set(dates.filter((entry) => entry.date < args.beforeDate).map((entry) => getWeekday(entry.date))),
  ].sort((a, b) => a - b);

  return weekdays.length > 0 ? { sourceWeekStart, weekdays } : null;
}
