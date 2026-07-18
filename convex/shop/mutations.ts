import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { managerMutation } from "../_lib/functions";
import { normalizeSubmissionPattern, submissionPatternValidator } from "../_lib/submissionPattern";
import { ensureDeletionCleanupJob } from "../deletionCleanup/service";
import { DELETED_SHOP_NAME } from "../deletionCleanup/tombstone";
import { updateShopSettingsSchema } from "./schemas";

const WEEKDAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// 旧deploymentのscheduled functionが持つ引数をdeploy互換で受ける。
// 進捗は新しい永続jobへ移すため、phase/cursor自体は使用しない。
const legacyShopCleanupPhaseValidator = v.union(
  v.literal("outboxPending"),
  v.literal("outboxProcessing"),
  v.literal("staffs"),
  v.literal("members"),
  v.literal("lineAccounts"),
  v.literal("sessions"),
  v.literal("magicLinks"),
  v.literal("lineLinkTokens"),
  v.literal("registrationLinks"),
);

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
  returns: v.null(),
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
    return null;
  },
});

/** legacy organizationId未設定店舗を論理削除し、永続cleanup jobへ接続する。 */
export const deleteShop = managerMutation({
  args: { confirmShopId: v.id("shops") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.confirmShopId !== ctx.shop._id) throw new ConvexError("Not found");
    if (ctx.shop.organizationId) throw new ConvexError("グループ設定から店舗を削除してください");

    await ctx.db.patch(ctx.shop._id, { isDeleted: true, name: DELETED_SHOP_NAME });
    const cleanupJob = await ensureDeletionCleanupJob(ctx, {
      scope: "shop",
      shopId: ctx.shop._id,
      requestId: `legacy-shop-delete:${ctx.shop._id}`,
    });
    await ctx.scheduler.runAfter(0, internal.deletionCleanup.mutations.kick, { jobId: cleanupJob._id });
    return null;
  },
});

/** 旧scheduled function名を維持し、未完了処理を永続jobへ引き継ぐ互換delegate。 */
export const cleanupDeletedShop = internalMutation({
  args: {
    shopId: v.id("shops"),
    phase: v.optional(legacyShopCleanupPhaseValidator),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const shop = await ctx.db.get(args.shopId);
    const cleanupJob = await ensureDeletionCleanupJob(ctx, {
      scope: "shop",
      shopId: args.shopId,
      ...(shop?.organizationId ? { organizationId: shop.organizationId } : {}),
      requestId: `legacy-shop-cleanup:${args.shopId}`,
    });
    await ctx.scheduler.runAfter(0, internal.deletionCleanup.mutations.kick, { jobId: cleanupJob._id });
    return null;
  },
});

/** processing Outbox用の旧scheduled functionも同じ永続jobへ引き継ぐ。 */
export const cleanupDeletedShopProcessingOutbox = internalMutation({
  args: { shopId: v.id("shops") },
  returns: v.null(),
  handler: async (ctx, { shopId }) => {
    const shop = await ctx.db.get(shopId);
    const cleanupJob = await ensureDeletionCleanupJob(ctx, {
      scope: "shop",
      shopId,
      ...(shop?.organizationId ? { organizationId: shop.organizationId } : {}),
      requestId: `legacy-shop-cleanup:${shopId}`,
    });
    await ctx.scheduler.runAfter(0, internal.deletionCleanup.mutations.kick, { jobId: cleanupJob._id });
    return null;
  },
});
