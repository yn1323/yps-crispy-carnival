import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { addDays, dateJST, getSubmitLinkCutoff, jstDayRangeMs, monthJST } from "../_lib/dateFormat";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";
import { isShopAvailable } from "../_lib/shopAvailability";
import { recruitmentMatchesAccessKind } from "../_lib/staffAccess";
import { DAY_MS, MINUTE_MS } from "../constants";
import { resolveCanonicalStaffScope } from "../line/service";
import { safeStoredNotificationError } from "../notificationOutbox/safeError";
import {
  NOTIFICATION_OUTBOX_STATUSES,
  notificationChannelValidator,
  notificationOutboxStatusValidator,
} from "../notificationOutbox/schemas";
import { isShiftTargetStaff } from "../staff/service";
import type {
  MagicLinkLookupResponse,
  NotificationSearchResponse,
  NotificationSearchRowDto,
  NotificationSummaryResponse,
  OrganizationEventsResponse,
  RecruitmentPeriodDto,
  StaffTimelineEventDto,
  StaffTimelineResponse,
} from "./dto";
import { notificationCategory } from "./notificationCategories";
import {
  currentShop,
  deletedShopRow,
  emptyPageInfo,
  pageInfo,
  paginationOptions,
  recentCycles,
  shopRow,
} from "./queryHelpers";
import {
  ANALYTICS_DASHBOARD_MAX_SCAN_ROWS,
  isNotificationSearchRange,
  MAGIC_LINK_TOKEN_PATTERN,
  NOTIFICATION_SEARCH_DEFAULT_DAYS,
  NOTIFICATION_SEARCH_MAX_PAGE_SIZE,
  ORGANIZATION_EVENTS_MAX_PAGE_SIZE,
} from "./schemas";
import {
  magicLinkLookupResponseValidator,
  notificationCategoryValidator,
  notificationSearchResponseValidator,
  notificationSummaryResponseValidator,
  nullableString,
  organizationEventsResponseValidator,
  pageArgs,
  staffTimelineResponseValidator,
} from "./validators";

/** 状態ごとの件数は多くても調査に足りる上限で打ち切り、上限到達を明示する。 */
const SUMMARY_COUNT_LIMIT = 200;
/** workerは1分ごとに回るため、予定から15分以上遅れた送信待ちを遅延とみなす。 */
const PENDING_DELAY_MS = 15 * MINUTE_MS;
/** 行動履歴の元データごとの読み取り上限。 */
const TIMELINE_SOURCE_LIMIT = 30;
const TIMELINE_MAX_EVENTS = 150;
/** 状態の変化に業務名以外の値を持たない監査操作だけ、変更前後を返す。 */
const AUDIT_ACTIONS_WITH_STATES = new Set(["organization.billing_state_changed", "organization.name_changed"]);
const RESEND_DELIVERY_STATUS = {
  delivery_delayed: "delayed",
  failed: "failed",
  bounced: "bounced",
  suppressed: "suppressed",
} as const;

function recruitmentPeriod(
  recruitment: Doc<"recruitments"> | null,
  shopId: Id<"shops"> | undefined,
): RecruitmentPeriodDto | null {
  if (!recruitment || recruitment.isDeleted || recruitment.shopId !== shopId) return null;
  return {
    recruitmentId: recruitment._id,
    periodStart: recruitment.periodStart,
    periodEnd: recruitment.periodEnd,
  };
}

function cached<K, V>(load: (key: K) => Promise<V>) {
  const values = new Map<K, Promise<V>>();
  return (key: K) => {
    let value = values.get(key);
    if (!value) {
      value = load(key);
      values.set(key, value);
    }
    return value;
  };
}

async function notificationRecipient(
  ctx: QueryCtx,
  row: Doc<"notificationOutbox">,
): Promise<NotificationSearchRowDto["recipient"]> {
  if (row.staffId) {
    const staff = await ctx.db.get(row.staffId);
    const active = staff && !staff.isDeleted && staff.shopId === row.shopId ? staff : null;
    const person = active ? await ctx.db.get(active.organizationPersonId) : null;
    return { kind: "staff", name: person?.name ?? null, staffId: active && person ? active._id : null };
  }
  if (row.userId) {
    const userId = row.userId;
    const person = await ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_userId", (q) => q.eq("organizationId", row.organizationId).eq("userId", userId))
      .first();
    return { kind: "manager", name: person?.name ?? null, staffId: null };
  }
  if (row.organizationInvitationId) {
    const invitation = await ctx.db.get(row.organizationInvitationId);
    const name = invitation?.organizationId === row.organizationId ? invitation.invitedName : null;
    return { kind: "invitation", name, staffId: null };
  }
  return { kind: "none", name: null, staffId: null };
}

/** 一覧の行ごとに店舗・組織を重複して読まないよう、要求内でだけ結果を共有する。 */
function notificationRowResolver(ctx: QueryCtx) {
  const loadShop = cached((shopId: Id<"shops">) => currentShop(ctx, shopId));
  const loadOrganization = cached((organizationId: Id<"organizations">) => ctx.db.get(organizationId));
  return async (row: Doc<"notificationOutbox">): Promise<NotificationSearchRowDto> => {
    const [current, organization, recipient, recruitment, history] = await Promise.all([
      row.shopId ? loadShop(row.shopId) : null,
      loadOrganization(row.organizationId),
      notificationRecipient(ctx, row),
      row.recruitmentId ? ctx.db.get(row.recruitmentId) : null,
      row.staffId
        ? ctx.db
            .query("notificationHistory")
            .withIndex("by_outboxId", (q) => q.eq("outboxId", row._id))
            .first()
        : null,
    ]);
    return {
      id: row._id,
      createdAt: row._creationTime,
      status: row.status,
      channel: row.channel,
      purpose: row.purpose,
      category: notificationCategory(row.notificationContext),
      notificationContext: row.notificationContext,
      shop: row.shopId
        ? current
          ? { shopId: current.shop._id, name: current.shop.name, isDeleted: false }
          : { shopId: row.shopId, name: "削除済み店舗", isDeleted: true }
        : null,
      organizationName: organization && !organization.isDeleted ? organization.name : null,
      recipient,
      recruitment: current ? recruitmentPeriod(recruitment, row.shopId) : null,
      ids: {
        organizationId: row.organizationId,
        shopId: row.shopId ?? null,
        staffId: row.staffId ?? null,
        userId: row.userId ?? null,
        recruitmentId: row.recruitmentId ?? null,
        invitationId: row.organizationInvitationId ?? null,
      },
      attemptCount: row.attemptCount,
      nextRunAt: row.status === "pending" ? row.nextRunAt : null,
      sentAt: row.sentAt ?? null,
      failedAt: row.failedAt ?? null,
      cancelledAt: row.cancelledAt ?? null,
      // 旧rowに残る値も含め、allowlist外の文字列を固定コードへ置き換えてから返す。
      errorCode: row.lastError ? safeStoredNotificationError(row.lastError) : null,
      cancelReason: row.cancelReason ?? null,
      deliverySuppressed: row.deliverySuppressed,
      resendEmailId: row.resendEmailId ?? null,
      deliveryStatus:
        history?.deliveryStatus ?? (row.resendDeliveryStatus ? RESEND_DELIVERY_STATUS[row.resendDeliveryStatus] : null),
      deliveredAt: history?.deliveredAt ?? null,
      payloadRedacted: row.payloadRedactedAt !== undefined,
    };
  };
}

export const getNotifications = internalQuery({
  args: {
    ...pageArgs,
    asOf: v.number(),
    from: nullableString,
    to: nullableString,
    shopId: nullableString,
    status: v.union(notificationOutboxStatusValidator, v.null()),
    channel: v.union(notificationChannelValidator, v.null()),
    category: v.union(notificationCategoryValidator, v.null()),
    lookup: nullableString,
  },
  returns: notificationSearchResponseValidator,
  handler: async (ctx, args): Promise<NotificationSearchResponse | null> => {
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > NOTIFICATION_SEARCH_MAX_PAGE_SIZE)
      throw new Error("invalid_request");
    const resolveRow = notificationRowResolver(ctx);
    const lookup = args.lookup;
    if (lookup !== null) {
      const outboxId = ctx.db.normalizeId("notificationOutbox", lookup);
      const found = outboxId
        ? await ctx.db.get(outboxId)
        : await ctx.db
            .query("notificationOutbox")
            .withIndex("by_resendEmailId", (q) => q.eq("resendEmailId", lookup))
            .first();
      return {
        kind: "notifications",
        asOf: args.asOf,
        mode: "lookup",
        range: null,
        shop: null,
        rows: found ? [await resolveRow(found)] : [],
        scannedCount: found ? 1 : 0,
        pageInfo: emptyPageInfo(null, args.limit),
      };
    }

    const to = args.to ?? dateJST(args.asOf);
    const from = args.from ?? addDays(to, 1 - NOTIFICATION_SEARCH_DEFAULT_DAYS);
    const startMs = jstDayRangeMs(from).startMs;
    const endMs = jstDayRangeMs(to).endMs;
    const before = args.cursor === null ? endMs : Number(args.cursor);
    if (
      (args.from === null) !== (args.to === null) ||
      !isNotificationSearchRange(from, to) ||
      !Number.isFinite(before) ||
      before > endMs
    )
      throw new Error("invalid_request");

    let shopId: Id<"shops"> | null = null;
    let shop: NotificationSearchResponse["shop"] = null;
    if (args.shopId !== null) {
      shopId = ctx.db.normalizeId("shops", args.shopId);
      if (!shopId) return null;
      const current = await currentShop(ctx, shopId);
      shop = current ? shopRow(current.shop, current.organization) : deletedShopRow(shopId);
    }

    // 作成時刻の新しい順に一定件数だけ読み、条件に合わない行は読み取り後に除く。
    // 店舗指定では既存の店舗×状態indexを状態ごとに読み、作成時刻で統合する。
    const take = args.limit + 1;
    const filterShopId = shopId;
    const candidates = filterShopId
      ? (
          await Promise.all(
            (args.status ? [args.status] : NOTIFICATION_OUTBOX_STATUSES).map((status) =>
              ctx.db
                .query("notificationOutbox")
                .withIndex("by_shopId_status", (q) =>
                  q
                    .eq("shopId", filterShopId)
                    .eq("status", status)
                    .gte("_creationTime", startMs)
                    .lt("_creationTime", before),
                )
                .order("desc")
                .take(take),
            ),
          )
        ).flat()
      : await ctx.db
          .query("notificationOutbox")
          .withIndex("by_creation_time", (q) => q.gte("_creationTime", startMs).lt("_creationTime", before))
          .order("desc")
          .take(take);
    candidates.sort((left, right) => right._creationTime - left._creationTime);
    const hasMore = candidates.length > args.limit;
    let scanned = candidates.slice(0, args.limit);
    if (hasMore) {
      // 次のpageは境界時刻より前から読むため、同時刻の行がpageをまたぐ場合は境界の時刻ごと次へ回す。
      const boundary = scanned[scanned.length - 1]._creationTime;
      const trimmed = scanned.filter((row) => row._creationTime !== boundary);
      if (candidates[args.limit]._creationTime === boundary && trimmed.length > 0) scanned = trimmed;
    }
    const matched = scanned.filter(
      (row) =>
        (args.status === null || row.status === args.status) &&
        (args.channel === null || row.channel === args.channel) &&
        (args.category === null || notificationCategory(row.notificationContext) === args.category),
    );
    const rows = await Promise.all(matched.map(resolveRow));
    return {
      kind: "notifications",
      asOf: args.asOf,
      mode: "filter",
      range: { from, to },
      shop,
      rows,
      scannedCount: scanned.length,
      pageInfo: {
        cursor: args.cursor,
        continueCursor: hasMore ? String(scanned[scanned.length - 1]._creationTime) : null,
        isDone: !hasMore,
        pageSize: args.limit,
        returnedCount: rows.length,
      },
    };
  },
});

export const getNotificationSummary = internalQuery({
  args: { asOf: v.number() },
  returns: notificationSummaryResponseValidator,
  handler: async (ctx, args): Promise<NotificationSummaryResponse> => {
    const month = monthJST(args.asOf);
    const [usage, failed, pending, processing, quota] = await Promise.all([
      ctx.db
        .query("notificationUsage")
        .withIndex("by_month", (q) => q.eq("month", month))
        .take(ANALYTICS_DASHBOARD_MAX_SCAN_ROWS + 1),
      ctx.db
        .query("notificationOutbox")
        .withIndex("by_status_failedAt", (q) => q.eq("status", "failed").gte("failedAt", args.asOf - 7 * DAY_MS))
        .take(SUMMARY_COUNT_LIMIT + 1),
      ctx.db
        .query("notificationOutbox")
        .withIndex("by_status_nextRunAt", (q) =>
          q.eq("status", "pending").lt("nextRunAt", args.asOf - PENDING_DELAY_MS),
        )
        .take(SUMMARY_COUNT_LIMIT + 1),
      ctx.db
        .query("notificationOutbox")
        .withIndex("by_status_leaseExpiresAt", (q) => q.eq("status", "processing").lt("leaseExpiresAt", args.asOf))
        .take(SUMMARY_COUNT_LIMIT + 1),
      ctx.db.query("lineQuotaStatus").order("desc").first(),
    ]);
    const counted = usage.slice(0, ANALYTICS_DASHBOARD_MAX_SCAN_ROWS);
    return {
      kind: "notificationSummary",
      asOf: args.asOf,
      month: {
        month,
        email: counted.reduce((sum, row) => sum + row.emailCount, 0),
        line: counted.reduce((sum, row) => sum + row.lineCount, 0),
        shopCount: counted.length,
        isPartial: usage.length > counted.length,
      },
      failedLast7Days: {
        count: Math.min(failed.length, SUMMARY_COUNT_LIMIT),
        isPartial: failed.length > SUMMARY_COUNT_LIMIT,
      },
      delayed: {
        pending: Math.min(pending.length, SUMMARY_COUNT_LIMIT),
        processing: Math.min(processing.length, SUMMARY_COUNT_LIMIT),
        isPartial: pending.length > SUMMARY_COUNT_LIMIT || processing.length > SUMMARY_COUNT_LIMIT,
      },
      lineQuota: quota
        ? {
            status: quota.status,
            remaining: quota.remaining,
            totalQuota: quota.totalQuota,
            checkedAt: quota.checkedAt,
          }
        : null,
    };
  },
});

export const getStaffTimeline = internalQuery({
  args: { shopId: v.string(), staffId: v.string(), asOf: v.number() },
  returns: staffTimelineResponseValidator,
  handler: async (ctx, args): Promise<StaffTimelineResponse | null> => {
    const shopId = ctx.db.normalizeId("shops", args.shopId);
    const staffId = ctx.db.normalizeId("staffs", args.staffId);
    if (!shopId || !staffId) return null;
    const scope = await resolveCanonicalStaffScope(ctx, { shopId, staffId });
    if (!scope) return null;
    const { staff, person } = scope;
    const limit = TIMELINE_SOURCE_LIMIT;
    const [
      requests,
      consents,
      consentTokens,
      links,
      sessions,
      lineTokens,
      lineLinks,
      notifications,
      featureRequests,
      cycles,
    ] = await Promise.all([
      ctx.db
        .query("staffRegistrationRequests")
        .withIndex("by_shopId_emailNormalized_status", (q) =>
          q.eq("shopId", shopId).eq("emailNormalized", staff.emailNormalized),
        )
        .take(limit),
      ctx.db
        .query("legalConsentEvents")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .order("desc")
        .take(limit),
      ctx.db
        .query("legalConsentTokens")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .order("desc")
        .take(limit),
      ctx.db
        .query("magicLinks")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .order("desc")
        .take(limit),
      ctx.db
        .query("sessions")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .order("desc")
        .take(limit),
      ctx.db
        .query("lineLinkTokens")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .order("desc")
        .take(limit),
      ctx.db
        .query("organizationPersonLineLinks")
        .withIndex("by_organizationPersonId_and_isDeleted", (q) => q.eq("organizationPersonId", person._id))
        .take(limit),
      ctx.db
        .query("notificationHistory")
        .withIndex("by_shopId_and_staffId_and_requestedAt", (q) => q.eq("shopId", shopId).eq("staffId", staffId))
        .order("desc")
        .take(limit),
      ctx.db
        .query("featureRequests")
        .withIndex("by_staffId_and_requestId", (q) => q.eq("staffId", staffId))
        .take(limit),
      recentCycles(ctx, shopId),
    ]);
    const [submissions, activeLineUser] = await Promise.all([
      Promise.all(
        cycles.map(async (cycle) => ({
          cycle,
          submission: await ctx.db
            .query("shiftSubmissions")
            .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", cycle._id).eq("staffId", staffId))
            .unique(),
        })),
      ),
      (async () => {
        const active = lineLinks.find((link) => !link.isDeleted && link.organizationId === person.organizationId);
        return active ? await ctx.db.get(active.lineProviderUserId) : null;
      })(),
    ]);

    const loadRecruitment = cached(async (recruitmentId: Id<"recruitments">) =>
      recruitmentPeriod(await ctx.db.get(recruitmentId), shopId),
    );
    const events: StaffTimelineEventDto[] = [];
    const push = async (
      at: number | undefined,
      type: StaffTimelineEventDto["type"],
      options: { recruitmentId?: Id<"recruitments">; detail?: string | null; status?: string | null } = {},
    ) => {
      if (at === undefined) return;
      events.push({
        at,
        type,
        recruitment: options.recruitmentId ? await loadRecruitment(options.recruitmentId) : null,
        detail: options.detail ?? null,
        status: options.status ?? null,
      });
    };

    await push(staff._creationTime, "staff_created");
    for (const request of requests) {
      await push(request.createdAt, "registration_requested");
      await push(request.reviewedAt, "registration_reviewed", { status: request.status });
    }
    for (const token of consentTokens) {
      await push(token._creationTime, "legal_consent_link_issued", { detail: token.method });
      await push(token.usedAt, "legal_consent_link_used", { detail: token.method });
    }
    for (const consent of consents)
      await push(consent.consentedAt, "legal_consented", {
        detail: consent.method,
        recruitmentId: consent.sourceRecruitmentId,
      });
    for (const link of links) {
      await push(link._creationTime, link.accessKind === "view" ? "view_link_issued" : "submit_link_issued", {
        recruitmentId: link.recruitmentId,
      });
      if (link.accessKind === "view") await push(link.usedAt, "view_link_used", { recruitmentId: link.recruitmentId });
    }
    for (const session of sessions)
      await push(session._creationTime, "session_started", {
        detail: session.accessKind,
        recruitmentId: session.recruitmentId,
      });
    for (const { cycle, submission } of submissions) {
      if (!submission) continue;
      await push(submission.firstSubmittedAt, "first_submitted", { recruitmentId: cycle._id });
      if (submission.submittedAt !== submission.firstSubmittedAt)
        await push(submission.submittedAt, "last_submitted", { recruitmentId: cycle._id });
    }
    for (const token of lineTokens) {
      await push(token._creationTime, "line_link_issued");
      await push(token.usedAt, "line_link_used");
    }
    for (const link of lineLinks) {
      if (link.organizationId !== person.organizationId) continue;
      await push(link.linkedAt, "line_linked");
      await push(link.unlinkedAt, "line_unlinked");
    }
    if (activeLineUser && !activeLineUser.isDeleted && !activeLineUser.following)
      await push(activeLineUser.friendshipObservedAt, "line_unfollowed");
    for (const notification of notifications)
      await push(notification.requestedAt, "notification_requested", {
        detail: notification.notificationKind,
        // 送信状態と到達状態は同じ値を持つため、どちらの状態かを接頭辞で区別する。
        status:
          notification.deliveryStatus === "unknown" || notification.deliveryStatus === "not_supported"
            ? `send.${notification.sendStatus}`
            : `delivery.${notification.deliveryStatus}`,
      });
    for (const request of featureRequests) await push(request._creationTime, "feature_request_sent");

    events.sort((left, right) => right.at - left.at);
    const sourceLimited = [
      requests,
      consents,
      consentTokens,
      links,
      sessions,
      lineTokens,
      lineLinks,
      notifications,
      featureRequests,
    ].some((rows) => rows.length >= limit);
    return {
      kind: "staffTimeline",
      asOf: args.asOf,
      events: events.slice(0, TIMELINE_MAX_EVENTS),
      isTruncated: sourceLimited || events.length > TIMELINE_MAX_EVENTS,
    };
  },
});

export const getOrganizationEvents = internalQuery({
  args: { ...pageArgs, shopId: v.string(), asOf: v.number() },
  returns: organizationEventsResponseValidator,
  handler: async (ctx, args): Promise<OrganizationEventsResponse | null> => {
    const options = paginationOptions(args.cursor, args.limit, ORGANIZATION_EVENTS_MAX_PAGE_SIZE);
    const current = await currentShop(ctx, args.shopId);
    if (!current) return null;
    const { organization } = current;
    const page = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", organization._id))
      .order("desc")
      .paginate(options);

    const personName = cached(async (personId: Id<"organizationPeople">) => {
      const person = await ctx.db.get(personId);
      return person?.organizationId === organization._id ? person.name : null;
    });
    const userName = cached(async (userId: Id<"users">) => {
      const person = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_userId", (q) => q.eq("organizationId", organization._id).eq("userId", userId))
        .first();
      return person?.name ?? null;
    });
    const targetName = async (event: Doc<"organizationAuditEvents">): Promise<string | null> => {
      if (!event.targetId) return null;
      switch (event.targetKind) {
        case "organization":
          return organization.name;
        case "shop": {
          const id = ctx.db.normalizeId("shops", event.targetId);
          const shop = id ? await ctx.db.get(id) : null;
          return shop?.organizationId === organization._id ? shop.name : null;
        }
        case "person": {
          const id = ctx.db.normalizeId("organizationPeople", event.targetId);
          return id ? await personName(id) : null;
        }
        case "staff": {
          const id = ctx.db.normalizeId("staffs", event.targetId);
          const staff = id ? await ctx.db.get(id) : null;
          return staff?.organizationId === organization._id ? await personName(staff.organizationPersonId) : null;
        }
        case "invitation": {
          const id = ctx.db.normalizeId("organizationInvitations", event.targetId);
          const invitation = id ? await ctx.db.get(id) : null;
          return invitation?.organizationId === organization._id ? invitation.invitedName : null;
        }
        default:
          return null;
      }
    };
    const rows = await Promise.all(
      page.page.map(async (event) => {
        const withStates = AUDIT_ACTIONS_WITH_STATES.has(event.action);
        return {
          id: event._id,
          occurredAt: event.occurredAt,
          action: event.action,
          actorName: event.actorPersonId
            ? await personName(event.actorPersonId)
            : event.actorUserId
              ? await userName(event.actorUserId)
              : null,
          actorUserId: event.actorUserId ?? null,
          targetKind: event.targetKind ?? null,
          targetId: event.targetId ?? null,
          targetName: await targetName(event),
          fromState: withStates ? (event.fromState ?? null) : null,
          toState: withStates ? (event.toState ?? null) : null,
        };
      }),
    );
    return {
      kind: "organizationEvents",
      asOf: args.asOf,
      organizationId: organization._id,
      organizationName: organization.name,
      rows,
      pageInfo: pageInfo(args.cursor, options.numItems, page, rows.length),
    };
  },
});

type MagicLinkDiagnosis = NonNullable<MagicLinkLookupResponse["link"]>["diagnosis"];

/**
 * tokenの完全一致でマジックリンクを1件調べる。
 * 判定は`staffAuth/mutations.ts`の`verifyToken`と同じ順序で行い、sessionの作成や使用済みへの更新はしない。
 * tokenとsession tokenは返さない。
 */
export const getMagicLinkLookup = internalQuery({
  args: { token: v.string(), asOf: v.number() },
  returns: magicLinkLookupResponseValidator,
  handler: async (ctx, args): Promise<MagicLinkLookupResponse> => {
    if (!MAGIC_LINK_TOKEN_PATTERN.test(args.token)) throw new Error("invalid_request");
    const links = await ctx.db
      .query("magicLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .take(2);
    const link = links[0];
    if (!link) return { kind: "magicLinkLookup", asOf: args.asOf, link: null };

    const [recruitment, staff, shop, sessions] = await Promise.all([
      ctx.db.get(link.recruitmentId),
      ctx.db.get(link.staffId),
      ctx.db.get(link.shopId),
      ctx.db
        .query("sessions")
        .withIndex("by_staffId_recruitmentId", (q) =>
          q.eq("staffId", link.staffId).eq("recruitmentId", link.recruitmentId),
        )
        .order("desc")
        .take(10),
    ]);
    const [organization, person, scope, shopAvailable] = await Promise.all([
      shop ? ctx.db.get(shop.organizationId) : null,
      staff ? ctx.db.get(staff.organizationPersonId) : null,
      staff ? resolveCanonicalStaffScope(ctx, { staffId: staff._id, shopId: link.shopId }) : null,
      isShopAvailable(ctx, shop),
    ]);

    const diagnose = (): MagicLinkDiagnosis => {
      if (links.length !== 1) return { result: "invalid_link", reason: "duplicate_token" };
      if (link.revokedAt) return { result: "invalid_link", reason: "revoked" };
      if (!recruitment || recruitment.shopId !== link.shopId)
        return { result: "invalid_link", reason: "recruitment_mismatch" };
      if (recruitment.isDeleted) return { result: "recruitment_deleted", reason: "recruitment_deleted" };
      if (!staff || !isShiftTargetStaff(staff) || !scope)
        return { result: "invalid_link", reason: "staff_unavailable" };
      if (!shopAvailable) return { result: "invalid_link", reason: "shop_unavailable" };
      if (!recruitmentMatchesAccessKind(recruitment.status, link.accessKind))
        return {
          result:
            link.accessKind === "submit" && recruitment.status === "confirmed" ? "submission_closed" : "invalid_link",
          reason: "recruitment_status",
        };
      if (link.accessKind === "submit" && args.asOf >= getSubmitLinkCutoff(recruitment.periodStart))
        return { result: "submission_closed", reason: "submit_cutoff" };
      if (link.accessKind === "view" && link.expiresAt < args.asOf)
        return { result: "invalid_link", reason: "expired" };
      if (link.accessKind === "view" && link.usedAt) return { result: "invalid_link", reason: "used" };
      return { result: "ok", reason: "ok" };
    };

    return {
      kind: "magicLinkLookup",
      asOf: args.asOf,
      link: {
        id: link._id,
        accessKind: link.accessKind,
        createdAt: link._creationTime,
        expiresAt: link.expiresAt,
        usedAt: link.usedAt ?? null,
        revokedAt: link.revokedAt ?? null,
        ids: {
          organizationId: shop?.organizationId ?? null,
          shopId: link.shopId,
          staffId: link.staffId,
          personId: staff?.organizationPersonId ?? null,
          userId: staff?.userId ?? null,
          recruitmentId: link.recruitmentId,
        },
        shopName: shopAvailable && shop ? shop.name : null,
        organizationName: shopAvailable && organization ? organization.name : null,
        shopAvailable,
        staff: staff
          ? { name: person?.name ?? null, isDeleted: staff.isDeleted, excludedFromShift: staff.excludedFromShift }
          : null,
        recruitment:
          recruitment && recruitment.shopId === link.shopId
            ? {
                periodStart: recruitment.periodStart,
                periodEnd: recruitment.periodEnd,
                deadline: recruitment.deadline,
                status: recruitment.status,
                isDeleted: recruitment.isDeleted,
              }
            : null,
        submitCutoffAt:
          recruitment && link.accessKind === "submit" ? getSubmitLinkCutoff(recruitment.periodStart) : null,
        sessions: sessions.map((session) => ({
          createdAt: session._creationTime,
          expiresAt: session.expiresAt,
          accessKind: session.accessKind,
          revokedAt: session.revokedAt ?? null,
        })),
        diagnosis: diagnose(),
      },
    };
  },
});
