import { v } from "convex/values";
import { managerQuery } from "../_lib/functions";
import { timeToMinutes } from "../_lib/time";

const MAX_STAFFS = 200;
const MAX_SHIFT_REQUESTS = 2000;
const MAX_SHIFT_ASSIGNMENTS = 2000;

export const getShiftBoardData = managerQuery({
  args: {
    recruitmentId: v.id("recruitments"),
  },
  handler: async (ctx, args) => {
    const { shop } = ctx;
    if (!shop) return null;

    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.shopId !== shop._id) {
      return null;
    }

    const [allStaffs, shiftRequests, shiftAssignments] = await Promise.all([
      ctx.db
        .query("staffs")
        .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
        .take(MAX_STAFFS),
      ctx.db
        .query("shiftRequests")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
        .take(MAX_SHIFT_REQUESTS),
      ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
        .take(MAX_SHIFT_ASSIGNMENTS),
    ]);

    const staffs = allStaffs.filter((s) => !s.isDeleted);

    // isSubmitted: そのスタッフのshiftRequestsが1件以上あるか
    const submittedStaffIds = new Set(shiftRequests.map((r) => r.staffId));

    // TimeRange.start/end は「時」の数値を期待（9, 22 等）
    // 募集時点のスナップショットを優先し、マイグレーション未適用時のみ店舗の現在値にフォールバック
    // TODO[narrow]: m001_recruitments_add_shift_times が完走したら `?? shop.xxx` を削除。
    //   schema.ts 側で recruitments.shiftStartTime/shiftEndTime を v.string() に narrow するのと同じ PR で対応。
    const startTimeStr = recruitment.shiftStartTime ?? shop.shiftStartTime;
    const endTimeStr = recruitment.shiftEndTime ?? shop.shiftEndTime;
    const startHour = Math.floor(timeToMinutes(startTimeStr) / 60);
    const endHour = Math.ceil(timeToMinutes(endTimeStr) / 60);

    return {
      shopId: shop._id,
      recruitment: {
        _id: recruitment._id,
        periodStart: recruitment.periodStart,
        periodEnd: recruitment.periodEnd,
        status: recruitment.status,
        confirmedAt: recruitment.confirmedAt ?? null,
      },
      staffs: staffs.map((s) => ({
        _id: s._id,
        name: s.name,
        isSubmitted: submittedStaffIds.has(s._id),
      })),
      shiftRequests: shiftRequests.map((r) => ({
        staffId: r.staffId,
        date: r.date,
        startTime: r.startTime,
        endTime: r.endTime,
      })),
      shiftAssignments: shiftAssignments.map((a) => ({
        staffId: a.staffId,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
      timeRange: {
        start: startHour,
        end: endHour,
        unit: 30,
      },
    };
  },
});
