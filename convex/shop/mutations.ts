import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { managerMutation } from "../_lib/functions";
import { normalizeSubmissionPattern, submissionPatternValidator } from "../_lib/submissionPattern";
import { recordAnalyticsSourceEvent } from "../analytics/sourceEvents";
import { ensureDeletionCleanupJob } from "../deletionCleanup/service";
import { updateShopSettingSchema, updateShopSettingsSchema } from "./schemas";

const WEEKDAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const regularClosedDaysValidator = v.array(
  v.union(
    v.literal("sun"),
    v.literal("mon"),
    v.literal("tue"),
    v.literal("wed"),
    v.literal("thu"),
    v.literal("fri"),
    v.literal("sat"),
  ),
);
const updateShopSettingValidator = v.union(
  v.object({ kind: v.literal("shopName"), shopName: v.string() }),
  v.object({ kind: v.literal("submissionPattern"), submissionPattern: submissionPatternValidator }),
  v.object({ kind: v.literal("regularClosedDays"), regularClosedDays: regularClosedDaysValidator }),
);

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
    regularClosedDays: regularClosedDaysValidator,
    submissionPattern: submissionPatternValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const parsed = updateShopSettingsSchema.safeParse(args);
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
    }
    const input = parsed.data;
    const submissionPattern = normalizeSubmissionPattern(input.submissionPattern);
    const occurredAt = Date.now();
    await ctx.db.patch(ctx.shop._id, {
      name: input.shopName,
      regularClosedDays: WEEKDAY_ORDER.filter((day) => input.regularClosedDays.includes(day)),
      submissionPattern,
    });
    if (ctx.shop.organizationId) {
      await recordAnalyticsSourceEvent(ctx, {
        eventKey: `shop:${ctx.shop._id}:updated:${crypto.randomUUID()}`,
        eventType: "shop.changed",
        occurredAt,
        organizationId: ctx.shop.organizationId,
        shopId: ctx.shop._id,
        payload: { kind: "shop", change: "updated", displayName: input.shopName },
      });
    }
    return null;
  },
});

// 個別保存時に、別項目の最新値を古いフォーム値で巻き戻さないため、選択項目だけを更新する。
// TODO[narrow]: 旧client配布終了を確認後、未参照の個別保存APIとvalidatorを削除する。
export const updateShopSetting = managerMutation({
  // managerMutation全体の旧クライアント互換fallbackは、新規APIでは許可しない。
  args: { shopId: v.id("shops"), change: updateShopSettingValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const parsed = updateShopSettingSchema.safeParse(args.change);
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
    }

    const change = parsed.data;
    switch (change.kind) {
      case "shopName":
        {
          const occurredAt = Date.now();
          await ctx.db.patch(ctx.shop._id, { name: change.shopName });
          if (ctx.shop.organizationId) {
            await recordAnalyticsSourceEvent(ctx, {
              eventKey: `shop:${ctx.shop._id}:updated:${crypto.randomUUID()}`,
              eventType: "shop.changed",
              occurredAt,
              organizationId: ctx.shop.organizationId,
              shopId: ctx.shop._id,
              payload: { kind: "shop", change: "updated", displayName: change.shopName },
            });
          }
        }
        break;
      case "submissionPattern":
        await ctx.db.patch(ctx.shop._id, {
          submissionPattern: normalizeSubmissionPattern(change.submissionPattern),
        });
        break;
      case "regularClosedDays":
        await ctx.db.patch(ctx.shop._id, {
          regularClosedDays: WEEKDAY_ORDER.filter((day) => change.regularClosedDays.includes(day)),
        });
        break;
    }
    return null;
  },
});

/**
 * legacy organizationId未設定店舗を論理削除し、永続cleanup jobへ接続する。
 * TODO[narrow]: 全deploymentでm025完走・verifyShopsの組織link残件0・旧client配布終了を確認後に削除する。
 */
export const deleteShop = managerMutation({
  args: { confirmShopId: v.id("shops") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.confirmShopId !== ctx.shop._id) throw new ConvexError("Not found");
    if (ctx.shop.organizationId) throw new ConvexError("組織設定から店舗を削除してください");

    await ctx.db.patch(ctx.shop._id, { isDeleted: true });
    const cleanupJob = await ensureDeletionCleanupJob(ctx, {
      scope: "shop",
      shopId: ctx.shop._id,
      requestId: `legacy-shop-delete:${ctx.shop._id}`,
    });
    await ctx.scheduler.runAfter(0, internal.deletionCleanup.mutations.kick, { jobId: cleanupJob._id });
    return null;
  },
});

/**
 * 旧scheduled function名を維持し、未完了処理を永続jobへ引き継ぐ互換delegate。
 * TODO[narrow]: 全deploymentで旧functionのscheduler残件0とcleanup jobの収束を確認し、
 * 旧deploymentのdrain期間が終わった後にphase validatorと共に削除する。
 */
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

/**
 * processing Outbox用の旧scheduled functionも同じ永続jobへ引き継ぐ。
 * TODO[narrow]: 全deploymentで旧functionのscheduler残件0とcleanup jobの収束を確認し、
 * 旧deploymentのdrain期間が終わった後に削除する。
 */
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
