import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  SHOP_MEMBERSHIP_STATS_ACTIVE_STAFF_LIMIT,
  SHOP_MEMBERSHIP_STATS_OPEN_RECRUITMENT_LIMIT,
  SHOP_MEMBERSHIP_STATS_RECALCULATION_WORK_LIMIT,
} from "../constants";
import { isShiftTargetStaff } from "../staff/service";

const RECRUITMENT_STATS_RECALCULATION_LIMIT_ERROR =
  "募集中のシフト提出状況を安全に更新できません。\n募集またはスタッフを整理してから、もう一度お試しください。";
const RECRUITMENT_STATS_INCONSISTENCY_ERROR =
  "募集中のシフト提出状況を確認できません。\n画面を更新して、もう一度お試しください。";

type RecruitmentStatsRecalculationScope = {
  shopId: Id<"shops">;
  recruitments: Doc<"recruitments">[];
  activeShiftTargetStaffs: Doc<"staffs">[];
};

/**
 * staff所属の終了・再作成後に、旧staffの提出を履歴として残しつつ現在回答数から除外する。
 * point lookupへ進む前に全shop合計workを固定し、上限超過は同じtransactionをrollbackさせる。
 */
export async function recalculateOpenRecruitmentStatsForShops(
  ctx: Pick<MutationCtx, "db">,
  shopIds: readonly Id<"shops">[],
  now: number,
) {
  const uniqueShopIds = [...new Set(shopIds)].sort((left, right) => left.localeCompare(right));
  const scopes: RecruitmentStatsRecalculationScope[] = [];
  let totalWork = 0;

  for (const shopId of uniqueShopIds) {
    const [recruitments, activeStaffs] = await Promise.all([
      ctx.db
        .query("recruitments")
        .withIndex("by_shopId_and_isDeleted_and_status_and_periodStart", (q) =>
          q.eq("shopId", shopId).eq("isDeleted", false).eq("status", "open"),
        )
        .take(SHOP_MEMBERSHIP_STATS_OPEN_RECRUITMENT_LIMIT + 1),
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
        .take(SHOP_MEMBERSHIP_STATS_ACTIVE_STAFF_LIMIT + 1),
    ]);
    if (
      recruitments.length > SHOP_MEMBERSHIP_STATS_OPEN_RECRUITMENT_LIMIT ||
      activeStaffs.length > SHOP_MEMBERSHIP_STATS_ACTIVE_STAFF_LIMIT
    ) {
      throw new ConvexError(RECRUITMENT_STATS_RECALCULATION_LIMIT_ERROR);
    }
    const activeShiftTargetStaffs = activeStaffs.filter(isShiftTargetStaff);
    totalWork += recruitments.length * (activeShiftTargetStaffs.length + 1);
    if (totalWork > SHOP_MEMBERSHIP_STATS_RECALCULATION_WORK_LIMIT) {
      throw new ConvexError(RECRUITMENT_STATS_RECALCULATION_LIMIT_ERROR);
    }
    scopes.push({ shopId, recruitments, activeShiftTargetStaffs });
  }

  for (const scope of scopes) {
    for (const recruitment of scope.recruitments) {
      const statsRows = await ctx.db
        .query("recruitmentStats")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
        .take(2);
      if (statsRows.length > 1 || (statsRows[0] && statsRows[0].shopId !== scope.shopId)) {
        throw new ConvexError(RECRUITMENT_STATS_INCONSISTENCY_ERROR);
      }

      let submittedCount = 0;
      for (const staff of scope.activeShiftTargetStaffs) {
        const submissions = await ctx.db
          .query("shiftSubmissions")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitment._id).eq("staffId", staff._id))
          .take(2);
        if (submissions.length > 1) throw new ConvexError(RECRUITMENT_STATS_INCONSISTENCY_ERROR);
        if (submissions.length === 1) submittedCount += 1;
      }

      const activeStaffCountSnapshot = scope.activeShiftTargetStaffs.length;
      const stats = statsRows[0];
      if (stats) {
        await ctx.db.patch(stats._id, { submittedCount, activeStaffCountSnapshot, updatedAt: now });
      } else {
        await ctx.db.insert("recruitmentStats", {
          recruitmentId: recruitment._id,
          shopId: scope.shopId,
          submittedCount,
          activeStaffCountSnapshot,
          updatedAt: now,
        });
      }
    }
  }
}
