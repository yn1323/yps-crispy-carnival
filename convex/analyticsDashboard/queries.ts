import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { addDays, dateJST, jstDayRangeMs, subtractCalendarMonths } from "../_lib/dateFormat";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";
import { ANALYTICS_DEFINITION_VERSION, analyticsMetricValidator } from "../analytics/model";
import { listActiveStaffsForOrganizationPerson, resolveCanonicalStaffScope } from "../line/service";
import type {
  AnalyticsDayDto,
  AnalyticsShopRowDto,
  CycleDetailResponse,
  OverviewResponse,
  ShopDetailResponse,
  ShopsResponse,
  StaffDetailResponse,
} from "./dto";
import {
  currentShop,
  cycleRow,
  deletedShopRow,
  emptyPageInfo,
  pageInfo,
  paginationOptions,
  recentCycles,
  shopRow,
  staffRow,
} from "./queryHelpers";
import { ANALYTICS_DASHBOARD_MAX_SCAN_ROWS, isAnalyticsDate } from "./schemas";
import {
  cycleDetailResponseValidator,
  featureRequestsResponseValidator,
  nullableString,
  overviewResponseValidator,
  pageArgs,
  shopDetailResponseValidator,
  shopsResponseValidator,
  staffDetailResponseValidator,
} from "./validators";

function dayDto(
  date: string,
  startedAt: number | null,
  result: Doc<"analyticsDailyResults"> | undefined,
): AnalyticsDayDto {
  const beforeStart = startedAt !== null && date < dateJST(startedAt);
  const base = {
    date,
    counts: null,
    observationStartAt: null,
    observationEndAt: null,
    computedAt: null,
    errorCode: null,
  };
  if (beforeStart) return { ...base, status: "before_start" };
  if (!result) return { ...base, status: "pending" };
  if (result.definitionVersion !== ANALYTICS_DEFINITION_VERSION)
    return { ...base, status: "failed", errorCode: "definition_mismatch" };
  return {
    date,
    status: result.status === "complete" ? (result.isPartialDay ? "partial" : "complete") : result.status,
    counts: result.status === "complete" ? result.counts.day : null,
    observationStartAt: result.observationStartAt,
    observationEndAt: result.observationEndAt,
    computedAt: result.completedAt ?? null,
    errorCode: result.errorCode ?? null,
  };
}

export const getOverview = internalQuery({
  args: { rangeDays: v.union(v.literal(7), v.literal(30), v.literal(90)), asOf: v.number() },
  returns: overviewResponseValidator,
  handler: async (ctx, args): Promise<OverviewResponse> => {
    const today = dateJST(args.asOf);
    const to = addDays(today, -1);
    const from = addDays(to, 1 - args.rangeDays);
    const [state, results] = await Promise.all([
      ctx.db
        .query("analyticsState")
        .withIndex("by_key", (q) => q.eq("key", "usage"))
        .unique(),
      ctx.db
        .query("analyticsDailyResults")
        .withIndex("by_date", (q) => q.gte("date", from).lte("date", to))
        .take(90),
    ]);
    const byDate = new Map(results.map((row) => [row.date, row]));
    const startedAt = state?.startedAt ?? null;
    const series = Array.from({ length: args.rangeDays }, (_, index) =>
      dayDto(addDays(from, index), startedAt, byDate.get(addDays(from, index))),
    );
    const observed = series.filter((day) => day.status !== "before_start");
    const ready =
      startedAt !== null &&
      observed.length > 0 &&
      observed.every((day) => day.status === "complete" || day.status === "partial");
    const partial = series.some((day) => day.status === "before_start" || day.status === "partial");
    const result = byDate.get(to);
    const todayRunAt = jstDayRangeMs(today).startMs + 3 * 60 * 60 * 1000;
    return {
      kind: "overview",
      asOf: args.asOf,
      definitionVersion: ANALYTICS_DEFINITION_VERSION,
      startedAt,
      nextAggregationAt:
        todayRunAt > args.asOf ? todayRunAt : jstDayRangeMs(addDays(today, 1)).startMs + 3 * 60 * 60 * 1000,
      range: { from, to, days: args.rangeDays },
      yesterday: series[series.length - 1],
      series,
      period: {
        status: ready ? (partial ? "partial" : "complete") : "unavailable",
        counts:
          ready && result?.status === "complete"
            ? result.counts[args.rangeDays === 7 ? "days7" : args.rangeDays === 30 ? "days30" : "days90"]
            : null,
        observedDays: observed.filter((day) => day.status === "complete" || day.status === "partial").length,
        observationStartAt: startedAt === null ? null : Math.max(startedAt, jstDayRangeMs(from).startMs),
      },
    };
  },
});

export const getShops = internalQuery({
  args: {
    ...pageArgs,
    asOf: v.number(),
    search: v.string(),
    date: nullableString,
    metric: v.union(analyticsMetricValidator, v.null()),
  },
  returns: shopsResponseValidator,
  handler: async (ctx, args): Promise<ShopsResponse> => {
    const options = paginationOptions(args.cursor, args.limit);
    if (
      args.search.length > 100 ||
      (args.date === null) !== (args.metric === null) ||
      (args.date !== null && !isAnalyticsDate(args.date))
    )
      throw new Error("invalid_request");
    const scope = args.date && args.metric ? { date: args.date, metric: args.metric } : null;
    const search = args.search.trim().toLocaleLowerCase("ja");
    if (scope) {
      const retentionDate = subtractCalendarMonths(dateJST(args.asOf), 25);
      const result = await ctx.db
        .query("analyticsDailyResults")
        .withIndex("by_date", (q) => q.eq("date", scope.date))
        .unique();
      const scopeStatus =
        scope.date < retentionDate
          ? "outside_retention"
          : result?.status === "complete" && result.definitionVersion === ANALYTICS_DEFINITION_VERSION
            ? "available"
            : "unavailable";
      if (scopeStatus !== "available")
        return {
          kind: "shops",
          asOf: args.asOf,
          rows: [],
          pageInfo: emptyPageInfo(args.cursor, args.limit),
          scope,
          scopeStatus,
        };
      const page = await ctx.db
        .query("analyticsShopDays")
        .withIndex("by_date_and_shopId", (q) => q.eq("date", scope.date))
        .filter((q) => q.eq(q.field(scope.metric), true))
        .paginate(options);
      const rows: AnalyticsShopRowDto[] = [];
      for (const day of page.page) {
        const current = await currentShop(ctx, day.shopId);
        const row = current ? shopRow(current.shop, current.organization) : deletedShopRow(day.shopId);
        if (!search || row.name.toLocaleLowerCase("ja").includes(search)) rows.push(row);
      }
      return {
        kind: "shops",
        asOf: args.asOf,
        rows,
        pageInfo: pageInfo(args.cursor, args.limit, page, rows.length),
        scope,
        scopeStatus,
      };
    }
    const page = await ctx.db
      .query("shops")
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .order("desc")
      .paginate(options);
    const rows: AnalyticsShopRowDto[] = [];
    for (const shop of page.page) {
      if (search && !shop.name.toLocaleLowerCase("ja").includes(search)) continue;
      const organization = await ctx.db.get(shop.organizationId);
      if (!organization || organization.isDeleted) continue;
      rows.push(shopRow(shop, organization));
    }
    return {
      kind: "shops",
      asOf: args.asOf,
      rows,
      pageInfo: pageInfo(args.cursor, args.limit, page, rows.length),
      scope: null,
      scopeStatus: "current",
    };
  },
});

export const getShop = internalQuery({
  args: { ...pageArgs, shopId: v.string(), asOf: v.number() },
  returns: shopDetailResponseValidator,
  handler: async (ctx, args): Promise<ShopDetailResponse | null> => {
    const options = paginationOptions(args.cursor, args.limit);
    const current = await currentShop(ctx, args.shopId);
    if (!current) return null;
    const { shop, organization } = current;
    const to = dateJST(args.asOf);
    const from = addDays(to, -89);
    const [staffPage, cycles, state, days, evidence] = await Promise.all([
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .paginate(options),
      recentCycles(ctx, shop._id),
      ctx.db
        .query("analyticsState")
        .withIndex("by_key", (q) => q.eq("key", "usage"))
        .unique(),
      ctx.db
        .query("analyticsShopDays")
        .withIndex("by_shopId_and_date", (q) => q.eq("shopId", shop._id).gte("date", from).lte("date", to))
        .take(90),
      ctx.db
        .query("analyticsCycleEvidence")
        .withIndex("by_shopId_and_lastObservedAt", (q) => q.eq("shopId", shop._id))
        .order("desc")
        .take(21),
    ]);
    const staff = [];
    for (const row of staffPage.page) {
      const dto = await staffRow(ctx, row._id, shop._id);
      if (dto) staff.push(dto);
    }
    const evidenceRows = await Promise.all(
      evidence.slice(0, 20).map(async (row) => {
        const recruitment = await ctx.db.get(row.recruitmentId);
        return {
          recruitmentId: row.recruitmentId,
          isDeleted: !recruitment || recruitment.isDeleted || recruitment.shopId !== shop._id,
          firstSubmittedAt: row.firstSubmittedAt ?? null,
          lastSubmittedAt: row.lastSubmittedAt ?? null,
          firstConfirmedAt: row.firstConfirmedAt ?? null,
          lastConfirmedAt: row.lastConfirmedAt ?? null,
          confirmedPeriodStartAt: row.confirmedPeriodStartAt ?? null,
        };
      }),
    );
    return {
      kind: "shop",
      asOf: args.asOf,
      shop: shopRow(shop, organization),
      regularClosedDays: shop.regularClosedDays,
      submissionPattern:
        shop.submissionPattern.kind === "time"
          ? `時刻で提出（${shop.submissionPattern.startTime}〜${shop.submissionPattern.endTime}）`
          : shop.submissionPattern.kind === "dateOnly"
            ? "出勤できる日を提出"
            : `勤務区分で提出（${shop.submissionPattern.options.map((option) => `${option.name} ${option.startTime}〜${option.endTime}`).join("、")}）`,
      staff,
      pageInfo: pageInfo(args.cursor, args.limit, staffPage, staff.length),
      cycles: cycles.map(cycleRow),
      activity: {
        startedAt: state?.startedAt ?? null,
        from,
        to,
        days: days.map(({ date, registered, submitted, confirmed }) => ({ date, registered, submitted, confirmed })),
        evidence: evidenceRows,
        hasMoreEvidence: evidence.length > 20,
      },
    };
  },
});

export const getStaff = internalQuery({
  args: { ...pageArgs, shopId: v.string(), staffId: v.string(), asOf: v.number() },
  returns: staffDetailResponseValidator,
  handler: async (ctx, args): Promise<StaffDetailResponse | null> => {
    const options = paginationOptions(args.cursor, args.limit, 50);
    const shopId = ctx.db.normalizeId("shops", args.shopId);
    const staffId = ctx.db.normalizeId("staffs", args.staffId);
    if (!shopId || !staffId) return null;
    const scope = await resolveCanonicalStaffScope(ctx, { shopId, staffId });
    if (!scope) return null;
    const row = await staffRow(ctx, staffId, shopId);
    if (!row) return null;
    const [memberships, cycles, notifications] = await Promise.all([
      listActiveStaffsForOrganizationPerson(ctx, {
        organizationId: scope.organization._id,
        organizationPersonId: scope.person._id,
      }),
      recentCycles(ctx, shopId),
      ctx.db
        .query("notificationHistory")
        .withIndex("by_shopId_and_staffId_and_requestedAt", (q) => q.eq("shopId", shopId).eq("staffId", staffId))
        .order("desc")
        .paginate(options),
    ]);
    const membershipRows = [];
    for (const member of memberships) {
      const shop = await ctx.db.get(member.shopId);
      if (!shop || shop.isDeleted || shop.organizationId !== scope.organization._id) continue;
      membershipRows.push({
        shopId: shop._id,
        shopName: shop.name,
        staffId: member._id,
        excludedFromShift: member.excludedFromShift,
      });
    }
    const submissions = await Promise.all(
      cycles.map(async (cycle) => {
        const submission = await ctx.db
          .query("shiftSubmissions")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", cycle._id).eq("staffId", staffId))
          .unique();
        return {
          ...cycleRow(cycle),
          firstSubmittedAt: submission?.firstSubmittedAt ?? null,
          submittedAt: submission?.submittedAt ?? null,
        };
      }),
    );
    return {
      kind: "staff",
      asOf: args.asOf,
      shop: shopRow(scope.shop, scope.organization),
      staff: { ...row, email: scope.person.email },
      memberships: membershipRows,
      submissions,
      notifications: notifications.page.map((notification) => ({
        id: notification._id,
        channel: notification.channel,
        notificationKind: notification.notificationKind,
        sendStatus: notification.sendStatus,
        deliveryStatus: notification.deliveryStatus,
        requestedAt: notification.requestedAt,
        sentAt: notification.sentAt ?? null,
        deliveredAt: notification.deliveredAt ?? null,
        failedAt: notification.failedAt ?? null,
      })),
      pageInfo: pageInfo(args.cursor, args.limit, notifications, notifications.page.length),
    };
  },
});

export const getCycle = internalQuery({
  args: { shopId: v.string(), recruitmentId: v.string(), asOf: v.number() },
  returns: cycleDetailResponseValidator,
  handler: async (ctx, args): Promise<CycleDetailResponse | null> => {
    const current = await currentShop(ctx, args.shopId);
    const recruitmentId = ctx.db.normalizeId("recruitments", args.recruitmentId);
    const cycle = recruitmentId ? await ctx.db.get(recruitmentId) : null;
    if (!current || !cycle || cycle.isDeleted || cycle.shopId !== current.shop._id) return null;
    const candidates = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", current.shop._id).eq("isDeleted", false))
      .take(ANALYTICS_DASHBOARD_MAX_SCAN_ROWS + 1);
    let denominator = 0;
    let numerator = 0;
    const exceedsLimit = candidates.length > ANALYTICS_DASHBOARD_MAX_SCAN_ROWS;
    if (!exceedsLimit) {
      for (const staff of candidates) {
        if (staff.excludedFromShift) continue;
        if (!(await resolveCanonicalStaffScope(ctx, { staffId: staff._id, shopId: current.shop._id }))) continue;
        denominator += 1;
        const submission = await ctx.db
          .query("shiftSubmissions")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", cycle._id).eq("staffId", staff._id))
          .unique();
        if (submission) numerator += 1;
      }
    }
    return {
      kind: "cycle",
      asOf: args.asOf,
      shop: shopRow(current.shop, current.organization),
      cycle: cycleRow(cycle),
      currentSubmission: exceedsLimit
        ? null
        : { numerator, denominator, rate: denominator > 0 ? numerator / denominator : null },
      currentSubmissionStatus: exceedsLimit ? "scan_limit" : "available",
      confirmedBeforeStart:
        cycle.confirmedAt === undefined ? null : cycle.confirmedAt < jstDayRangeMs(cycle.periodStart).startMs,
      deadlineSubmissionRate: null,
    };
  },
});

export const getFeatureRequests = internalQuery({
  args: { ...pageArgs, asOf: v.number() },
  returns: featureRequestsResponseValidator,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("featureRequests")
      .order("desc")
      .paginate(paginationOptions(args.cursor, args.limit, 50));
    const rows = await Promise.all(
      page.page.map(async (request) => {
        const shop = request.shopId ? await ctx.db.get(request.shopId) : null;
        const organizationId = request.organizationId ?? shop?.organizationId;
        const organization = organizationId ? await ctx.db.get(organizationId) : null;
        const organizationName = organization && !organization.isDeleted ? organization.name : "削除済み組織";
        return {
          id: request._id,
          targetKind: request.shopId ? ("shop" as const) : ("organization" as const),
          organizationId: organizationId ?? null,
          organizationName,
          shopId: request.shopId ?? null,
          shopName: request.shopId
            ? !shop || shop.isDeleted || !organization || organization.isDeleted
              ? "削除済み店舗"
              : shop.name
            : `${organizationName}（組織全体）`,
          senderType: request.staffId === undefined ? ("manager" as const) : ("staff" as const),
          comment: request.comment,
          createdAt: request._creationTime,
          isDeleted: request.isDeleted ?? false,
        };
      }),
    );
    return {
      kind: "requests" as const,
      asOf: args.asOf,
      rows,
      pageInfo: pageInfo(args.cursor, args.limit, page, rows.length),
    };
  },
});
