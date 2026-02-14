/**
 * シフト提出ドメイン - クエリ（読み取り操作）
 *
 * 責務:
 * - マジックリンクからの提出ページデータ取得
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { getStaffByMagicLinkToken } from "../helpers";

// 提出ページデータ取得（マジックリンクトークンで認証）
export const getSubmitPageData = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // トークンからスタッフを取得
    const staff = await getStaffByMagicLinkToken(ctx, args.token);
    if (!staff) {
      return { error: "INVALID_TOKEN" as const };
    }

    // トークン有効期限チェック
    if (staff.magicLinkExpiresAt && staff.magicLinkExpiresAt < Date.now()) {
      return { error: "TOKEN_EXPIRED" as const };
    }

    // 店舗情報取得
    const shop = await ctx.db.get(staff.shopId);
    if (!shop || shop.isDeleted) {
      return { error: "SHOP_NOT_FOUND" as const };
    }

    // オープン中の募集を取得
    const recruitment = await ctx.db
      .query("recruitments")
      .withIndex("by_shop_and_status", (q) => q.eq("shopId", staff.shopId).eq("status", "open"))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .first();

    if (!recruitment) {
      return { error: "NO_OPEN_RECRUITMENT" as const };
    }

    // 今回の募集への既存提出データ
    const existingRequest = await ctx.db
      .query("shiftRequests")
      .withIndex("by_recruitment_and_staff", (q) => q.eq("recruitmentId", recruitment._id).eq("staffId", staff._id))
      .first();

    // 前回の提出データ（今回の募集以外で最新のもの）
    const allPastRequests = await ctx.db
      .query("shiftRequests")
      .withIndex("by_staff", (q) => q.eq("staffId", staff._id))
      .order("desc")
      .collect();

    const previousRequest = allPastRequests.find((r) => r.recruitmentId !== recruitment._id) ?? null;

    // よく使う時間パターン上位3つを算出
    const frequentTimePatterns = calcFrequentTimePatterns(allPastRequests);

    return {
      error: null,
      staff: {
        _id: staff._id,
        displayName: staff.displayName,
      },
      shop: {
        shopName: shop.shopName,
        timeUnit: shop.timeUnit,
        openTime: shop.openTime,
        closeTime: shop.closeTime,
      },
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
      previousRequest: previousRequest
        ? {
            entries: previousRequest.entries,
          }
        : null,
      frequentTimePatterns,
    };
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
