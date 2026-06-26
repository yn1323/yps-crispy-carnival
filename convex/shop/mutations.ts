import { ConvexError, v } from "convex/values";
import { managerMutation } from "../_lib/functions";
import { normalizeSubmissionPattern, submissionPatternValidator } from "../_lib/submissionPattern";
import { updateShopSettingsSchema } from "./schemas";

const WEEKDAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export const updateShopSettings = managerMutation({
  args: {
    shopName: v.string(),
    regularClosedDays: v.array(
      v.union(
        v.literal("sun"),
        v.literal("mon"),
        v.literal("tue"),
        v.literal("wed"),
        v.literal("thu"),
        v.literal("fri"),
        v.literal("sat"),
      ),
    ),
    submissionPattern: submissionPatternValidator,
  },
  handler: async (ctx, args) => {
    const parsed = updateShopSettingsSchema.safeParse(args);
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }
    const input = parsed.data;
    const submissionPattern = normalizeSubmissionPattern(input.submissionPattern);
    await ctx.db.patch(ctx.shop._id, {
      name: input.shopName,
      regularClosedDays: WEEKDAY_ORDER.filter((day) => input.regularClosedDays.includes(day)),
      submissionPattern,
    });
  },
});

/**
 * 店舗を論理削除する。
 *
 * 店舗本体だけでなく「所属する人」も同時に論理削除する:
 * - staffs（スタッフ。manager 本人の staff レコードも含む）
 * - shopMembers（マネージャーの所属。users 自体は他店舗に所属しうるので消さない）
 *
 * さらに、削除済み店舗へアクセスする経路を塞ぐため、スタッフのセッション/トークン/
 * LINE 連携と、店舗への新規登録リンクを無効化する（deleteStaff と同じ方針）。
 * 物理削除はしない（論理削除パターン）。
 */
export const deleteShop = managerMutation({
  args: {},
  handler: async (ctx) => {
    const shopId = ctx.shop._id;
    const now = Date.now();

    await ctx.db.patch(shopId, { isDeleted: true });

    const [staffs, members, sessions, magicLinks, lineLinkTokens, lineAccounts, registrationLinks] = await Promise.all([
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
        .collect(),
      ctx.db
        .query("shopMembers")
        .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
        .collect(),
      ctx.db
        .query("sessions")
        .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
        .collect(),
      ctx.db
        .query("magicLinks")
        .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
        .collect(),
      ctx.db
        .query("lineLinkTokens")
        .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
        .collect(),
      ctx.db
        .query("staffLineAccounts")
        .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
        .collect(),
      ctx.db
        .query("shopRegistrationLinks")
        .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
        .collect(),
    ]);

    await Promise.all([
      ...staffs.map((staff) => ctx.db.patch(staff._id, { isDeleted: true })),
      ...members.map((member) => ctx.db.patch(member._id, { isDeleted: true })),
      ...sessions
        .filter((session) => !session.revokedAt)
        .map((session) => ctx.db.patch(session._id, { revokedAt: now })),
      ...magicLinks.filter((token) => !token.revokedAt).map((token) => ctx.db.patch(token._id, { revokedAt: now })),
      ...lineLinkTokens.filter((token) => !token.revokedAt).map((token) => ctx.db.patch(token._id, { revokedAt: now })),
      ...lineAccounts.map((account) => ctx.db.patch(account._id, { isDeleted: true, following: false })),
      ...registrationLinks.filter((link) => !link.revokedAt).map((link) => ctx.db.patch(link._id, { revokedAt: now })),
    ]);
  },
});
