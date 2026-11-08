import type { PaginationOptions } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { addDays } from "../_lib/dateFormat";
import { DAY_MS } from "../constants";
import { getOrganizationPersonLineState, resolveCanonicalStaffScope } from "../line/service";
import { getOrganizationActualUsageProbe, type OrganizationUsageDimension } from "../organization/service";
import { ORGANIZATION_PLAN_LIMITS } from "../organizationBilling/planLimits";
import { hasValidCanonicalStaffUserLifecycle } from "../staff/service";
import type {
  AnalyticsOrganizationListRowDto,
  AnalyticsPageInfoDto,
  AnalyticsShopAttention,
  AnalyticsShopListRowDto,
  AnalyticsShopRowDto,
  BillingOverviewDto,
  CycleRowDto,
  NotificationOutboxStatus,
  OrganizationBillingSummaryDto,
  ShopBillingFilter,
  StaffRowDto,
} from "./dto";
import { ANALYTICS_DASHBOARD_MAX_SCAN_ROWS, CREATION_TIME_CURSOR_PATTERN } from "./schemas";

// 一覧の1行は、一店舗あたりstaff 201件、person/user各200件まで読む。1回に返す行も20件に抑える。
export const LIST_PAGE_LIMIT = 20;
export const SHOP_LIST_STAFF_SCAN_LIMIT = 200;
const ORGANIZATION_LIST_SHOP_LIMIT = 10;
/** 条件に合う1行を最後まで組み立てられるよう、走査を止める前に残す読み取りの余力。 */
const SCAN_RESERVE = { documentsRead: 2_000, bytesRead: 2 * 1024 * 1024, databaseQueries: 1_000 };
/** 最後の提出・確定からこの日数以上たった店舗を要注意にする。 */
export const SHOP_INACTIVE_DAYS = 14;
/** 一覧の「通知あり」の絞り込みで、通知の受付を確認する直近の日数。 */
export const RECENT_NOTIFICATION_DAYS = 14;
/**
 * 一覧の「2名以上」の絞り込みで求める人数。店舗の作成時に管理者自身もスタッフとして登録されるため、
 * 1名の店舗・組織は管理者だけで、スタッフを迎えていない。
 */
const MULTI_STAFF_MIN_COUNT = 2;
/** 利用の手がかりにする通知の状態。組織の停止などで取り消した通知は含めない。 */
const NOTIFIED_STATUSES: readonly NotificationOutboxStatus[] = ["sent", "failed", "pending", "processing"];
const TRIAL_ENDING_SOON_MS = 7 * DAY_MS;

export function paginationOptions(cursor: string | null, limit: number, maximum = 100): PaginationOptions {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > maximum ||
    (cursor !== null && (cursor.length === 0 || cursor.length > 4096))
  )
    throw new Error("invalid_request");
  return { cursor, numItems: limit, maximumRowsRead: ANALYTICS_DASHBOARD_MAX_SCAN_ROWS, maximumBytesRead: 512 * 1024 };
}
export function pageInfo(
  cursor: string | null,
  limit: number,
  result: { isDone: boolean; continueCursor: string },
  returnedCount: number,
): AnalyticsPageInfoDto {
  return {
    cursor,
    continueCursor: result.isDone ? null : result.continueCursor,
    isDone: result.isDone,
    pageSize: limit,
    returnedCount,
  };
}
async function scanBudgetLow(ctx: QueryCtx) {
  const metrics = await ctx.meta.getTransactionMetrics();
  return (
    metrics.documentsRead.remaining < SCAN_RESERVE.documentsRead ||
    metrics.bytesRead.remaining < SCAN_RESERVE.bytesRead ||
    metrics.databaseQueries.remaining < SCAN_RESERVE.databaseQueries
  );
}
/**
 * 作成の新しい順に全件を読み、条件に合う行が上限に達するか、走査の上限・余力に達するまで続ける。
 * cursorは最後に確認した行の作成時刻で、次の呼び出しはそれより前から読む。
 */
export async function scanNewestFirst<D extends { _creationTime: number }, R>(
  ctx: QueryCtx,
  source: (before: number | null) => AsyncIterable<D>,
  page: { cursor: string | null; limit: number },
  match: (doc: D) => Promise<R | null>,
): Promise<{ rows: R[]; pageInfo: AnalyticsPageInfoDto }> {
  if (
    !Number.isInteger(page.limit) ||
    page.limit < 1 ||
    (page.cursor !== null && !CREATION_TIME_CURSOR_PATTERN.test(page.cursor))
  )
    throw new Error("invalid_request");
  const limit = Math.min(page.limit, LIST_PAGE_LIMIT);
  const rows: R[] = [];
  let last: number | null = null;
  let scanned = 0;
  let isDone = true;
  for await (const doc of source(page.cursor === null ? null : Number(page.cursor))) {
    // 同じ作成時刻の行は次の呼び出しで読めないため、境界の時刻では止めない。
    if (
      last !== null &&
      doc._creationTime !== last &&
      (rows.length >= limit || scanned >= ANALYTICS_DASHBOARD_MAX_SCAN_ROWS || (await scanBudgetLow(ctx)))
    ) {
      isDone = false;
      break;
    }
    last = doc._creationTime;
    scanned += 1;
    const row = await match(doc);
    if (row !== null) rows.push(row);
  }
  return {
    rows,
    pageInfo: {
      cursor: page.cursor,
      continueCursor: isDone || last === null ? null : String(last),
      isDone,
      pageSize: limit,
      returnedCount: rows.length,
    },
  };
}
export function emptyPageInfo(cursor: string | null, limit: number): AnalyticsPageInfoDto {
  return { cursor, continueCursor: null, isDone: true, pageSize: limit, returnedCount: 0 };
}
export async function currentShop(ctx: QueryCtx, shopId: string) {
  const id = ctx.db.normalizeId("shops", shopId);
  const shop = id ? await ctx.db.get(id) : null;
  if (!shop || shop.isDeleted) return null;
  const organization = await ctx.db.get(shop.organizationId);
  if (!organization || organization.isDeleted) return null;
  return { shop, organization };
}
export function shopRow(shop: Doc<"shops">, organization: Doc<"organizations">): AnalyticsShopRowDto {
  return {
    shopId: shop._id,
    name: shop.name,
    organizationId: organization._id,
    organizationName: organization.name,
    registeredAt: shop._creationTime,
    isDeleted: false,
  };
}
export function billingSummary(state: Doc<"organizationBillingStates">["state"]): OrganizationBillingSummaryDto {
  switch (state.kind) {
    case "trial":
      return { kind: state.kind, plan: null, targetPlan: state.selectedPaidPlan ?? null, dueAt: state.trialEndsAt };
    case "initialPaymentPending":
    case "pendingActivation":
      return { kind: state.kind, plan: null, targetPlan: state.plan, dueAt: null };
    case "active":
    case "complimentary":
      return { kind: state.kind, plan: state.plan, targetPlan: null, dueAt: null };
    case "scheduledChange":
      return { kind: state.kind, plan: state.currentPlan, targetPlan: state.targetPlan, dueAt: state.effectiveAt };
    case "paymentTerminationPending":
      return {
        kind: state.kind,
        plan: state.previousPlan === "trial" ? null : state.previousPlan,
        targetPlan: null,
        dueAt: null,
      };
  }
}
export async function organizationBilling(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
): Promise<OrganizationBillingSummaryDto | null> {
  const row = await ctx.db
    .query("organizationBillingStates")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .first();
  return row ? billingSummary(row.state) : null;
}
export function billingMatches(billing: OrganizationBillingSummaryDto | null, filter: ShopBillingFilter): boolean {
  if (!billing) return false;
  switch (filter) {
    case "paid":
      return billing.kind === "active" && (billing.plan === "standard" || billing.plan === "pro");
    case "free":
      return billing.kind === "active" && billing.plan === "free";
    case "pending":
      return billing.kind === "initialPaymentPending" || billing.kind === "pendingActivation";
    default:
      return billing.kind === filter;
  }
}
/** 現在の契約状態ごとの組織数。削除済み組織は数えない。 */
export async function billingOverview(ctx: QueryCtx, asOf: number): Promise<BillingOverviewDto> {
  const rows = await ctx.db.query("organizationBillingStates").take(ANALYTICS_DASHBOARD_MAX_SCAN_ROWS + 1);
  const result: BillingOverviewDto = {
    organizationCount: 0,
    counts: {
      trial: 0,
      initialPaymentPending: 0,
      pendingActivation: 0,
      active: 0,
      complimentary: 0,
      scheduledChange: 0,
      paymentTerminationPending: 0,
    },
    activeByPlan: { free: 0, standard: 0, pro: 0 },
    trialEndingWithin7Days: 0,
    isPartial: rows.length > ANALYTICS_DASHBOARD_MAX_SCAN_ROWS,
  };
  for (const row of rows.slice(0, ANALYTICS_DASHBOARD_MAX_SCAN_ROWS)) {
    const organization = await ctx.db.get(row.organizationId);
    if (!organization || organization.isDeleted) continue;
    result.organizationCount += 1;
    result.counts[row.state.kind] += 1;
    if (row.state.kind === "active") result.activeByPlan[row.state.plan] += 1;
    if (
      row.state.kind === "trial" &&
      row.state.trialEndsAt >= asOf &&
      row.state.trialEndsAt < asOf + TRIAL_ENDING_SOON_MS
    )
      result.trialEndingWithin7Days += 1;
  }
  return result;
}
/**
 * 一覧の絞り込み条件。notifiedSinceを指定すると、その時刻以降に受け付けた通知がある対象だけを返す。
 * multiStaffは、管理者を含む人数がMULTI_STAFF_MIN_COUNT以上の対象だけを返す。
 */
type ListFilter = { billing: ShopBillingFilter | null; notifiedSince: number | null; multiStaff: boolean };
/**
 * 取消以外の通知を最後に受け付けた時刻。状態ごとの既存indexで、受付の新しい1件だけを読む。
 * 店舗の通知はすべて組織IDを持つため、組織では店舗宛と組織宛の両方を対象にできる。
 */
async function lastNotifiedAt(
  ctx: QueryCtx,
  target: { shopId: Id<"shops"> } | { organizationId: Id<"organizations"> },
): Promise<number | null> {
  const latest = await Promise.all(
    NOTIFIED_STATUSES.map((status) =>
      "shopId" in target
        ? ctx.db
            .query("notificationOutbox")
            .withIndex("by_shopId_status", (q) => q.eq("shopId", target.shopId).eq("status", status))
            .order("desc")
            .first()
        : ctx.db
            .query("notificationOutbox")
            .withIndex("by_organizationId_status", (q) =>
              q.eq("organizationId", target.organizationId).eq("status", status),
            )
            .order("desc")
            .first(),
    ),
  );
  const times = latest.flatMap((row) => (row ? [row._creationTime] : []));
  return times.length > 0 ? Math.max(...times) : null;
}
function notifiedSinceMatches(lastNotified: number | null, notifiedSince: number | null): boolean {
  return notifiedSince === null || (lastNotified !== null && lastNotified >= notifiedSince);
}
/**
 * 店舗一覧の1行。人数以外の絞り込みに一致しない店舗は、重いスタッフ数の集計前にnullを返す。
 */
export async function shopListRow(
  ctx: QueryCtx,
  shop: Doc<"shops">,
  organization: Doc<"organizations">,
  today: string,
  filter: ListFilter & { attention: boolean } = {
    billing: null,
    notifiedSince: null,
    multiStaff: false,
    attention: false,
  },
): Promise<AnalyticsShopListRowDto | null> {
  const billing = await organizationBilling(ctx, organization._id);
  if (filter.billing && !billingMatches(billing, filter.billing)) return null;
  const lastNotified = await lastNotifiedAt(ctx, { shopId: shop._id });
  if (!notifiedSinceMatches(lastNotified, filter.notifiedSince)) return null;
  const [latestShift, lastActivity] = await Promise.all([
    ctx.db
      .query("recruitments")
      .withIndex("by_shopId_and_isDeleted_and_periodStart", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
      .order("desc")
      .first(),
    // 登録だけの日は店舗ごとに最大1日のため、提出・確定のある日を見つけるまでの走査は有界。
    ctx.db
      .query("analyticsShopDays")
      .withIndex("by_shopId_and_date", (q) => q.eq("shopId", shop._id))
      .order("desc")
      .filter((q) => q.or(q.eq(q.field("submitted"), true), q.eq(q.field("confirmed"), true)))
      .first(),
  ]);
  const attention: AnalyticsShopAttention[] = [];
  if (latestShift && latestShift.periodEnd < today) attention.push("shift_ended");
  if (lastActivity && lastActivity.date <= addDays(today, -SHOP_INACTIVE_DAYS)) attention.push("inactive");
  if (filter.attention && attention.length === 0) return null;
  const staffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
    .take(SHOP_LIST_STAFF_SCAN_LIMIT + 1);
  let staffCount: number | null = null;
  if (staffs.length <= SHOP_LIST_STAFF_SCAN_LIMIT) {
    staffCount = 0;
    for (const staff of staffs) {
      if (staff.organizationId !== organization._id) continue;
      const person = await ctx.db.get(staff.organizationPersonId);
      if (person?.status !== "active" || person.organizationId !== organization._id) continue;
      if (!(await hasValidCanonicalStaffUserLifecycle(ctx, staff, person))) continue;
      staffCount += 1;
    }
  }
  // 走査上限を超える店舗は件数を返さないが、削除されていないスタッフが上限を超えて残るため2名以上に含める。
  if (filter.multiStaff && staffCount !== null && staffCount < MULTI_STAFF_MIN_COUNT) return null;
  return {
    ...shopRow(shop, organization),
    staffCount,
    latestShift: latestShift ? { periodStart: latestShift.periodStart, periodEnd: latestShift.periodEnd } : null,
    lastActivityDate: lastActivity?.date ?? null,
    lastNotifiedAt: lastNotified,
    billing,
    attention,
  };
}
/**
 * 組織一覧の1行。名称・契約・通知の絞り込みに一致しない組織は、利用人数の集計前にnullを返す。
 * 人数の絞り込みは、利用人数の集計後に判定する。
 * searchは小文字化済みの検索語で、組織名または現在の店舗名の一部と照合する。
 */
export async function organizationListRow(
  ctx: QueryCtx,
  organization: Doc<"organizations">,
  filter: ListFilter & { search: string },
): Promise<AnalyticsOrganizationListRowDto | null> {
  if (organization.isDeleted) return null;
  const shops = await ctx.db
    .query("shops")
    .withIndex("by_organizationId_and_isDeleted", (q) =>
      q.eq("organizationId", organization._id).eq("isDeleted", false),
    )
    .take(ORGANIZATION_LIST_SHOP_LIMIT);
  if (
    filter.search &&
    ![organization.name, ...shops.map((shop) => shop.name)].some((name) =>
      name.toLocaleLowerCase("ja").includes(filter.search),
    )
  )
    return null;
  const billing = await organizationBilling(ctx, organization._id);
  if (filter.billing && !billingMatches(billing, filter.billing)) return null;
  const lastNotified = await lastNotifiedAt(ctx, { organizationId: organization._id });
  if (!notifiedSinceMatches(lastNotified, filter.notifiedSince)) return null;
  const probe = await getOrganizationActualUsageProbe(ctx, organization._id, ORGANIZATION_PLAN_LIMITS.pro);
  // 走査上限に達して利用人数を表示できない組織でも、数えた人数は実数の下限になるため判定に使える。
  if (filter.multiStaff && probe.usage.peopleCount < MULTI_STAFF_MIN_COUNT) return null;
  const exact = (dimension: OrganizationUsageDimension, value: number) =>
    probe.unknownDimensions.includes(dimension) || probe.lowerBoundDimensions.includes(dimension) ? null : value;
  return {
    organizationId: organization._id,
    name: organization.name,
    registeredAt: organization._creationTime,
    billing,
    peopleCount: exact("people", probe.usage.peopleCount),
    activeManagerCount: exact("activeManagers", probe.usage.activeManagerCount),
    shopCount: exact("shops", probe.usage.shopCount),
    lastNotifiedAt: lastNotified,
    shops: shops.map((shop) => ({ shopId: shop._id, name: shop.name })),
  };
}
export function deletedShopRow(shopId: string): AnalyticsShopRowDto {
  return {
    shopId,
    name: "削除済み店舗",
    organizationId: null,
    organizationName: null,
    registeredAt: null,
    isDeleted: true,
  };
}
export function cycleRow(cycle: Doc<"recruitments">): CycleRowDto {
  return {
    recruitmentId: cycle._id,
    periodStart: cycle.periodStart,
    periodEnd: cycle.periodEnd,
    deadline: cycle.deadline,
    status: cycle.status,
    confirmedAt: cycle.confirmedAt ?? null,
  };
}
export async function staffRow(ctx: QueryCtx, staffId: Id<"staffs">, shopId: Id<"shops">): Promise<StaffRowDto | null> {
  const scope = await resolveCanonicalStaffScope(ctx, { staffId, shopId });
  if (!scope) return null;
  const [line, member] = await Promise.all([
    getOrganizationPersonLineState(ctx, {
      organizationId: scope.organization._id,
      organizationPersonId: scope.person._id,
    }),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", scope.organization._id).eq("personId", scope.person._id),
      )
      .unique(),
  ]);
  return {
    staffId: scope.staff._id,
    name: scope.person.name,
    accountLinked: scope.person.userId !== undefined,
    isManager: member?.status === "active" && member.userId === scope.person.userId,
    excludedFromShift: scope.staff.excludedFromShift,
    lineStatus: line?.status ?? "unavailable",
  };
}
export async function recentCycles(ctx: QueryCtx, shopId: Id<"shops">) {
  return await ctx.db
    .query("recruitments")
    .withIndex("by_shopId_and_isDeleted_and_periodStart", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .order("desc")
    .take(20);
}
