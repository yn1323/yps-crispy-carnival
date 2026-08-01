import { v } from "convex/values";
import { query } from "../_generated/server";
import { isShopParentActive } from "../_lib/activeShop";

/**
 * 募集情報の公開データ取得（認証不要）
 * 再発行ページのヘッダー表示用
 */
export const getRecruitmentInfo = query({
  args: { recruitmentId: v.id("recruitments") },
  returns: v.union(
    v.object({
      shopName: v.string(),
      periodStart: v.string(),
      periodEnd: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, { recruitmentId }) => {
    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted) return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || !(await isShopParentActive(ctx, shop))) return null;

    return {
      shopName: shop.name,
      periodStart: recruitment.periodStart,
      periodEnd: recruitment.periodEnd,
    };
  },
});
