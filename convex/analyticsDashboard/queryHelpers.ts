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
 * 店舗一覧の1行。絞り込みに一致しない店舗は、重いスタッフ数の集計前にnullを返す。
 */
export async function shopListRow(
  ctx: QueryCtx,
  shop: Doc<"shops">,
  organization: Doc<"organizations">,
  today: string,
  filter: { billing: ShopBillingFilter | null; attention: boolean } = { billing: null, attention: false },
): Promise<AnalyticsShopListRowDto | null> {
  const billing = await organizationBilling(ctx, organization._id);
  if (filter.billing && !billingMatches(billing, filter.billing)) return null;
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
  return {
    ...shopRow(shop, organization),
    staffCount,
    latestShift: latestShift ? { periodStart: latestShift.periodStart, periodEnd: latestShift.periodEnd } : null,
    lastActivityDate: lastActivity?.date ?? null,
    billing,
    attention,
  };
}
/**
 * 組織一覧の1行。名称と契約の絞り込みに一致しない組織は、利用人数の集計前にnullを返す。
 * searchは小文字化済みの検索語で、組織名または現在の店舗名の一部と照合する。
 */
export async function organizationListRow(
  ctx: QueryCtx,
  organization: Doc<"organizations">,
  filter: { search: string; billing: ShopBillingFilter | null },
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
  const probe = await getOrganizationActualUsageProbe(ctx, organization._id, ORGANIZATION_PLAN_LIMITS.pro);
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
