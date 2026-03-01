/**
 * シフト提出ドメイン - クエリ（読み取り操作）
 *
 * 責務:
 * - マジックリンクからの提出ページデータ取得
 * - 募集に紐づく全申請の取得
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { getMagicLinkByToken } from "../helpers";

// 募集に紐づく全申請を取得（管理者の募集詳細ページ用）
export const listByRecruitment = query({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, args) => {
    const requests = await ctx.db
      .query("shiftRequests")
      .withIndex("by_recruitment", (q) => q.eq("recruitmentId", args.recruitmentId))
      .collect();

    return requests.map((r) => ({
      _id: r._id,
      staffId: r.staffId,
      entries: r.entries,
      submittedAt: r.submittedAt,
      updatedAt: r.updatedAt,
    }));
  },
});

// 提出ページデータ取得（マジックリンクトークンで認証）
export const getSubmitPageData = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // トークンからmagicLinkレコードとスタッフを取得
    const result = await getMagicLinkByToken(ctx, args.token);
    if (!result) {
      return { error: "INVALID_TOKEN" as const };
    }
    const { magicLink, staff } = result;

    // トークン有効期限チェック
    if (magicLink.expiresAt < Date.now()) {
      return { error: "TOKEN_EXPIRED" as const };
    }

    // 店舗情報取得
    const shop = await ctx.db.get(staff.shopId);
    if (!shop || shop.isDeleted) {
      return { error: "SHOP_NOT_FOUND" as const };
    }

    // トークンに紐づく募集を直接取得
    const recruitment = await ctx.db.get(magicLink.recruitmentId);
    if (!recruitment || recruitment.isDeleted) {
      return { error: "NO_OPEN_RECRUITMENT" as const };
    }

    // 募集ステータスに応じた分岐
    if (recruitment.status === "open") {
      const existingRequest = await ctx.db
        .query("shiftRequests")
        .withIndex("by_recruitment_and_staff", (q) => q.eq("recruitmentId", recruitment._id).eq("staffId", staff._id))
        .first();

      const allPastRequests = await ctx.db
        .query("shiftRequests")
        .withIndex("by_staff", (q) => q.eq("staffId", staff._id))
        .order("desc")
        .collect();

      const previousRequest = allPastRequests.find((r) => r.recruitmentId !== recruitment._id) ?? null;
      const frequentTimePatterns = calcFrequentTimePatterns(allPastRequests);

      return {
        error: null,
        status: "open" as const,
        staff: { _id: staff._id, displayName: staff.displayName },
        shop: { shopName: shop.shopName, timeUnit: shop.timeUnit, openTime: shop.openTime, closeTime: shop.closeTime },
        recruitment: {
          _id: recruitment._id,
          startDate: recruitment.startDate,
          endDate: recruitment.endDate,
          deadline: recruitment.deadline,
        },
        existingRequest: existingRequest
          ? {
              entries: existingRequest.entries,
              submittedAt: existingRequest.submittedAt,
              updatedAt: existingRequest.updatedAt,
            }
          : null,
        previousRequest: previousRequest ? { entries: previousRequest.entries } : null,
        frequentTimePatterns,
      };
    }

    if (recruitment.status === "confirmed") {
      const positions = await ctx.db
        .query("shopPositions")
        .withIndex("by_shop", (q) => q.eq("shopId", staff.shopId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .collect();

      const allStaffs = await ctx.db
        .query("staffs")
        .withIndex("by_shop", (q) => q.eq("shopId", staff.shopId))
        .filter((q) => q.and(q.neq(q.field("isDeleted"), true), q.neq(q.field("status"), "resigned")))
        .collect();

      const shiftRequests = await ctx.db
        .query("shiftRequests")
        .withIndex("by_recruitment", (q) => q.eq("recruitmentId", recruitment._id))
        .collect();

      const shiftAssignment = await ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitment", (q) => q.eq("recruitmentId", recruitment._id))
        .first();

      return {
        error: null,
        status: "confirmed" as const,
        staff: { _id: staff._id, displayName: staff.displayName },
        shop: { shopName: shop.shopName, timeUnit: shop.timeUnit, openTime: shop.openTime, closeTime: shop.closeTime },
        recruitment: {
          _id: recruitment._id,
          startDate: recruitment.startDate,
          endDate: recruitment.endDate,
        },
        positions: positions
          .sort((a, b) => a.order - b.order)
          .map((p) => ({ _id: p._id, name: p.name, color: p.color, order: p.order })),
        staffs: allStaffs.map((s) => ({ _id: s._id, displayName: s.displayName, status: s.status })),
        shiftRequests: shiftRequests.map((r) => ({ _id: r._id, staffId: r.staffId, entries: r.entries })),
        shiftAssignment: shiftAssignment ? { assignments: shiftAssignment.assignments } : null,
      };
    }

    if (recruitment.status === "closed") {
      return { error: "RECRUITMENT_CLOSED" as const };
    }

    return { error: "NO_OPEN_RECRUITMENT" as const };
  },
});

// 過去の全提出データから頻出の {startTime, endTime} ペアを上位3件抽出
const calcFrequentTimePatterns = (
  requests: { entries: { isAvailable: boolean; startTime?: string; endTime?: string }[] }[],
) => {
  const countMap = new Map<string, { startTime: string; endTime: string; count: number }>();

  for (const req of requests) {
    for (const entry of req.entries) {
      if (entry.isAvailable && entry.startTime && entry.endTime) {
        const key = `${entry.startTime}-${entry.endTime}`;
        const existing = countMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          countMap.set(key, { startTime: entry.startTime, endTime: entry.endTime, count: 1 });
        }
      }
    }
  }

  return [...countMap.values()].sort((a, b) => b.count - a.count).slice(0, 3);
};
