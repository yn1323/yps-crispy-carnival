import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { isShopParentActive } from "../_lib/activeShop";
import { APP_URL } from "../_lib/config";
import { managerMutation } from "../_lib/functions";
import { buildLineAuthorizeUrl } from "../_lib/lineClient";
import { rateLimit } from "../_lib/rateLimits";
import { generateUUID } from "../_lib/uuid";
import { ANALYTICS_POLICY } from "../analytics/registry";
import { recordAnalyticsSourceEvent } from "../analytics/sourceEvents";
import {
  LINE_LINK_ACTIVE_TOKEN_SCAN_LIMIT,
  LINE_LINK_TOKEN_TTL_MS,
  LINE_USER_ACTIVE_ACCOUNT_MAX,
  LINE_WEBHOOK_MESSAGE_RECEIPT_PRUNE_BATCH_SIZE,
  LINE_WEBHOOK_MESSAGE_RECEIPT_RETENTION_MS,
} from "../constants";
import { type BusinessNotificationOrigin, getBusinessNotificationOrigin } from "../notificationOutbox/origin";
import { deriveOrganizationBillingPolicy } from "../organizationBilling/policy";
import { getActiveStaffInShop } from "../staff/service";
import { findStaffLineAccountsByLineUserId, getStaffLineAccount, upsertStaffLineAccount } from "./service";

type AnalyticsLineAccountChange = {
  staffId: Id<"staffs">;
  linked: boolean;
  following: boolean;
  occurredAt: number;
};

function appendAnalyticsLineAccountChange(
  changes: AnalyticsLineAccountChange[],
  change: AnalyticsLineAccountChange,
): boolean {
  if (changes.length >= ANALYTICS_POLICY.batch.sourceEvents) return false;
  changes.push(change);
  return true;
}

async function canRedeemLineLinkTokenForShop(ctx: Pick<MutationCtx, "db">, shop: Doc<"shops">) {
  const organizationId = shop.organizationId;
  if (!organizationId) return true;
  if (shop.operatingStatus !== "active") return false;

  const [organization, billingStates] = await Promise.all([
    ctx.db.get(organizationId),
    ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .take(2),
  ]);
  if (!organization || organization.isDeleted || billingStates.length > 1) return false;

  const billingState = billingStates[0];
  return billingState === undefined || deriveOrganizationBillingPolicy(billingState.state).canWriteBusinessData;
}

async function issueLinkToken(ctx: MutationCtx, args: { staffId: Id<"staffs">; shopId: Id<"shops"> }) {
  const now = Date.now();
  const activeCandidates = await ctx.db
    .query("lineLinkTokens")
    .withIndex("by_staffId_and_expiresAt", (q) => q.eq("staffId", args.staffId).gte("expiresAt", now))
    .take(LINE_LINK_ACTIVE_TOKEN_SCAN_LIMIT + 1);
  if (activeCandidates.length > LINE_LINK_ACTIVE_TOKEN_SCAN_LIMIT) {
    throw new ConvexError("LINE連携に必要な情報を発行できませんでした。");
  }
  for (const token of activeCandidates) {
    if (!token.revokedAt && !token.usedAt) {
      await ctx.db.patch(token._id, { revokedAt: now });
    }
  }

  const token = generateUUID();
  await ctx.db.insert("lineLinkTokens", {
    staffId: args.staffId,
    shopId: args.shopId,
    token,
    expiresAt: now + LINE_LINK_TOKEN_TTL_MS,
  });
  return token;
}

/**
 * シフト担当者UI: 指定スタッフに紐づくLINE連携トークンを発行
 * QRコード/連携用URLの土台。再発行時は同じスタッフの旧有効トークンを失効させる。
 *
 * 戻り値の `authorizeUrl` は LINE_LOGIN_CHANNEL_ID 未設定時は null（モック/開発時の安全弁）
 */
export const generateLinkToken = managerMutation({
  args: { staffId: v.id("staffs") },
  returns: v.object({
    token: v.string(),
    authorizeUrl: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const staff = await getActiveStaffInShop(ctx, ctx.shop._id, args.staffId);
    if (!staff) {
      throw new ConvexError("Not found");
    }

    const token = await issueLinkToken(ctx, { staffId: staff._id, shopId: staff.shopId });

    const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
    const authorizeUrl = channelId
      ? buildLineAuthorizeUrl({
          channelId,
          redirectUri: `${APP_URL}/line/callback`,
          state: token,
        })
      : null;
    return { token, authorizeUrl };
  },
});

/**
 * 内部用: lineLinkTokens を発行する（actions / mutations から呼ぶ）
 * 連携依頼メールの送信時に使う
 */
export const createLinkTokenInternal = internalMutation({
  args: { staffId: v.id("staffs"), shopId: v.id("shops") },
  handler: async (ctx, { staffId, shopId }) => {
    const [staff, shop] = await Promise.all([ctx.db.get(staffId), ctx.db.get(shopId)]);
    if (!staff || staff.isDeleted || staff.shopId !== shopId || !(await isShopParentActive(ctx, shop))) {
      throw new ConvexError("Not found");
    }
    const token = await issueLinkToken(ctx, { staffId, shopId });
    return { token };
  },
});

/**
 * LINE OAuth コールバックから呼ばれる: state（=トークン）の検証 + レートリミット
 * - レートリミット: 無効stateは固定bucket、有効stateはtoken単位で制限
 * - トークン期限切れ・使用済みは "expired"
 * - 検証OK → action 側で code 交換 → finalizeLinking
 */
export const validateLinkToken = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const links = await ctx.db
      .query("lineLinkTokens")
      .withIndex("by_token", (q) => q.eq("token", state))
      .take(2);
    if (links.length !== 1) {
      return invalidLineLinkTokenStatus(ctx);
    }
    const link = links[0];
    if (link.revokedAt || link.expiresAt < Date.now() || link.usedAt) {
      return invalidLineLinkTokenStatus(ctx);
    }
    const tokenLimit = await rateLimit(ctx, {
      name: "lineLinkRedeem",
      key: state.substring(0, 8),
    });
    if (!tokenLimit.ok) return { status: "rate_limited" as const };

    const [staff, shop] = await Promise.all([ctx.db.get(link.staffId), ctx.db.get(link.shopId)]);
    if (!staff || staff.isDeleted || staff.shopId !== link.shopId || !shop || shop.isDeleted) {
      return { status: "expired" as const };
    }
    if (!(await canRedeemLineLinkTokenForShop(ctx, shop))) {
      return { status: "expired" as const };
    }
    return {
      status: "ok" as const,
      staffId: link.staffId,
      shopId: link.shopId,
      tokenDocId: link._id,
    };
  },
});

async function invalidLineLinkTokenStatus(ctx: MutationCtx) {
  // 無効stateだけを固定bucketへ集約する。有効callbackまで匿名攻撃者のglobal budgetで停止させない。
  const globalLimit = await rateLimit(ctx, { name: "lineLinkRedeemGlobal" });
  return { status: globalLimit.ok ? ("expired" as const) : ("rate_limited" as const) };
}

/**
 * 内部用: code 交換完了後に staffs と lineLinkTokens を更新
 */
export const finalizeLinking = internalMutation({
  args: {
    staffId: v.id("staffs"),
    tokenDocId: v.id("lineLinkTokens"),
    lineUserId: v.string(),
    lineFollowing: v.boolean(),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.tokenDocId);
    if (!link || link.revokedAt || link.staffId !== args.staffId || link.expiresAt < Date.now() || link.usedAt) {
      return { status: "expired" as const };
    }
    const [staff, shop] = await Promise.all([ctx.db.get(args.staffId), ctx.db.get(link.shopId)]);
    if (!staff || staff.isDeleted || staff.shopId !== link.shopId || !shop || shop.isDeleted) {
      return { status: "expired" as const };
    }
    if (!(await canRedeemLineLinkTokenForShop(ctx, shop))) {
      return { status: "expired" as const };
    }
    const currentAccount = await getStaffLineAccount(ctx, args.staffId);

    // 同一店舗で別スタッフに同じ lineUserId が紐づいていた場合だけ付け替える
    // （真の重複/担当替え）。別店舗のアカウントは残す（同一人物の多店舗連携を許可）。
    const sameLineAccounts = await findStaffLineAccountsByLineUserId(ctx, args.lineUserId);
    if (sameLineAccounts.length > LINE_USER_ACTIVE_ACCOUNT_MAX) {
      throw new ConvexError("LINE連携を完了できませんでした。");
    }
    const duplicateAccounts = sameLineAccounts.filter(
      (account) => account.staffId !== args.staffId && account.shopId === staff.shopId,
    );
    const currentAccountUsesLineUser = sameLineAccounts.some((account) => account.staffId === args.staffId);
    const resultingAccountCount =
      sameLineAccounts.length - duplicateAccounts.length + (currentAccountUsesLineUser ? 0 : 1);
    if (
      resultingAccountCount > LINE_USER_ACTIVE_ACCOUNT_MAX ||
      duplicateAccounts.length + 1 > ANALYTICS_POLICY.batch.sourceEvents
    ) {
      throw new ConvexError("LINE連携を完了できませんでした。");
    }
    const linkedAt = Date.now();
    const analyticsAccounts: AnalyticsLineAccountChange[] = [];
    let analyticsAccountsComplete = true;
    for (const acc of sameLineAccounts) {
      if (acc.staffId !== args.staffId && acc.shopId === staff.shopId) {
        await ctx.db.patch(acc._id, { isDeleted: true, following: false });
        if (shop.organizationId) {
          analyticsAccountsComplete =
            appendAnalyticsLineAccountChange(analyticsAccounts, {
              staffId: acc.staffId,
              linked: false,
              following: false,
              occurredAt: linkedAt,
            }) && analyticsAccountsComplete;
        }
      }
    }

    const accountId = await upsertStaffLineAccount(ctx, {
      staffId: args.staffId,
      shopId: staff.shopId,
      lineUserId: args.lineUserId,
      following: args.lineFollowing,
    });
    await ctx.db.patch(args.tokenDocId, { usedAt: linkedAt });
    if (shop.organizationId) {
      analyticsAccountsComplete =
        appendAnalyticsLineAccountChange(analyticsAccounts, {
          staffId: staff._id,
          linked: true,
          following: args.lineFollowing,
          occurredAt: linkedAt,
        }) && analyticsAccountsComplete;
      await recordAnalyticsSourceEvent(ctx, {
        eventKey: `lineAccountBatch:${accountId}:linked:${linkedAt}`,
        eventType: "lineAccount.changed",
        occurredAt: linkedAt,
        payload: {
          kind: "lineAccountBatch",
          isComplete: analyticsAccountsComplete,
          accounts: analyticsAccounts,
        },
      });
    }
    const notificationOrigin = await getBusinessNotificationOrigin(ctx, {
      organizationId: shop.organizationId,
      shopId: shop._id,
    });
    if (args.lineFollowing) {
      // LINE連携直後に同意依頼を送る。未followの場合は needs_follow 画面で友だち追加を促し、
      // follow Webhook 側で同じ案内を送る。
      await ctx.scheduler.runAfter(0, internal.legal.actions.sendStaffConsentLine, {
        staffId: args.staffId,
        ...notificationOrigin,
      });
    }
    if (args.lineFollowing && !currentAccount?.following) {
      // 初回followになったタイミングだけ、現在募集中の提出リンクをLINEにも流す。
      // 既にfollow済みの再連携では重複送信しない。
      await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationLinesForStaff, {
        staffId: args.staffId,
        ...notificationOrigin,
      });
    }
    return { status: "ok" as const };
  },
});

/**
 * Webhook: follow / unfollow 状態の更新
 */
export const markFollowing = internalMutation({
  args: { staffId: v.id("staffs"), following: v.boolean() },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staffId);
    const account = await ctx.db
      .query("staffLineAccounts")
      .withIndex("by_staffId", (q) => q.eq("staffId", args.staffId))
      .first();
    const occurredAt = Date.now();
    if (account && !account.isDeleted) {
      await ctx.db.patch(account._id, { following: args.following, lastWebhookAt: occurredAt });
      await recordAnalyticsSourceEvent(ctx, {
        eventKey: `lineAccount:${account._id}:following:${occurredAt}`,
        eventType: "lineAccount.changed",
        occurredAt,
        subjectId: args.staffId,
        payload: {
          kind: "lineAccount",
          staffId: args.staffId,
          linked: true,
          following: args.following,
        },
      });
    }
    const wasFollowing = Boolean(account?.following);
    if (args.following && staff && !wasFollowing && !staff.isDeleted) {
      const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: staff.shopId });
      await ctx.scheduler.runAfter(0, internal.legal.actions.sendStaffConsentLine, {
        staffId: args.staffId,
        ...notificationOrigin,
      });
      await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationLinesForStaff, {
        staffId: args.staffId,
        ...notificationOrigin,
      });
    }
  },
});

/**
 * Webhookのfollow / unfollowをprovider event単位で処理する。
 * 一つのtransactionが一つのbounded source eventだけを追加するため、HTTP action側でbatchから分離する。
 */
type WebhookStateEvent = {
  userId: string;
  following: boolean;
  webhookEventId: string;
  timestamp: number;
};

async function processWebhookStateEvent(ctx: MutationCtx, event: WebhookStateEvent) {
  const webhookReceivedAt = Date.now();
  const accounts = await findStaffLineAccountsByLineUserId(ctx, event.userId);
  if (accounts.length > LINE_USER_ACTIVE_ACCOUNT_MAX) {
    throw new ConvexError("LINE連携状態を更新できませんでした。");
  }

  const notificationOriginByShopId = new Map<Id<"shops">, BusinessNotificationOrigin>();
  const analyticsAccounts: AnalyticsLineAccountChange[] = [];
  let analyticsAccountsComplete = true;
  for (const account of accounts) {
    const staff = await ctx.db.get(account.staffId);
    if (!staff || staff.isDeleted) continue;
    const isOlderThanStoredEvent =
      account.lastWebhookEventTimestamp !== undefined &&
      (event.timestamp < account.lastWebhookEventTimestamp ||
        (event.timestamp === account.lastWebhookEventTimestamp &&
          account.lastWebhookEventId !== undefined &&
          event.webhookEventId <= account.lastWebhookEventId));
    if (account.lastWebhookEventId === event.webhookEventId || isOlderThanStoredEvent) continue;

    const wasFollowing = Boolean(account.following);
    await ctx.db.patch(account._id, {
      following: event.following,
      lastWebhookAt: webhookReceivedAt,
      lastWebhookEventId: event.webhookEventId,
      lastWebhookEventTimestamp: event.timestamp,
    });
    analyticsAccountsComplete =
      appendAnalyticsLineAccountChange(analyticsAccounts, {
        staffId: staff._id,
        linked: true,
        following: event.following,
        // Provider時刻は重複・順序判定にだけ使い、分析上の変更は受理時刻から有効にする。
        occurredAt: webhookReceivedAt,
      }) && analyticsAccountsComplete;

    if (event.following && !wasFollowing) {
      let notificationOrigin = notificationOriginByShopId.get(staff.shopId);
      if (!notificationOrigin) {
        notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: staff.shopId });
        notificationOriginByShopId.set(staff.shopId, notificationOrigin);
      }
      await ctx.scheduler.runAfter(0, internal.legal.actions.sendStaffConsentLine, {
        staffId: staff._id,
        ...notificationOrigin,
      });
      await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationLinesForStaff, {
        staffId: staff._id,
        ...notificationOrigin,
      });
    }
  }

  if (analyticsAccounts.length > 0 || !analyticsAccountsComplete) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(event.webhookEventId));
    const eventKey = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    await recordAnalyticsSourceEvent(ctx, {
      eventKey: `lineAccountBatch:webhook:${eventKey}`,
      eventType: "lineAccount.changed",
      occurredAt: webhookReceivedAt,
      payload: { kind: "lineAccountBatch", isComplete: analyticsAccountsComplete, accounts: analyticsAccounts },
    });
  }
}

export const dispatchWebhookStateEvent = internalMutation({
  args: {
    event: v.object({
      userId: v.string(),
      following: v.boolean(),
      webhookEventId: v.string(),
      timestamp: v.number(),
    }),
  },
  handler: async (ctx, { event }) => {
    await processWebhookStateEvent(ctx, event);
    return null;
  },
});

/** message eventだけをbatch処理し、Reply API用tokenを返す。 */
export const dispatchWebhookEvents = internalMutation({
  args: {
    events: v.array(
      v.object({
        type: v.string(),
        userId: v.optional(v.string()),
        replyToken: v.optional(v.string()),
        webhookEventId: v.string(),
        timestamp: v.number(),
      }),
    ),
  },
  handler: async (ctx, { events }) => {
    const stateEvents = events.filter(
      (event): event is typeof event & { userId: string } =>
        (event.type === "follow" || event.type === "unfollow") && event.userId !== undefined,
    );
    if (stateEvents.length > 0) {
      if (stateEvents.length !== 1 || events.length !== 1) {
        throw new ConvexError("LINE連携状態を一括更新できません。");
      }
      const event = stateEvents[0];
      await processWebhookStateEvent(ctx, {
        userId: event.userId,
        following: event.type === "follow",
        webhookEventId: event.webhookEventId,
        timestamp: event.timestamp,
      });
      return { replyTokens: [] as string[] };
    }

    const webhookReceivedAt = Date.now();
    const messageEvents: typeof events = [];
    const seenEventIds = new Set<string>();
    for (const event of events) {
      if (seenEventIds.has(event.webhookEventId)) continue;
      seenEventIds.add(event.webhookEventId);
      if (
        event.type !== "message" ||
        !event.replyToken ||
        event.timestamp <= webhookReceivedAt - LINE_WEBHOOK_MESSAGE_RECEIPT_RETENTION_MS
      ) {
        continue;
      }
      const existingReceipt = await ctx.db
        .query("lineWebhookMessageReceipts")
        .withIndex("by_webhookEventId", (q) => q.eq("webhookEventId", event.webhookEventId))
        .first();
      if (!existingReceipt) messageEvents.push(event);
    }
    if (messageEvents.length === 0) return { replyTokens: [] as string[] };

    const { ok } = await rateLimit(ctx, { name: "lineWebhook", key: "global" });
    if (!ok) return { replyTokens: [] as string[] };
    const replyTokens: string[] = [];
    for (const event of messageEvents) {
      await ctx.db.insert("lineWebhookMessageReceipts", {
        webhookEventId: event.webhookEventId,
        expiresAt: webhookReceivedAt + LINE_WEBHOOK_MESSAGE_RECEIPT_RETENTION_MS,
      });
      if (event.replyToken) replyTokens.push(event.replyToken);
    }
    return { replyTokens };
  },
});

/** 期限切れmessage receiptをboundedに削除し、残件が確実にある時だけ継続を予約する。 */
export const pruneExpiredWebhookMessageReceipts = internalMutation({
  args: {},
  returns: v.object({ deletedCount: v.number(), hasMore: v.boolean() }),
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("lineWebhookMessageReceipts")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", Date.now()))
      .take(LINE_WEBHOOK_MESSAGE_RECEIPT_PRUNE_BATCH_SIZE + 1);
    const batch = expired.slice(0, LINE_WEBHOOK_MESSAGE_RECEIPT_PRUNE_BATCH_SIZE);
    for (const receipt of batch) {
      await ctx.db.delete(receipt._id);
    }

    const hasMore = expired.length > LINE_WEBHOOK_MESSAGE_RECEIPT_PRUNE_BATCH_SIZE;
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.line.mutations.pruneExpiredWebhookMessageReceipts, {});
    }
    return { deletedCount: batch.length, hasMore };
  },
});

/**
 * Quota 状態を更新（cron から呼ばれる）。常に1件だけ保持
 */
export const upsertQuotaStatus = internalMutation({
  args: {
    totalQuota: v.number(),
    consumed: v.number(),
    status: v.optional(v.union(v.literal("normal"), v.literal("exceeded"))),
    plan: v.union(v.literal("communication"), v.literal("light"), v.literal("standard")),
  },
  handler: async (ctx, args) => {
    const remaining = Math.max(args.totalQuota - args.consumed, 0);
    const status = args.status ?? (remaining <= 0 ? ("exceeded" as const) : ("normal" as const));
    const existing = await ctx.db.query("lineQuotaStatus").first();
    const payload = {
      checkedAt: Date.now(),
      totalQuota: args.totalQuota,
      consumed: args.consumed,
      remaining,
      status,
      plan: args.plan,
    };
    if (existing) {
      await ctx.db.replace(existing._id, payload);
    } else {
      await ctx.db.insert("lineQuotaStatus", payload);
    }
  },
});

/**
 * 個別: 指定スタッフへ LINE 連携依頼メールを送る
 */
export const sendInvite = managerMutation({
  args: { staffId: v.id("staffs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await getActiveStaffInShop(ctx, ctx.shop._id, args.staffId);
    if (!staff) {
      throw new ConvexError("Not found");
    }
    if (!staff.email) {
      throw new ConvexError("メールアドレスが未登録です");
    }

    const shortLimit = await rateLimit(ctx, {
      name: "lineInviteShort",
      key: `${ctx.shop._id}:${staff._id}`,
    });
    if (!shortLimit.ok) return null;
    const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: ctx.shop._id });

    await ctx.scheduler.runAfter(0, internal.line.actions.sendInviteEmail, {
      staffId: staff._id,
      ...notificationOrigin,
    });
    return null;
  },
});
