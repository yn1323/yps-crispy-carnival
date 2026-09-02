import { v } from "convex/values";
import { observedQuery as query } from "../_lib/errorObservability";
import { isShopAvailable } from "../_lib/shopAvailability";

/**
 * 募集情報の公開データ取得（認証不要）
 * 再発行ページのヘッダー表示用
 */
export const getRecruitmentInfo = query({
  args: { recruitmentId: v.string() },
  returns: v.union(
    v.object({
      recruitmentId: v.id("recruitments"),
      shopName: v.string(),
      periodStart: v.string(),
      periodEnd: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, { recruitmentId }) => {
    const normalizedInput = recruitmentId.trim();
    if (normalizedInput.length === 0 || normalizedInput.length > 128) return null;
    const normalizedRecruitmentId = ctx.db.normalizeId("recruitments", normalizedInput);
    if (!normalizedRecruitmentId) return null;

    const recruitment = await ctx.db.get(normalizedRecruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.status !== "confirmed") return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || !(await isShopAvailable(ctx, shop))) return null;

    return {
      recruitmentId: normalizedRecruitmentId,
      shopName: shop.name,
      periodStart: recruitment.periodStart,
      periodEnd: recruitment.periodEnd,
    };
  },
});
