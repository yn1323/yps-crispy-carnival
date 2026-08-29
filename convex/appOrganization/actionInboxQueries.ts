import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { dateJST, getDeadlineCutoff } from "../_lib/dateFormat";
import { organizationQuery } from "../_lib/functions";
import { DASHBOARD_RESPONSE_COUNT_LIMIT } from "../constants";
import { toDashboardRecruitment } from "../dashboard/queries";
import { isManagerVisibleNotificationFailure } from "../notificationOutbox/failureEligibility";
import {
  describeNotificationFailureContext,
  getNotificationFailureResendKind,
  isLineInviteResendContext,
} from "../notificationOutbox/failureResend";
import { getCanonicalManagerSettingsOverview } from "../organization/queries";
import { getOrganizationAccessPolicy } from "../organizationBilling/service";
import { resolveStaffRegistrationApprovalAvailability } from "../staffRegistration/service";

const SOURCE_PAGE_SIZE = 8;
const MAX_SHOPS = 50;
const SOURCE_SCAN_MULTIPLIER = 12;
const SOURCE_SCAN_LIMIT = SOURCE_PAGE_SIZE * SOURCE_SCAN_MULTIPLIER;

const actionKindValidator = v.union(
  v.literal("shift"),
  v.literal("staffRegistration"),
  v.literal("notificationFailure"),
  v.literal("managerInvitation"),
);

const actionScopeValidator = v.union(
  v.object({
    kind: v.literal("shop"),
    organizationId: v.id("organizations"),
    shopId: v.id("shops"),
  }),
  v.object({ kind: v.literal("organization"), organizationId: v.id("organizations") }),
);

const actionItemValidator = v.union(
  v.object({
    id: v.string(),
    kind: v.literal("shift"),
    scope: actionScopeValidator,
    recruitmentId: v.id("recruitments"),
    shopName: v.string(),
    periodStart: v.string(),
    periodEnd: v.string(),
    deadline: v.string(),
    responseCount: v.number(),
    totalStaffCount: v.number(),
    totalStaffCountHasOverflow: v.optional(v.boolean()),
    occurredAt: v.number(),
  }),
  v.object({
    id: v.string(),
    kind: v.literal("staffRegistration"),
    scope: actionScopeValidator,
    requestId: v.id("staffRegistrationRequests"),
    shopName: v.string(),
    applicantName: v.string(),
    createdAt: v.number(),
    canApprove: v.boolean(),
    approveDisabledReason: v.union(v.string(), v.null()),
    canReject: v.boolean(),
    occurredAt: v.number(),
  }),
  v.object({
    id: v.string(),
    kind: v.literal("notificationFailure"),
    scope: actionScopeValidator,
    failureId: v.id("notificationFailureInbox"),
    shopName: v.string(),
    staffName: v.string(),
    notificationKindLabel: v.string(),
    channel: v.optional(v.union(v.literal("email"), v.literal("line"))),
    lastFailedAt: v.number(),
    canRetry: v.boolean(),
    canResolve: v.boolean(),
    occurredAt: v.number(),
  }),
  v.object({
    id: v.string(),
    kind: v.literal("managerInvitation"),
    scope: actionScopeValidator,
    invitationId: v.id("organizationInvitations"),
    inviteeName: v.string(),
    invitedEmail: v.string(),
    status: v.union(v.literal("sendFailed"), v.literal("limitReached"), v.literal("conflict")),
    expiresAt: v.number(),
    canResend: v.boolean(),
    canRevoke: v.boolean(),
    occurredAt: v.number(),
  }),
);

const continuationByKindValidator = v.object({
  shift: v.optional(v.string()),
  staffRegistration: v.optional(v.string()),
  notificationFailure: v.optional(v.string()),
  managerInvitation: v.optional(v.string()),
});

const hasMoreByKindValidator = v.object({
  shift: v.optional(v.boolean()),
  staffRegistration: v.optional(v.boolean()),
  notificationFailure: v.optional(v.boolean()),
  managerInvitation: v.optional(v.boolean()),
});

type ActionKind = typeof actionKindValidator.type;
type ActionItem = typeof actionItemValidator.type;
type OrganizationActionQueryCtx = QueryCtx & {
  user: Doc<"users">;
  organization: Doc<"organizations">;
  organizationPerson: Doc<"organizationPeople">;
  organizationMember: Doc<"organizationMembers">;
};

type CursorPayload = {
  organizationId: string;
  shopFilter: string;
  kind: ActionKind;
  shopIds: string[];
  shopIndex: number;
  sourceCursor: string | null;
};

type ShopSourceCursor = Pick<CursorPayload, "shopIds" | "shopIndex" | "sourceCursor">;

/**
 * 対応一覧はsource documentを複製せず、その時点で未解決の4種類を最小DTOへ投影する。
 * `refreshBucket`は購読を再実行する契機だけに使い、時刻判定は常にserverのDate.now()を正本にする。
 */
export const getActionInbox = organizationQuery({
  args: {
    shopFilter: v.union(v.literal("all"), v.id("shops")),
    refreshBucket: v.number(),
    loadMore: v.optional(v.object({ kind: actionKindValidator, cursor: v.string() })),
  },
  returns: v.object({
    items: v.array(actionItemValidator),
    continuationByKind: continuationByKindValidator,
    hasMoreByKind: hasMoreByKindValidator,
    nextRefreshAt: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.refreshBucket) || args.refreshBucket < 0) {
      throw new ConvexError("refreshBucket must be a non-negative integer");
    }

    const shops = await resolveActionShops(ctx, args.shopFilter);
    const requestedKinds: ActionKind[] = args.loadMore
      ? [args.loadMore.kind]
      : ["shift", "staffRegistration", "notificationFailure", "managerInvitation"];
    const cursors = new Map<ActionKind, ShopSourceCursor>();
    if (args.loadMore) {
      cursors.set(
        args.loadMore.kind,
        decodeCursor(args.loadMore.cursor, {
          organizationId: ctx.organization._id,
          shopFilter: args.shopFilter,
          kind: args.loadMore.kind,
          shopIds: shops.map((shop) => shop._id),
        }),
      );
    }

    const now = Date.now();
    const capabilities = await resolveActionCapabilities(ctx);
    const pages = await Promise.all(
      requestedKinds.map(async (kind) => {
        const cursor = cursors.get(kind) ?? createInitialCursor(shops);
        if (kind === "shift") return await readShiftActions(ctx, shops, now, cursor);
        if (kind === "staffRegistration") {
          return await readStaffRegistrationActions(ctx, shops, capabilities, cursor);
        }
        if (kind === "notificationFailure") {
          return await readNotificationFailureActions(ctx, shops, capabilities, cursor);
        }
        return args.shopFilter === "all"
          ? await readManagerInvitationActions(ctx, now, cursor)
          : emptySourcePage<ActionItem>();
      }),
    );

    const continuationByKind: Partial<Record<ActionKind, string>> = {};
    const hasMoreByKind: Partial<Record<ActionKind, boolean>> = {};
    let nextRefreshAt: number | undefined;
    const items: ActionItem[] = [];
    for (let index = 0; index < pages.length; index += 1) {
      const kind = requestedKinds[index];
      const page = pages[index];
      items.push(...page.items);
      if (page.continuation) {
        continuationByKind[kind] = encodeCursor({
          organizationId: ctx.organization._id,
          shopFilter: args.shopFilter,
          kind,
          ...page.continuation,
        });
        hasMoreByKind[kind] = true;
      }
      if (page.nextRefreshAt !== undefined) {
        nextRefreshAt = nextRefreshAt === undefined ? page.nextRefreshAt : Math.min(nextRefreshAt, page.nextRefreshAt);
      }
    }

    items.sort(compareActionItems);
    return {
      items,
      continuationByKind,
      hasMoreByKind,
      ...(nextRefreshAt !== undefined ? { nextRefreshAt } : {}),
    };
  },
});

async function resolveActionShops(
  ctx: OrganizationActionQueryCtx,
  shopFilter: "all" | Id<"shops">,
): Promise<Doc<"shops">[]> {
  if (shopFilter !== "all") {
    const shop = await ctx.db.get(shopFilter);
    if (!shop || shop.isDeleted || shop.organizationId !== ctx.organization._id) {
      throw new ConvexError("Not found");
    }
    return [shop];
  }

  const shopRows = await ctx.db
    .query("shops")
    .withIndex("by_organizationId_and_isDeleted", (q) =>
      q.eq("organizationId", ctx.organization._id).eq("isDeleted", false),
    )
    .take(MAX_SHOPS + 1);
  if (shopRows.length > MAX_SHOPS) {
    throw new ConvexError("店舗数が安全な取得上限を超えています。管理画面で店舗数を確認してください。");
  }
  return shopRows;
}

type ActionCapabilities = {
  canWriteNormally: boolean;
  canRecoverUsageLimits: boolean;
};

async function resolveActionCapabilities(ctx: OrganizationActionQueryCtx): Promise<ActionCapabilities> {
  if (ctx.organizationMember.status !== "active") {
    return { canWriteNormally: false, canRecoverUsageLimits: false };
  }
  const access = await getOrganizationAccessPolicy(ctx, ctx.organization._id);
  // billing rowがない移行中組織は既存managerMutationと同じ互換動作を維持する。
  return {
    canWriteNormally: access?.canWriteBusinessData ?? true,
    canRecoverUsageLimits: access?.accessMode === "limitRecoveryOnly",
  };
}

type SourcePage<T extends ActionItem> = {
  items: T[];
  continuation?: ShopSourceCursor;
  nextRefreshAt?: number;
};

function emptySourcePage<T extends ActionItem>(): SourcePage<T> {
  return { items: [] };
}

function createInitialCursor(shops: readonly Doc<"shops">[]): ShopSourceCursor {
  return {
    shopIds: shops.map((shop) => shop._id),
    shopIndex: 0,
    sourceCursor: null,
  };
}

function nextShopCursor(cursor: ShopSourceCursor, shopIndex: number, sourceCursor: string | null): ShopSourceCursor {
  return { shopIds: cursor.shopIds, shopIndex, sourceCursor };
}

// 初回queryは4sourceを同時に読むため、1実行1回しか使えないnative paginateではなく
// index keyと_creationTimeをopaque cursorへ保存してsourceごとに続きを読む。
type SourcePosition =
  | { kind: "shift"; documentId: string; deadline: string; creationTime: number }
  | { kind: "staffRegistration"; documentId: string; creationTime: number }
  | { kind: "notificationFailure"; documentId: string; lastFailedAt: number; creationTime: number };

type BoundedBatch<T> = { rows: T[]; hasMore: boolean };

function boundedBatch<T>(rows: T[], limit = SOURCE_SCAN_LIMIT): BoundedBatch<T> {
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

function encodeSourcePosition(position: SourcePosition) {
  return JSON.stringify(position);
}

function decodeSourcePosition(cursor: string, expectedKind: SourcePosition["kind"]): SourcePosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cursor);
  } catch {
    throw new ConvexError("Invalid continuation cursor");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("kind" in parsed) ||
    parsed.kind !== expectedKind ||
    !("documentId" in parsed) ||
    typeof parsed.documentId !== "string"
  ) {
    throw new ConvexError("Invalid continuation cursor");
  }
  const position = parsed as SourcePosition;
  if (
    (position.kind === "shift" && (typeof position.deadline !== "string" || !Number.isFinite(position.creationTime))) ||
    (position.kind === "staffRegistration" && !Number.isFinite(position.creationTime)) ||
    (position.kind === "notificationFailure" &&
      (!Number.isFinite(position.lastFailedAt) || !Number.isFinite(position.creationTime)))
  ) {
    throw new ConvexError("Invalid continuation cursor");
  }
  return position;
}

function shiftPosition(recruitment: Doc<"recruitments">): SourcePosition {
  return {
    kind: "shift",
    documentId: recruitment._id,
    deadline: recruitment.deadline,
    creationTime: recruitment._creationTime,
  };
}

function registrationPosition(request: Doc<"staffRegistrationRequests">): SourcePosition {
  return {
    kind: "staffRegistration",
    documentId: request._id,
    creationTime: request._creationTime,
  };
}

function notificationFailurePosition(failure: Doc<"notificationFailureInbox">): SourcePosition {
  return {
    kind: "notificationFailure",
    documentId: failure._id,
    lastFailedAt: failure.lastFailedAt,
    creationTime: failure._creationTime,
  };
}

async function readShiftBatch(
  ctx: OrganizationActionQueryCtx,
  shopId: Id<"shops">,
  today: string,
  sourceCursor: string | null,
): Promise<BoundedBatch<Doc<"recruitments">>> {
  if (!sourceCursor) {
    return boundedBatch(
      await ctx.db
        .query("recruitments")
        .withIndex("by_shopId_and_isDeleted_and_status_and_deadline", (q) =>
          q.eq("shopId", shopId).eq("isDeleted", false).eq("status", "open").lt("deadline", today),
        )
        .order("asc")
        .take(SOURCE_SCAN_LIMIT + 1),
    );
  }

  const position = decodeSourcePosition(sourceCursor, "shift");
  if (position.kind !== "shift") throw new ConvexError("Invalid continuation cursor");
  const recruitmentId = ctx.db.normalizeId("recruitments", position.documentId);
  const cursorRecruitment = recruitmentId ? await ctx.db.get(recruitmentId) : null;
  if (
    !cursorRecruitment ||
    cursorRecruitment.shopId !== shopId ||
    cursorRecruitment.deadline !== position.deadline ||
    cursorRecruitment._creationTime !== position.creationTime
  ) {
    throw new ConvexError("Invalid continuation cursor");
  }

  const sameDeadline = await ctx.db
    .query("recruitments")
    .withIndex("by_shopId_and_isDeleted_and_status_and_deadline", (q) =>
      q
        .eq("shopId", shopId)
        .eq("isDeleted", false)
        .eq("status", "open")
        .eq("deadline", position.deadline)
        .gt("_creationTime", position.creationTime),
    )
    .order("asc")
    .take(SOURCE_SCAN_LIMIT + 1);
  if (sameDeadline.length > SOURCE_SCAN_LIMIT) return boundedBatch(sameDeadline);

  const laterDeadlines = await ctx.db
    .query("recruitments")
    .withIndex("by_shopId_and_isDeleted_and_status_and_deadline", (q) =>
      q
        .eq("shopId", shopId)
        .eq("isDeleted", false)
        .eq("status", "open")
        .gt("deadline", position.deadline)
        .lt("deadline", today),
    )
    .order("asc")
    .take(SOURCE_SCAN_LIMIT + 1 - sameDeadline.length);
  return boundedBatch([...sameDeadline, ...laterDeadlines]);
}

async function readRegistrationBatch(
  ctx: OrganizationActionQueryCtx,
  shopId: Id<"shops">,
  sourceCursor: string | null,
): Promise<BoundedBatch<Doc<"staffRegistrationRequests">>> {
  let afterCreationTime: number | undefined;
  if (sourceCursor) {
    const position = decodeSourcePosition(sourceCursor, "staffRegistration");
    if (position.kind !== "staffRegistration") throw new ConvexError("Invalid continuation cursor");
    const requestId = ctx.db.normalizeId("staffRegistrationRequests", position.documentId);
    const cursorRequest = requestId ? await ctx.db.get(requestId) : null;
    if (!cursorRequest || cursorRequest.shopId !== shopId || cursorRequest._creationTime !== position.creationTime) {
      throw new ConvexError("Invalid continuation cursor");
    }
    afterCreationTime = position.creationTime;
  }
  return boundedBatch(
    await ctx.db
      .query("staffRegistrationRequests")
      .withIndex("by_shopId_status", (q) => {
        const range = q.eq("shopId", shopId).eq("status", "pending");
        return afterCreationTime === undefined ? range : range.gt("_creationTime", afterCreationTime);
      })
      .order("asc")
      .take(SOURCE_SCAN_LIMIT + 1),
  );
}

async function readNotificationFailureBatch(
  ctx: OrganizationActionQueryCtx,
  shopId: Id<"shops">,
  sourceCursor: string | null,
): Promise<BoundedBatch<Doc<"notificationFailureInbox">>> {
  if (!sourceCursor) {
    return boundedBatch(
      await ctx.db
        .query("notificationFailureInbox")
        .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", shopId).eq("status", "open"))
        .order("desc")
        .take(SOURCE_SCAN_LIMIT + 1),
    );
  }

  const position = decodeSourcePosition(sourceCursor, "notificationFailure");
  if (position.kind !== "notificationFailure") throw new ConvexError("Invalid continuation cursor");
  const failureId = ctx.db.normalizeId("notificationFailureInbox", position.documentId);
  const cursorFailure = failureId ? await ctx.db.get(failureId) : null;
  if (
    !cursorFailure ||
    cursorFailure.shopId !== shopId ||
    cursorFailure.lastFailedAt !== position.lastFailedAt ||
    cursorFailure._creationTime !== position.creationTime
  ) {
    throw new ConvexError("Invalid continuation cursor");
  }

  const sameFailureTime = await ctx.db
    .query("notificationFailureInbox")
    .withIndex("by_shopId_status_lastFailedAt", (q) =>
      q
        .eq("shopId", shopId)
        .eq("status", "open")
        .eq("lastFailedAt", position.lastFailedAt)
        .lt("_creationTime", position.creationTime),
    )
    .order("desc")
    .take(SOURCE_SCAN_LIMIT + 1);
  if (sameFailureTime.length > SOURCE_SCAN_LIMIT) return boundedBatch(sameFailureTime);

  const olderFailures = await ctx.db
    .query("notificationFailureInbox")
    .withIndex("by_shopId_status_lastFailedAt", (q) =>
      q.eq("shopId", shopId).eq("status", "open").lt("lastFailedAt", position.lastFailedAt),
    )
    .order("desc")
    .take(SOURCE_SCAN_LIMIT + 1 - sameFailureTime.length);
  return boundedBatch([...sameFailureTime, ...olderFailures]);
}

function continuationAfterScan(args: {
  cursor: ShopSourceCursor;
  shopIndex: number;
  sourceCursor: string;
  hasMoreInShop: boolean;
  hasLaterShop: boolean;
}): ShopSourceCursor | undefined {
  if (args.hasMoreInShop) return nextShopCursor(args.cursor, args.shopIndex, args.sourceCursor);
  if (args.hasLaterShop) return nextShopCursor(args.cursor, args.shopIndex + 1, null);
  return undefined;
}

async function readShiftActions(
  ctx: OrganizationActionQueryCtx,
  shops: readonly Doc<"shops">[],
  now: number,
  cursor: ShopSourceCursor,
): Promise<SourcePage<Extract<ActionItem, { kind: "shift" }>>> {
  const today = dateJST(now);
  const pageRows: Array<{ shop: Doc<"shops">; recruitment: Doc<"recruitments"> }> = [];
  let shopIndex = cursor.shopIndex;
  let sourceCursor = cursor.sourceCursor;
  let continuation: ShopSourceCursor | undefined;
  while (shopIndex < shops.length && pageRows.length < SOURCE_PAGE_SIZE) {
    const shop = shops[shopIndex];
    const batch = await readShiftBatch(ctx, shop._id, today, sourceCursor);
    let scannedCount = 0;
    for (const recruitment of batch.rows) {
      scannedCount += 1;
      sourceCursor = encodeSourcePosition(shiftPosition(recruitment));
      if (recruitment.periodEnd >= today) pageRows.push({ shop, recruitment });
      if (pageRows.length === SOURCE_PAGE_SIZE) break;
    }
    if (pageRows.length === SOURCE_PAGE_SIZE && sourceCursor) {
      continuation = continuationAfterScan({
        cursor,
        shopIndex,
        sourceCursor,
        hasMoreInShop: scannedCount < batch.rows.length || batch.hasMore,
        hasLaterShop: shopIndex + 1 < shops.length,
      });
      break;
    }
    if (batch.hasMore && sourceCursor) {
      continuation = nextShopCursor(cursor, shopIndex, sourceCursor);
      break;
    }
    shopIndex += 1;
    sourceCursor = null;
  }

  const totalStaffByShop = new Map<Id<"shops">, Promise<{ count: number; hasOverflow: boolean }>>();
  const items = await Promise.all(
    pageRows.map(async ({ shop, recruitment }) => {
      let totalStaffPromise = totalStaffByShop.get(shop._id);
      if (!totalStaffPromise) {
        totalStaffPromise = getBoundedTotalStaffCount(ctx, shop._id);
        totalStaffByShop.set(shop._id, totalStaffPromise);
      }
      const totalStaff = await totalStaffPromise;
      const projected = await toDashboardRecruitment(ctx, recruitment, totalStaff.count);
      return {
        id: `shift:${recruitment._id}`,
        kind: "shift" as const,
        scope: { kind: "shop" as const, organizationId: ctx.organization._id, shopId: shop._id },
        recruitmentId: recruitment._id,
        shopName: shop.name,
        periodStart: recruitment.periodStart,
        periodEnd: recruitment.periodEnd,
        deadline: recruitment.deadline,
        responseCount: projected.responseCount,
        totalStaffCount: projected.totalStaffCount,
        totalStaffCountHasOverflow: totalStaff.hasOverflow,
        occurredAt: getDeadlineCutoff(recruitment.deadline),
      };
    }),
  );

  const refreshCandidates = (
    await Promise.all(
      shops.map(async (shop) => {
        const [nextDeadline, currentActionCandidates] = await Promise.all([
          ctx.db
            .query("recruitments")
            .withIndex("by_shopId_and_isDeleted_and_status_and_deadline", (q) =>
              q.eq("shopId", shop._id).eq("isDeleted", false).eq("status", "open").gte("deadline", today),
            )
            .order("asc")
            .first(),
          ctx.db
            .query("recruitments")
            .withIndex("by_shopId_and_isDeleted_and_status_and_periodEnd", (q) =>
              q.eq("shopId", shop._id).eq("isDeleted", false).eq("status", "open").gte("periodEnd", today),
            )
            .order("asc")
            .take(SOURCE_SCAN_LIMIT + 1),
        ]);
        if (currentActionCandidates.length > SOURCE_SCAN_LIMIT) {
          throw new ConvexError("募集数が安全な取得上限を超えています。店舗のシフト一覧を確認してください。");
        }
        const currentAction = currentActionCandidates.find((recruitment) => recruitment.deadline < today);
        return [
          ...(nextDeadline ? [getDeadlineCutoff(nextDeadline.deadline)] : []),
          ...(currentAction ? [getDeadlineCutoff(currentAction.periodEnd)] : []),
        ];
      }),
    )
  )
    .flat()
    .filter((candidate) => candidate > now);

  return {
    items,
    ...(continuation ? { continuation } : {}),
    ...(refreshCandidates.length > 0 ? { nextRefreshAt: Math.min(...refreshCandidates) } : {}),
  };
}

async function getBoundedTotalStaffCount(ctx: OrganizationActionQueryCtx, shopId: Id<"shops">) {
  const activeStaffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(DASHBOARD_RESPONSE_COUNT_LIMIT + 1);
  const hasOverflow = activeStaffs.length > DASHBOARD_RESPONSE_COUNT_LIMIT;
  const countedStaffs = hasOverflow ? activeStaffs.slice(0, DASHBOARD_RESPONSE_COUNT_LIMIT) : activeStaffs;
  return {
    count: countedStaffs.filter((staff) => !staff.excludedFromShift).length,
    hasOverflow,
  };
}

async function readStaffRegistrationActions(
  ctx: OrganizationActionQueryCtx,
  shops: readonly Doc<"shops">[],
  capabilities: ActionCapabilities,
  cursor: ShopSourceCursor,
): Promise<SourcePage<Extract<ActionItem, { kind: "staffRegistration" }>>> {
  const pageRows: Array<{ shop: Doc<"shops">; request: Doc<"staffRegistrationRequests"> }> = [];
  let shopIndex = cursor.shopIndex;
  let sourceCursor = cursor.sourceCursor;
  let continuation: ShopSourceCursor | undefined;
  while (shopIndex < shops.length && pageRows.length < SOURCE_PAGE_SIZE) {
    const shop = shops[shopIndex];
    const batch = await readRegistrationBatch(ctx, shop._id, sourceCursor);
    let scannedCount = 0;
    for (const request of batch.rows) {
      scannedCount += 1;
      sourceCursor = encodeSourcePosition(registrationPosition(request));
      pageRows.push({ shop, request });
      if (pageRows.length === SOURCE_PAGE_SIZE) break;
    }
    if (pageRows.length === SOURCE_PAGE_SIZE && sourceCursor) {
      continuation = continuationAfterScan({
        cursor,
        shopIndex,
        sourceCursor,
        hasMoreInShop: scannedCount < batch.rows.length || batch.hasMore,
        hasLaterShop: shopIndex + 1 < shops.length,
      });
      break;
    }
    shopIndex += 1;
    sourceCursor = null;
  }
  const items = await Promise.all(
    pageRows.map(async ({ shop, request }) => {
      const approvalAvailability = capabilities.canWriteNormally
        ? await resolveStaffRegistrationApprovalAvailability(ctx, {
            organizationId: ctx.organization._id,
            targetShopId: shop._id,
            emailNormalized: request.emailNormalized,
          })
        : {
            canApprove: false,
            approveDisabledReason: "現在の利用状態では承認できません。",
          };
      return {
        id: `staffRegistration:${request._id}`,
        kind: "staffRegistration" as const,
        scope: { kind: "shop" as const, organizationId: ctx.organization._id, shopId: shop._id },
        requestId: request._id,
        shopName: shop.name,
        applicantName: request.name,
        createdAt: request.createdAt,
        ...approvalAvailability,
        canReject: capabilities.canWriteNormally || capabilities.canRecoverUsageLimits,
        occurredAt: request.createdAt,
      };
    }),
  );
  return {
    items,
    ...(continuation ? { continuation } : {}),
  };
}

async function readNotificationFailureActions(
  ctx: OrganizationActionQueryCtx,
  shops: readonly Doc<"shops">[],
  capabilities: ActionCapabilities,
  cursor: ShopSourceCursor,
): Promise<SourcePage<Extract<ActionItem, { kind: "notificationFailure" }>>> {
  const pageRows: Array<{ shop: Doc<"shops">; failure: Doc<"notificationFailureInbox"> }> = [];
  let shopIndex = cursor.shopIndex;
  let sourceCursor = cursor.sourceCursor;
  let continuation: ShopSourceCursor | undefined;
  while (shopIndex < shops.length && pageRows.length < SOURCE_PAGE_SIZE) {
    const shop = shops[shopIndex];
    const batch = await readNotificationFailureBatch(ctx, shop._id, sourceCursor);
    let scannedCount = 0;
    for (const failure of batch.rows) {
      scannedCount += 1;
      sourceCursor = encodeSourcePosition(notificationFailurePosition(failure));
      if (await isManagerVisibleNotificationFailure(ctx, failure)) pageRows.push({ shop, failure });
      if (pageRows.length === SOURCE_PAGE_SIZE) break;
    }
    if (pageRows.length === SOURCE_PAGE_SIZE && sourceCursor) {
      continuation = continuationAfterScan({
        cursor,
        shopIndex,
        sourceCursor,
        hasMoreInShop: scannedCount < batch.rows.length || batch.hasMore,
        hasLaterShop: shopIndex + 1 < shops.length,
      });
      break;
    }
    if (batch.hasMore && sourceCursor) {
      continuation = nextShopCursor(cursor, shopIndex, sourceCursor);
      break;
    }
    shopIndex += 1;
    sourceCursor = null;
  }
  const items = await Promise.all(
    pageRows.map(async ({ shop, failure }) => {
      const staff = failure.staffId ? await ctx.db.get(failure.staffId) : null;
      const context = describeNotificationFailureContext(failure.notificationContext);
      const retryable =
        (isLineInviteResendContext(failure.notificationContext) && Boolean(failure.staffId)) ||
        (failure.sourceType === "outbox" && Boolean(failure.outboxId)) ||
        Boolean(
          failure.staffId && failure.recruitmentId && getNotificationFailureResendKind(failure.notificationContext),
        );
      return {
        id: `notificationFailure:${failure._id}`,
        kind: "notificationFailure" as const,
        scope: { kind: "shop" as const, organizationId: ctx.organization._id, shopId: shop._id },
        failureId: failure._id,
        shopName: shop.name,
        staffName: staff?.name ?? "不明なスタッフ",
        notificationKindLabel: context.label,
        ...(failure.channel ? { channel: failure.channel } : {}),
        lastFailedAt: failure.lastFailedAt,
        canRetry: capabilities.canWriteNormally && retryable,
        canResolve: capabilities.canWriteNormally || capabilities.canRecoverUsageLimits,
        occurredAt: failure.lastFailedAt,
      };
    }),
  );
  return { items, ...(continuation ? { continuation } : {}) };
}

async function readManagerInvitationActions(
  ctx: OrganizationActionQueryCtx,
  now: number,
  cursor: ShopSourceCursor,
): Promise<SourcePage<Extract<ActionItem, { kind: "managerInvitation" }>>> {
  // 通常時は最大5件、上限整理中は取消用にbounded overflow 1件までをcanonical helperが返す。
  // どちらも返却上限8件を超えないため、未発行のcontinuationは受け付けない。
  if (cursor.sourceCursor) throw new ConvexError("Invalid continuation cursor");
  const overview = await getCanonicalManagerSettingsOverview(ctx, { now });
  if (overview.kind !== "ready") throw new ConvexError(overview.message);
  const candidates = overview.invitations
    .filter(
      (invitation): invitation is typeof invitation & { status: "sendFailed" | "limitReached" | "conflict" } =>
        invitation.status === "sendFailed" || invitation.status === "limitReached" || invitation.status === "conflict",
    )
    .sort((left, right) => left.expiresAt - right.expiresAt || left.invitationId.localeCompare(right.invitationId));
  if (candidates.length > SOURCE_PAGE_SIZE) {
    throw new ConvexError("管理者招待数が安全な取得上限を超えています。管理者設定を確認してください。");
  }
  return {
    items: candidates.map((invitation) => ({
      id: `managerInvitation:${invitation.invitationId}`,
      kind: "managerInvitation" as const,
      scope: { kind: "organization" as const, organizationId: ctx.organization._id },
      invitationId: invitation.invitationId,
      inviteeName: invitation.name,
      invitedEmail: invitation.invitedEmail,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      canResend: invitation.canResend,
      canRevoke: invitation.canRevoke,
      occurredAt: invitation.expiresAt,
    })),
  };
}

function compareActionItems(left: ActionItem, right: ActionItem) {
  const priority: Record<ActionKind, number> = {
    shift: 0,
    staffRegistration: 1,
    notificationFailure: 2,
    managerInvitation: 3,
  };
  return (
    priority[left.kind] - priority[right.kind] || right.occurredAt - left.occurredAt || left.id.localeCompare(right.id)
  );
}

function encodeCursor(payload: CursorPayload) {
  return JSON.stringify(payload);
}

function decodeCursor(
  cursor: string,
  expected: Pick<CursorPayload, "organizationId" | "shopFilter" | "kind" | "shopIds">,
): ShopSourceCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cursor);
  } catch {
    throw new ConvexError("Invalid continuation cursor");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("organizationId" in parsed) ||
    !("shopFilter" in parsed) ||
    !("kind" in parsed) ||
    !("shopIds" in parsed) ||
    !("shopIndex" in parsed) ||
    !("sourceCursor" in parsed)
  ) {
    throw new ConvexError("Invalid continuation cursor");
  }
  const payload = parsed as CursorPayload;
  if (
    payload.organizationId !== expected.organizationId ||
    payload.shopFilter !== expected.shopFilter ||
    payload.kind !== expected.kind ||
    !Array.isArray(payload.shopIds) ||
    payload.shopIds.length !== expected.shopIds.length ||
    payload.shopIds.some((shopId, index) => shopId !== expected.shopIds[index]) ||
    !Number.isSafeInteger(payload.shopIndex) ||
    payload.shopIndex < 0 ||
    payload.shopIndex >= expected.shopIds.length ||
    (payload.sourceCursor !== null && typeof payload.sourceCursor !== "string")
  ) {
    throw new ConvexError("Invalid continuation cursor");
  }
  return {
    shopIds: expected.shopIds,
    shopIndex: payload.shopIndex,
    sourceCursor: payload.sourceCursor,
  };
}
