import type { PaginationOptions } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getOrganizationPersonLineState, resolveCanonicalStaffScope } from "../line/service";
import { hasValidCanonicalStaffUserLifecycle } from "../staff/service";
import type {
  AnalyticsPageInfoDto,
  AnalyticsShopListRowDto,
  AnalyticsShopRowDto,
  CycleRowDto,
  StaffRowDto,
} from "./dto";
import { ANALYTICS_DASHBOARD_MAX_SCAN_ROWS } from "./schemas";

// 一店舗あたりstaff 201件、person/user各200件まで。店舗走査も20件に抑える。
export const SHOP_LIST_SCAN_LIMIT = 20;
export const SHOP_LIST_STAFF_SCAN_LIMIT = 200;

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
export async function shopListRow(
  ctx: QueryCtx,
  shop: Doc<"shops">,
  organization: Doc<"organizations">,
): Promise<AnalyticsShopListRowDto> {
  const [staffs, latestShift] = await Promise.all([
    ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
      .take(SHOP_LIST_STAFF_SCAN_LIMIT + 1),
    ctx.db
      .query("recruitments")
      .withIndex("by_shopId_and_isDeleted_and_periodStart", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
      .order("desc")
      .first(),
  ]);
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
