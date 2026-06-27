import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { managerMutation } from "../_lib/functions";
import { normalizeSubmissionPattern, submissionPatternValidator } from "../_lib/submissionPattern";
import { updateShopSettingsSchema } from "./schemas";

const WEEKDAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// 削除済み店舗の後片付け 1 バッチあたりの処理件数。Convex のトランザクション
// 読み書き上限に収まるよう控えめに設定し、超過分は runAfter で次バッチへ送る。
const SHOP_CLEANUP_BATCH_SIZE = 100;

// 後片付けの実行順。前から順に 1 フェーズずつ処理し、各フェーズを完了してから次へ進む。
const SHOP_CLEANUP_PHASES = [
  "outboxPending",
  "outboxProcessing",
  "staffs",
  "members",
  "lineAccounts",
  "sessions",
  "magicLinks",
  "lineLinkTokens",
  "registrationLinks",
] as const;
type ShopCleanupPhase = (typeof SHOP_CLEANUP_PHASES)[number];

const shopCleanupPhaseValidator = v.union(
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

function nextShopCleanupPhase(phase: ShopCleanupPhase): ShopCleanupPhase | null {
  return SHOP_CLEANUP_PHASES[SHOP_CLEANUP_PHASES.indexOf(phase) + 1] ?? null;
}

type ShopCleanupStep = { phase: ShopCleanupPhase; cursor: string | null } | null;

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
 * 店舗本体を即座に論理削除し、残りの後片付けはバックグラウンドのバッチ処理
 * （cleanupDeletedShop）へ委譲する。
 *
 * shop.isDeleted を立てた時点で manager / staff 双方の認証ラッパーが弾くため、
 * 対話的なアクセスはこの mutation 内で即座に遮断される。所属する人の論理削除や
 * トークン無効化、配信予約済み通知のキャンセルは、大規模店舗でもトランザクション
 * 上限を超えないよう分割実行する（unbounded な collect を避ける）。
 *
 * managerMutation は shopId 省略時に「先頭の所属店舗」へフォールバックするため、
 * 複数店舗マネージャーがうっかり別テナントを消す事故が起きうる。破壊的操作なので
 * 削除対象を `confirmShopId` で明示させ、解決された店舗（ctx.shop）と一致しない限り
 * 実行しない（不一致は列挙対策のため "Not found" で区別しない）。
 */
export const deleteShop = managerMutation({
  args: {
    confirmShopId: v.id("shops"),
  },
  handler: async (ctx, args) => {
    if (args.confirmShopId !== ctx.shop._id) {
      throw new ConvexError("Not found");
    }
    // shop.isDeleted を立てるだけで全認証ラッパーが弾くため、ここでアクセスは遮断される。
    await ctx.db.patch(ctx.shop._id, { isDeleted: true });
    await ctx.scheduler.runAfter(0, internal.shop.mutations.cleanupDeletedShop, { shopId: ctx.shop._id });
  },
});

/**
 * 削除済み店舗に紐づくデータをバッチで後片付けする internal mutation。
 *
 * 1 回の実行で 1 フェーズ・最大 SHOP_CLEANUP_BATCH_SIZE 件を処理し、続きがあれば
 * runAfter(0) で自分自身を再スケジュールする（pruneExpiredEvents と同じ方針）。
 * これにより、何年分ものセッション/マジックリンクを抱える店舗でも 1 トランザクション
 * の読み書き上限を超えずに完了できる。
 *
 * 対象と単調性の担保:
 * - 通知 outbox（pending/processing → failed）: worker は shop を再読込せず配信するため、
 *   削除後に予約済みシフト/登録通知が飛ばないようキャンセルする。status をインデックスに
 *   含む by_shopId_status を patch で抜けるので take + 再スケジュールで前進する。
 * - staffs / shopMembers / staffLineAccounts（isDeleted → true）: isDeleted をインデックスに
 *   含むため同様に take で前進する。
 * - sessions / magicLinks / lineLinkTokens / shopRegistrationLinks（revokedAt 付与）: revokedAt は
 *   インデックス外なので paginate のカーソルで前進する（patch しても shopId 順は不変）。
 */
export const cleanupDeletedShop = internalMutation({
  args: {
    shopId: v.id("shops"),
    phase: v.optional(shopCleanupPhaseValidator),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const phase = args.phase ?? SHOP_CLEANUP_PHASES[0];
    const next = await runShopCleanupPhase(ctx, args.shopId, phase, args.cursor ?? null);
    if (next) {
      await ctx.scheduler.runAfter(0, internal.shop.mutations.cleanupDeletedShop, {
        shopId: args.shopId,
        phase: next.phase,
        cursor: next.cursor,
      });
    }
  },
});

async function runShopCleanupPhase(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  phase: ShopCleanupPhase,
  cursor: string | null,
): Promise<ShopCleanupStep> {
  switch (phase) {
    case "outboxPending":
      return await cancelOutboxBatch(ctx, shopId, "pending", phase);
    case "outboxProcessing":
      return await cancelOutboxBatch(ctx, shopId, "processing", phase);
    case "staffs":
      return await softDeleteStaffsBatch(ctx, shopId, phase);
    case "members":
      return await softDeleteMembersBatch(ctx, shopId, phase);
    case "lineAccounts":
      return await softDeleteLineAccountsBatch(ctx, shopId, phase);
    case "sessions":
      return await revokeSessionsBatch(ctx, shopId, phase, cursor);
    case "magicLinks":
      return await revokeMagicLinksBatch(ctx, shopId, phase, cursor);
    case "lineLinkTokens":
      return await revokeLineLinkTokensBatch(ctx, shopId, phase, cursor);
    case "registrationLinks":
      return await revokeRegistrationLinksBatch(ctx, shopId, phase, cursor);
  }
}

// take 件数が満杯なら同フェーズを継続、そうでなければ次フェーズへ進む（カーソル不要）。
function advanceAfterTakeBatch(phase: ShopCleanupPhase, processed: number): ShopCleanupStep {
  if (processed === SHOP_CLEANUP_BATCH_SIZE) return { phase, cursor: null };
  const next = nextShopCleanupPhase(phase);
  return next ? { phase: next, cursor: null } : null;
}

// paginate の続きがあれば同フェーズ＋カーソルを継続、なければ次フェーズへ進む。
function advanceAfterPaginatedBatch(
  phase: ShopCleanupPhase,
  page: { isDone: boolean; continueCursor: string },
): ShopCleanupStep {
  if (!page.isDone) return { phase, cursor: page.continueCursor };
  const next = nextShopCleanupPhase(phase);
  return next ? { phase: next, cursor: null } : null;
}

async function cancelOutboxBatch(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  status: "pending" | "processing",
  phase: ShopCleanupPhase,
): Promise<ShopCleanupStep> {
  const jobs = await ctx.db
    .query("notificationOutbox")
    .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", status))
    .take(SHOP_CLEANUP_BATCH_SIZE);
  const now = Date.now();
  for (const job of jobs) {
    await ctx.db.patch(job._id, {
      status: "failed",
      failedAt: now,
      updatedAt: now,
      lastError: "shop deleted",
    });
  }
  return advanceAfterTakeBatch(phase, jobs.length);
}

async function softDeleteStaffsBatch(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  phase: ShopCleanupPhase,
): Promise<ShopCleanupStep> {
  const staffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(SHOP_CLEANUP_BATCH_SIZE);
  for (const staff of staffs) {
    await ctx.db.patch(staff._id, { isDeleted: true });
  }
  return advanceAfterTakeBatch(phase, staffs.length);
}

async function softDeleteMembersBatch(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  phase: ShopCleanupPhase,
): Promise<ShopCleanupStep> {
  const members = await ctx.db
    .query("shopMembers")
    .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(SHOP_CLEANUP_BATCH_SIZE);
  for (const member of members) {
    await ctx.db.patch(member._id, { isDeleted: true });
  }
  return advanceAfterTakeBatch(phase, members.length);
}

async function softDeleteLineAccountsBatch(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  phase: ShopCleanupPhase,
): Promise<ShopCleanupStep> {
  const accounts = await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(SHOP_CLEANUP_BATCH_SIZE);
  for (const account of accounts) {
    await ctx.db.patch(account._id, { isDeleted: true, following: false });
  }
  return advanceAfterTakeBatch(phase, accounts.length);
}

async function revokeSessionsBatch(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  phase: ShopCleanupPhase,
  cursor: string | null,
): Promise<ShopCleanupStep> {
  const now = Date.now();
  const page = await ctx.db
    .query("sessions")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .paginate({ cursor, numItems: SHOP_CLEANUP_BATCH_SIZE });
  for (const session of page.page) {
    if (!session.revokedAt) await ctx.db.patch(session._id, { revokedAt: now });
  }
  return advanceAfterPaginatedBatch(phase, page);
}

async function revokeMagicLinksBatch(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  phase: ShopCleanupPhase,
  cursor: string | null,
): Promise<ShopCleanupStep> {
  const now = Date.now();
  const page = await ctx.db
    .query("magicLinks")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .paginate({ cursor, numItems: SHOP_CLEANUP_BATCH_SIZE });
  for (const token of page.page) {
    if (!token.revokedAt) await ctx.db.patch(token._id, { revokedAt: now });
  }
  return advanceAfterPaginatedBatch(phase, page);
}

async function revokeLineLinkTokensBatch(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  phase: ShopCleanupPhase,
  cursor: string | null,
): Promise<ShopCleanupStep> {
  const now = Date.now();
  const page = await ctx.db
    .query("lineLinkTokens")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .paginate({ cursor, numItems: SHOP_CLEANUP_BATCH_SIZE });
  for (const token of page.page) {
    if (!token.revokedAt) await ctx.db.patch(token._id, { revokedAt: now });
  }
  return advanceAfterPaginatedBatch(phase, page);
}

async function revokeRegistrationLinksBatch(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  phase: ShopCleanupPhase,
  cursor: string | null,
): Promise<ShopCleanupStep> {
  const now = Date.now();
  const page = await ctx.db
    .query("shopRegistrationLinks")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .paginate({ cursor, numItems: SHOP_CLEANUP_BATCH_SIZE });
  for (const link of page.page) {
    if (!link.revokedAt) await ctx.db.patch(link._id, { revokedAt: now });
  }
  return advanceAfterPaginatedBatch(phase, page);
}
