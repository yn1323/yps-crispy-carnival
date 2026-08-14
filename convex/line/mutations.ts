import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { isShopParentActive } from "../_lib/activeShop";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { APP_URL } from "../_lib/config";
import { authenticatedMutation, managerMutation } from "../_lib/functions";
import { buildLineAuthorizeUrl } from "../_lib/lineClient";
import { rateLimit } from "../_lib/rateLimits";
import { sha256Hex } from "../_lib/sha256";
import { generateUUID } from "../_lib/uuid";
import { ANALYTICS_POLICY } from "../analytics/registry";
import { recordAnalyticsSourceEvent } from "../analytics/sourceEvents";
import {
  LINE_FRIENDSHIP_FANOUT_BATCH_SIZE,
  LINE_FRIENDSHIP_FANOUT_LEASE_MS,
  LINE_FRIENDSHIP_FANOUT_MAX_ATTEMPTS,
  LINE_FRIENDSHIP_FANOUT_PRUNE_BATCH_SIZE,
  LINE_FRIENDSHIP_FANOUT_RECOVERY_BATCH_SIZE,
  LINE_LEGACY_ACTIVE_ACCOUNT_SCAN_MAX,
  LINE_LINK_ACTIVE_TOKEN_SCAN_LIMIT,
  LINE_LINK_TOKEN_TTL_MS,
  LINE_WEBHOOK_MESSAGE_RECEIPT_PRUNE_BATCH_SIZE,
  LINE_WEBHOOK_MESSAGE_RECEIPT_RETENTION_MS,
} from "../constants";
import { type BusinessNotificationOrigin, getBusinessNotificationOrigin } from "../notificationOutbox/origin";
import { requireOrganizationActorForShop } from "../organization/access";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { organizationShopOperatingStatus } from "../organization/shopMembershipChange";
import { deriveOrganizationBillingPolicy } from "../organizationBilling/policy";
import { getActiveStaffInShop } from "../staff/service";
import {
  collectOrganizationPersonActiveLineTokens,
  disconnectOrganizationPersonLine as disconnectCanonicalOrganizationPersonLine,
  ensureFriendshipFanoutJob,
  findStaffLineAccountsByLineUserId,
  getOrganizationPersonLineRecipient,
  getStaffLineAccount,
  listActiveStaffsForOrganizationPerson,
  listOrganizationPersonStaffHistory,
  resolveCanonicalStaffScope,
  revokeOrganizationPersonLineTokens,
  tombstoneLineProviderUserIfUnreferenced,
  upsertLineProviderUser,
  upsertOrganizationPersonLineLink,
  upsertStaffLineAccount,
} from "./service";

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
  if (organizationShopOperatingStatus(shop.operatingStatus) !== "active") return false;

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
  const canonicalScope = await resolveCanonicalStaffScope(ctx, args);
  const activeCandidates = canonicalScope
    ? await collectOrganizationPersonActiveLineTokens(ctx, {
        organizationId: canonicalScope.organization._id,
        organizationPersonId: canonicalScope.person._id,
        now,
      })
    : await ctx.db
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
    ...(canonicalScope
      ? {
          organizationId: canonicalScope.organization._id,
          organizationPersonId: canonicalScope.person._id,
          lineLinkGenerationAtIssue: canonicalScope.person.lineLinkGeneration ?? 0,
        }
      : {}),
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

async function resolveCanonicalTokenScope(ctx: MutationCtx, token: Doc<"lineLinkTokens">) {
  const canonicalScope = await resolveCanonicalStaffScope(ctx, {
    staffId: token.staffId,
    shopId: token.shopId,
  });
  const snapshotValues = [token.organizationId, token.organizationPersonId, token.lineLinkGenerationAtIssue];
  const hasAnySnapshot = snapshotValues.some((value) => value !== undefined);
  const hasCompleteSnapshot = snapshotValues.every((value) => value !== undefined);
  if (hasAnySnapshot && !hasCompleteSnapshot) return { status: "invalid" as const };
  if (!canonicalScope) return hasAnySnapshot ? { status: "invalid" as const } : { status: "legacy" as const };
  if (
    hasCompleteSnapshot &&
    (token.organizationId !== canonicalScope.organization._id ||
      token.organizationPersonId !== canonicalScope.person._id ||
      token.lineLinkGenerationAtIssue !== (canonicalScope.person.lineLinkGeneration ?? 0))
  ) {
    return { status: "invalid" as const };
  }
  return { status: "canonical" as const, scope: canonicalScope };
}

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
    const canonical = await resolveCanonicalTokenScope(ctx, link);
    if (canonical.status === "invalid") return { status: "expired" as const };
    return {
      status: "ok" as const,
      staffId: link.staffId,
      shopId: link.shopId,
      tokenDocId: link._id,
      ...(canonical.status === "canonical"
        ? {
            organizationId: canonical.scope.organization._id,
            organizationPersonId: canonical.scope.person._id,
            lineLinkGenerationAtIssue: canonical.scope.person.lineLinkGeneration ?? 0,
          }
        : {}),
    };
  },
});

async function invalidLineLinkTokenStatus(ctx: MutationCtx) {
  // 無効stateだけを固定bucketへ集約する。有効callbackまで匿名攻撃者のglobal budgetで停止させない。
  const globalLimit = await rateLimit(ctx, { name: "lineLinkRedeemGlobal" });
  return { status: globalLimit.ok ? ("expired" as const) : ("rate_limited" as const) };
}

async function scheduleLineActivatedForStaff(
  ctx: MutationCtx,
  staff: Doc<"staffs">,
  args: { includeOpenRecruitments: boolean },
) {
  const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: staff.shopId });
  await ctx.scheduler.runAfter(0, internal.legal.actions.sendStaffConsentLine, {
    staffId: staff._id,
    ...notificationOrigin,
  });
  if (args.includeOpenRecruitments) {
    await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationLinesForStaff, {
      staffId: staff._id,
      ...notificationOrigin,
    });
  }
}

async function finalizeCanonicalLinking(
  ctx: MutationCtx,
  args: {
    token: Doc<"lineLinkTokens">;
    scope: NonNullable<Awaited<ReturnType<typeof resolveCanonicalStaffScope>>>;
    lineUserId: string;
    lineFollowing: boolean;
    lineFriendshipObservedAt: number;
  },
) {
  const linkedAt = Date.now();
  const priorRecipient = await getOrganizationPersonLineRecipient(ctx, {
    organizationId: args.scope.organization._id,
    organizationPersonId: args.scope.person._id,
  });
  const sameLineAccounts = await findStaffLineAccountsByLineUserId(ctx, args.lineUserId);
  if (sameLineAccounts.length > LINE_LEGACY_ACTIVE_ACCOUNT_SCAN_MAX) {
    throw new ConvexError("LINE連携を完了できませんでした。");
  }
  for (const account of sameLineAccounts) {
    const accountStaff = await ctx.db.get(account.staffId);
    if (!accountStaff || accountStaff.isDeleted) continue;
    const accountShop = await ctx.db.get(accountStaff.shopId);
    if (!accountShop || accountShop.isDeleted) continue;
    const accountOrganizationId = accountStaff.organizationId ?? accountShop.organizationId;
    if (accountOrganizationId !== args.scope.organization._id) continue;
    if (accountShop.organizationId !== args.scope.organization._id) {
      throw new ConvexError("LINE連携を完了できませんでした。");
    }
    if (accountStaff.organizationPersonId !== args.scope.person._id) {
      // 同じorganizationの別人物からLINE IDを自動で奪わない。
      throw new ConvexError("LINE連携を完了できませんでした。");
    }
  }

  const providerObservation = await upsertLineProviderUser(ctx, {
    lineUserId: args.lineUserId,
    following: args.lineFollowing,
    observedAt: args.lineFriendshipObservedAt,
    source: "oauth",
  });
  const link = await upsertOrganizationPersonLineLink(ctx, {
    organizationId: args.scope.organization._id,
    organizationPersonId: args.scope.person._id,
    lineProviderUserId: providerObservation.provider._id,
    linkedAt,
  });
  const activeStaffs = await listActiveStaffsForOrganizationPerson(ctx, {
    organizationId: args.scope.organization._id,
    organizationPersonId: args.scope.person._id,
  });
  if (activeStaffs.length === 0) throw new ConvexError("LINE連携を完了できませんでした。");
  const effectiveFollowing = providerObservation.provider.following;

  // 段階経路のlegacy readを正本として維持するため、同じ人物の全店舗staffへprojectionする。
  for (const account of sameLineAccounts) {
    if (account.following !== effectiveFollowing) {
      await ctx.db.patch(account._id, { following: effectiveFollowing });
    }
  }
  for (const staff of activeStaffs) {
    await upsertStaffLineAccount(ctx, {
      staffId: staff._id,
      shopId: staff.shopId,
      lineUserId: args.lineUserId,
      following: effectiveFollowing,
    });
  }

  await ctx.db.patch(args.token._id, { usedAt: linkedAt });
  await revokeOrganizationPersonLineTokens(ctx, {
    organizationPersonId: args.scope.person._id,
    occurredAt: linkedAt,
    exceptTokenId: args.token._id,
  });
  if (link.replacedProviderUserId) {
    await tombstoneLineProviderUserIfUnreferenced(ctx, link.replacedProviderUserId);
  }

  const fanoutJobId = await ensureFriendshipFanoutJob(ctx, {
    provider: providerObservation.provider,
    stateChanged: providerObservation.stateChanged,
  });
  if (fanoutJobId) {
    await ctx.scheduler.runAfter(0, internal.line.mutations.kickFriendshipFanoutJob, { jobId: fanoutJobId });
  } else {
    const analyticsAccounts: AnalyticsLineAccountChange[] = activeStaffs.map((staff) => ({
      staffId: staff._id,
      linked: true,
      following: effectiveFollowing,
      occurredAt: linkedAt,
    }));
    await recordAnalyticsSourceEvent(ctx, {
      eventKey: `lineAccountBatch:${link.linkId}:linked:${linkedAt}`,
      eventType: "lineAccount.changed",
      occurredAt: linkedAt,
      payload: {
        kind: "lineAccountBatch",
        isComplete: analyticsAccounts.length <= ANALYTICS_POLICY.batch.sourceEvents,
        accounts: analyticsAccounts.slice(0, ANALYTICS_POLICY.batch.sourceEvents),
      },
    });
    if (effectiveFollowing) {
      const includeOpenRecruitments = priorRecipient?.following !== true;
      for (const staff of activeStaffs) {
        await scheduleLineActivatedForStaff(ctx, staff, { includeOpenRecruitments });
      }
    }
  }
  return { status: "ok" as const, following: effectiveFollowing };
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
    // Widen前のinternal test/callerはmutation開始時刻を使う。公開OAuth actionは取得直後の時刻を必ず渡す。
    lineFriendshipObservedAt: v.optional(v.number()),
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
    const canonical = await resolveCanonicalTokenScope(ctx, link);
    if (canonical.status === "invalid") return { status: "expired" as const };
    if (canonical.status === "canonical") {
      const result = await finalizeCanonicalLinking(ctx, {
        token: link,
        scope: canonical.scope,
        lineUserId: args.lineUserId,
        lineFollowing: args.lineFollowing,
        lineFriendshipObservedAt: args.lineFriendshipObservedAt ?? Date.now(),
      });
      return args.lineFriendshipObservedAt === undefined ? { status: result.status } : result;
    }
    const currentAccount = await getStaffLineAccount(ctx, args.staffId);

    // 同一店舗で別スタッフに同じ lineUserId が紐づいていた場合だけ付け替える
    // （真の重複/担当替え）。別店舗のアカウントは残す（同一人物の多店舗連携を許可）。
    const sameLineAccounts = await findStaffLineAccountsByLineUserId(ctx, args.lineUserId);
    if (sameLineAccounts.length > LINE_LEGACY_ACTIVE_ACCOUNT_SCAN_MAX) {
      throw new ConvexError("LINE連携を完了できませんでした。");
    }
    const duplicateAccounts = sameLineAccounts.filter(
      (account) => account.staffId !== args.staffId && account.shopId === staff.shopId,
    );
    const currentAccountUsesLineUser = sameLineAccounts.some((account) => account.staffId === args.staffId);
    const resultingAccountCount =
      sameLineAccounts.length - duplicateAccounts.length + (currentAccountUsesLineUser ? 0 : 1);
    if (
      resultingAccountCount > LINE_LEGACY_ACTIVE_ACCOUNT_SCAN_MAX ||
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
    return args.lineFriendshipObservedAt === undefined
      ? { status: "ok" as const }
      : { status: "ok" as const, following: args.lineFollowing };
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
  if (accounts.length > LINE_LEGACY_ACTIVE_ACCOUNT_SCAN_MAX) {
    throw new ConvexError("LINE連携状態を更新できませんでした。");
  }
  const existingProviders = await ctx.db
    .query("lineProviderUsers")
    .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", event.userId).eq("isDeleted", false))
    .take(2);
  if (existingProviders.length > 1) throw new ConvexError("LINE連携状態を更新できませんでした。");
  // 未連携のLINE利用者から届いたeventは永続化しない。
  if (accounts.length === 0 && existingProviders.length === 0) return;
  const providerObservation = await upsertLineProviderUser(ctx, {
    lineUserId: event.userId,
    following: event.following,
    observedAt: event.timestamp,
    source: "webhook",
    webhookReceivedAt,
    webhookEventId: event.webhookEventId,
    webhookEventTimestamp: event.timestamp,
  });
  if (!providerObservation.accepted) return;
  const fanoutJobId = await ensureFriendshipFanoutJob(ctx, {
    provider: providerObservation.provider,
    stateChanged: providerObservation.stateChanged,
  });
  if (fanoutJobId) {
    await ctx.scheduler.runAfter(0, internal.line.mutations.kickFriendshipFanoutJob, { jobId: fanoutJobId });
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

    const canonicalScope = await resolveCanonicalStaffScope(ctx, { staffId: staff._id, shopId: staff.shopId });
    const canonicalRecipient = canonicalScope
      ? await getOrganizationPersonLineRecipient(ctx, {
          organizationId: canonicalScope.organization._id,
          organizationPersonId: canonicalScope.person._id,
        })
      : null;
    const handledByCanonicalFanout =
      fanoutJobId !== null && canonicalRecipient?.lineProviderUserId === providerObservation.provider._id;
    if (!handledByCanonicalFanout) {
      analyticsAccountsComplete =
        appendAnalyticsLineAccountChange(analyticsAccounts, {
          staffId: staff._id,
          linked: true,
          following: event.following,
          // Provider時刻は順序判定だけに使い、分析上の変更は受理時刻から有効にする。
          occurredAt: webhookReceivedAt,
        }) && analyticsAccountsComplete;
    }
    if (event.following && !wasFollowing && !handledByCanonicalFanout) {
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
    const eventKey = await sha256Hex(event.webhookEventId);
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

/** queued/retrying jobを一つだけclaimし、失われたworkerはlease期限後に回収可能にする。 */
export const kickFriendshipFanoutJob = internalMutation({
  args: { jobId: v.id("lineFriendshipFanoutJobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || ["completed", "superseded", "actionRequired"].includes(job.status)) return null;

    const now = Date.now();
    const leaseExpired = job.status === "processing" && (job.leaseExpiresAt ?? 0) <= now;
    if (job.status === "processing" && !leaseExpired) return null;
    if ((job.status === "queued" || job.status === "retrying") && job.nextRunAt > now) {
      await ctx.scheduler.runAfter(job.nextRunAt - now, internal.line.mutations.kickFriendshipFanoutJob, { jobId });
      return null;
    }

    const attemptCount = leaseExpired ? job.attemptCount + 1 : job.attemptCount;
    if (attemptCount >= LINE_FRIENDSHIP_FANOUT_MAX_ATTEMPTS) {
      await ctx.db.patch(job._id, {
        status: "actionRequired",
        attemptCount,
        version: job.version + 1,
        leaseId: undefined,
        leaseExpiresAt: undefined,
        lastErrorCode: "line_friendship_fanout_lease_expired",
        updatedAt: now,
      });
      return null;
    }

    const version = job.version + 1;
    const leaseId = `${job._id}:${version}:${now}`;
    await ctx.db.patch(job._id, {
      status: "processing",
      version,
      attemptCount,
      leaseId,
      leaseExpiresAt: now + LINE_FRIENDSHIP_FANOUT_LEASE_MS,
      lastErrorCode: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.line.mutations.processFriendshipFanoutJob, {
      jobId: job._id,
      leaseId,
      expectedVersion: version,
    });
    return null;
  },
});

/** provider state変更をactive organization linkへboundedかつ冪等に反映する。 */
export const processFriendshipFanoutJob = internalMutation({
  args: {
    jobId: v.id("lineFriendshipFanoutJobs"),
    leaseId: v.string(),
    expectedVersion: v.number(),
  },
  returns: v.object({
    status: v.union(v.literal("advanced"), v.literal("completed"), v.literal("superseded"), v.literal("ignored")),
  }),
  handler: async (ctx, args): Promise<{ status: "advanced" | "completed" | "superseded" | "ignored" }> => {
    const job = await ctx.db.get(args.jobId);
    if (job?.status !== "processing" || job.version !== args.expectedVersion || job.leaseId !== args.leaseId) {
      return { status: "ignored" };
    }
    const provider = await ctx.db.get(job.lineProviderUserId);
    if (
      !provider ||
      provider.isDeleted ||
      provider.stateVersion !== job.stateVersion ||
      provider.following !== job.following
    ) {
      const now = Date.now();
      await ctx.db.patch(job._id, {
        status: "superseded",
        version: job.version + 1,
        leaseId: undefined,
        leaseExpiresAt: undefined,
        lastErrorCode: undefined,
        completedAt: now,
        updatedAt: now,
      });
      return { status: "superseded" };
    }

    const page = await ctx.db
      .query("organizationPersonLineLinks")
      .withIndex("by_lineProviderUserId_and_isDeleted", (q) =>
        q.eq("lineProviderUserId", provider._id).eq("isDeleted", false),
      )
      .paginate({
        numItems: LINE_FRIENDSHIP_FANOUT_BATCH_SIZE,
        cursor: job.cursor ?? null,
        maximumRowsRead: LINE_FRIENDSHIP_FANOUT_BATCH_SIZE,
      });
    const occurredAt = provider.lastWebhookAt ?? provider.friendshipObservedAt;
    for (const link of page.page) {
      const [organization, person] = await Promise.all([
        ctx.db.get(link.organizationId),
        ctx.db.get(link.organizationPersonId),
      ]);
      if (
        !organization ||
        organization.isDeleted ||
        !person ||
        person.status !== "active" ||
        person.organizationId !== organization._id ||
        link.generation !== (person.lineLinkGeneration ?? 0)
      ) {
        continue;
      }
      const staffs = await listActiveStaffsForOrganizationPerson(ctx, {
        organizationId: organization._id,
        organizationPersonId: person._id,
      });
      await recordAnalyticsSourceEvent(ctx, {
        eventKey: `lineAccountBatch:fanout:${job._id}:${job.stateVersion}:${link._id}`,
        eventType: "lineAccount.changed",
        occurredAt,
        payload: {
          kind: "lineAccountBatch",
          isComplete: true,
          accounts: staffs.map((staff) => ({
            staffId: staff._id,
            linked: true,
            following: job.following,
            occurredAt,
          })),
        },
      });
      if (job.following) {
        for (const staff of staffs) {
          await scheduleLineActivatedForStaff(ctx, staff, { includeOpenRecruitments: true });
        }
      }
    }

    const now = Date.now();
    const nextVersion = job.version + 1;
    if (page.isDone) {
      await ctx.db.patch(job._id, {
        status: "completed",
        cursor: page.continueCursor,
        version: nextVersion,
        attemptCount: 0,
        nextRunAt: now,
        leaseId: undefined,
        leaseExpiresAt: undefined,
        lastErrorCode: undefined,
        completedAt: now,
        updatedAt: now,
      });
      return { status: "completed" };
    }
    await ctx.db.patch(job._id, {
      status: "queued",
      cursor: page.continueCursor,
      version: nextVersion,
      attemptCount: 0,
      nextRunAt: now,
      leaseId: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.line.mutations.kickFriendshipFanoutJob, { jobId: job._id });
    return { status: "advanced" };
  },
});

/** cronから予約漏れと期限切れleaseをboundedに回収する。 */
export const recoverFriendshipFanoutJobs = internalMutation({
  args: {},
  returns: v.object({ scheduled: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const perStatusLimit = Math.floor(LINE_FRIENDSHIP_FANOUT_RECOVERY_BATCH_SIZE / 3);
    const candidates = new Map<Id<"lineFriendshipFanoutJobs">, Doc<"lineFriendshipFanoutJobs">>();
    for (const status of ["queued", "retrying"] as const) {
      const jobs = await ctx.db
        .query("lineFriendshipFanoutJobs")
        .withIndex("by_status_and_nextRunAt", (q) => q.eq("status", status).lte("nextRunAt", now))
        .take(perStatusLimit);
      for (const job of jobs) candidates.set(job._id, job);
    }
    const expiredLeases = await ctx.db
      .query("lineFriendshipFanoutJobs")
      .withIndex("by_status_and_leaseExpiresAt", (q) => q.eq("status", "processing").lte("leaseExpiresAt", now))
      .take(perStatusLimit);
    for (const job of expiredLeases) candidates.set(job._id, job);

    const jobs = [...candidates.values()].slice(0, LINE_FRIENDSHIP_FANOUT_RECOVERY_BATCH_SIZE);
    for (const job of jobs) {
      await ctx.scheduler.runAfter(0, internal.line.mutations.kickFriendshipFanoutJob, { jobId: job._id });
    }
    return { scheduled: jobs.length };
  },
});

/** operator retryはversion一致するactionRequired jobだけを再投入する。 */
export const retryActionRequiredFriendshipFanoutJob = internalMutation({
  args: { jobId: v.id("lineFriendshipFanoutJobs"), expectedVersion: v.number() },
  returns: v.object({ status: v.literal("scheduled"), version: v.number() }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job?.status !== "actionRequired" || job.version !== args.expectedVersion) {
      throw new ConvexError("LINE連携状態反映jobの状態が更新されています。");
    }
    const now = Date.now();
    const version = job.version + 1;
    await ctx.db.patch(job._id, {
      status: "retrying",
      version,
      attemptCount: 0,
      nextRunAt: now,
      leaseId: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: undefined,
      completedAt: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.line.mutations.kickFriendshipFanoutJob, { jobId: job._id });
    return { status: "scheduled" as const, version };
  },
});

/** retentionを過ぎたterminal fanout jobだけをboundedに削除する。 */
export const pruneFriendshipFanoutJobs = internalMutation({
  args: {},
  returns: v.object({ deletedCount: v.number(), hasMore: v.boolean() }),
  handler: async (ctx) => {
    const now = Date.now();
    const batch: Doc<"lineFriendshipFanoutJobs">[] = [];
    let hasMore = false;
    for (const status of ["completed", "superseded"] as const) {
      const remaining = LINE_FRIENDSHIP_FANOUT_PRUNE_BATCH_SIZE - batch.length;
      const jobs = await ctx.db
        .query("lineFriendshipFanoutJobs")
        .withIndex("by_status_and_expiresAt", (q) => q.eq("status", status).lte("expiresAt", now))
        .take(remaining + 1);
      batch.push(...jobs.slice(0, remaining));
      if (jobs.length > remaining) {
        hasMore = true;
        break;
      }
    }
    for (const job of batch) await ctx.db.delete(job._id);
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.line.mutations.pruneFriendshipFanoutJobs, {});
    }
    return { deletedCount: batch.length, hasMore };
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

/** 管理者がorganization person単位のLINE連携を明示解除する。 */
export const disconnectOrganizationPersonLine = authenticatedMutation({
  args: {
    shopId: v.id("shops"),
    expectedOrganizationId: v.optional(v.id("organizations")),
    organizationPersonId: v.id("organizationPeople"),
    requestId: v.string(),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    if (!ctx.user) throw new ConvexError("Not found");
    const actor = await requireOrganizationActorForShop(ctx, {
      user: ctx.user,
      shopId: args.shopId,
    });
    if (args.expectedOrganizationId && actor.organization._id !== args.expectedOrganizationId) {
      throw new ConvexError("Not found");
    }
    const person = await ctx.db.get(args.organizationPersonId);
    if (person?.status !== "active" || person.organizationId !== actor.organization._id) {
      throw new ConvexError("Not found");
    }
    const requestKey = await toAuditRequestKey(args.requestId);
    const correlationId = `${actor.organization._id}:person-line-disconnect:${person._id}:${requestKey}`;
    const prior = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
      .take(2);
    if (prior.length > 1) throw new ConvexError("以前の操作結果を確認できません");
    if (prior[0]) {
      if (
        prior[0].organizationId !== actor.organization._id ||
        prior[0].actorUserId !== ctx.user._id ||
        prior[0].action !== "organization.person_line_disconnected" ||
        prior[0].targetId !== person._id
      ) {
        throw new ConvexError("以前の操作結果を確認できません");
      }
      return { changed: false };
    }

    const occurredAt = Date.now();
    const activeStaffs = await listActiveStaffsForOrganizationPerson(ctx, {
      organizationId: actor.organization._id,
      organizationPersonId: person._id,
    });
    const staffHistory = await listOrganizationPersonStaffHistory(ctx, {
      organizationId: actor.organization._id,
      organizationPersonId: person._id,
    });
    const result = await disconnectCanonicalOrganizationPersonLine(ctx, {
      organizationId: actor.organization._id,
      organizationPersonId: person._id,
      occurredAt,
    });
    let legacyChanged = false;
    for (const staff of staffHistory) {
      const account = await getStaffLineAccount(ctx, staff._id);
      if (!account) continue;
      legacyChanged = true;
      await ctx.db.patch(account._id, { isDeleted: true, following: false });
    }
    if (!result.changed && legacyChanged) {
      const generation = (person.lineLinkGeneration ?? 0) + 1;
      await ctx.db.patch(person._id, { lineLinkGeneration: generation, updatedAt: occurredAt });
      await revokeOrganizationPersonLineTokens(ctx, {
        organizationPersonId: person._id,
        occurredAt,
      });
    }
    const changed = result.changed || legacyChanged;
    if (!changed) return { changed: false };

    await recordOrganizationAuditEvent(ctx, {
      organizationId: actor.organization._id,
      actorUserId: ctx.user._id,
      actorPersonId: actor.person._id,
      action: "organization.person_line_disconnected",
      targetKind: "person",
      targetId: person._id,
      fromState: "linked",
      toState: "unlinked",
      correlationId,
      occurredAt,
      suppressAnalyticsEvent: true,
    });
    if (activeStaffs.length > 0) {
      await recordAnalyticsSourceEvent(ctx, {
        eventKey: `lineAccountBatch:disconnect:${correlationId}`,
        eventType: "lineAccount.changed",
        occurredAt,
        payload: {
          kind: "lineAccountBatch",
          isComplete: true,
          accounts: activeStaffs.map((staff) => ({
            staffId: staff._id,
            linked: false,
            following: false,
            occurredAt,
          })),
        },
      });
    }
    return { changed: true };
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

    const canonicalScope = await resolveCanonicalStaffScope(ctx, {
      staffId: staff._id,
      shopId: ctx.shop._id,
    });

    await ctx.scheduler.runAfter(0, internal.line.actions.sendInviteEmail, {
      staffId: staff._id,
      ...(canonicalScope
        ? {
            organizationPersonId: canonicalScope.person._id,
            lineLinkGenerationAtSchedule: canonicalScope.person.lineLinkGeneration ?? 0,
          }
        : {}),
      ...notificationOrigin,
    });
    return null;
  },
});
