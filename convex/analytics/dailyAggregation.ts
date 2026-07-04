import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { addDays, jstDayRangeMs, todayJST } from "../_lib/dateFormat";
import {
  ANALYTICS_AGGREGATION_PAGE_SIZE,
  ANALYTICS_SHOP_SNAPSHOT_PAGE_SIZE,
  DASHBOARD_CURRENT_RECRUITMENT_SCAN_LIMIT,
  SHIFT_BOARD_STAFF_LIMIT,
} from "../constants";
import { describeNotificationFailureContext } from "../notificationOutbox/failureResend";
import { notificationContextForJob } from "../notificationOutbox/mutations";
import { ANALYTICS_METRICS, allNotificationEventMetrics, notificationMetric } from "./metrics";
import { setDailyEventCount, setServiceSnapshot, setShopSnapshot } from "./mutations";

/**
 * 分析KPIの日次集計。cron（03:00 JST）が前日分を集計する。
 *
 * 実行モデル: internalMutation の自己再帰チェーン（Phase 1 → 2 → 3 → 4 → 5 → 6）。
 * 各フェーズは { date, cursor, acc } で自己再帰し、途中ページではDBに書かず
 * 累積値 acc を scheduler の引数で運び、最終ページでのみ絶対値を upsert する。
 * これにより同日再実行は常に上書きになり、途中クラッシュしても中途半端な書き込みが残らない。
 *
 * followUp はバックフィル（analytics/backfill）の日付継続用。イベント系フェーズ（3〜6）のみが
 * 受け取り、Phase 6 完了時に untilDate 未到達なら翌日の Phase 3 を予約する。
 */

const cursorValidator = v.union(v.string(), v.null());
const followUpValidator = v.optional(v.object({ untilDate: v.string() }));

export const run = internalMutation({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const date = args.date ?? addDays(todayJST(), -1);
    await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.aggregateShopSnapshots, {
      date,
      cursor: null,
    });
    return { date };
  },
});

// ========================================
// Phase 1: 店舗別スナップショット
// ========================================

export const aggregateShopSnapshots = internalMutation({
  args: { date: v.string(), cursor: cursorValidator },
  handler: async (ctx, { date, cursor }) => {
    const page = await ctx.db.query("shops").paginate({ cursor, numItems: ANALYTICS_SHOP_SNAPSHOT_PAGE_SIZE });

    for (const shop of page.page) {
      if (shop.isDeleted) continue;
      const values = await computeShopSnapshotValues(ctx, shop._id);
      await setShopSnapshot(ctx, { date, shopId: shop._id, ...values, computedAt: Date.now() });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.aggregateShopSnapshots, {
        date,
        cursor: page.continueCursor,
      });
      return;
    }
    await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.rollupServiceSnapshot, {
      date,
      stage: "shopSnapshots",
      cursor: null,
      acc: emptyServiceAcc(),
    });
  },
});

async function computeShopSnapshotValues(ctx: MutationCtx, shopId: Id<"shops">) {
  const staffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(SHIFT_BOARD_STAFF_LIMIT);
  const staffIds = new Set(staffs.map((staff) => staff._id));

  // 論理削除されていないLINE連携のうち、生きているスタッフに紐づくものだけを数える
  const lineAccounts = await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(SHIFT_BOARD_STAFF_LIMIT);
  const linkedAccounts = lineAccounts.filter((account) => staffIds.has(account.staffId));

  const billingState = await ctx.db
    .query("shopBillingStates")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .first();

  const openRecruitments = await ctx.db
    .query("recruitments")
    .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", "open"))
    .take(DASHBOARD_CURRENT_RECRUITMENT_SCAN_LIMIT);

  return {
    planKey: billingState?.planKey ?? ("free" as const),
    staffCount: staffs.length,
    shiftTargetStaffCount: staffs.filter((staff) => staff.excludedFromShift !== true).length,
    lineLinkedStaffCount: linkedAccounts.length,
    lineFollowingStaffCount: linkedAccounts.filter((account) => account.following).length,
    openRecruitmentCount: openRecruitments.filter((recruitment) => !recruitment.isDeleted).length,
  };
}

// ========================================
// Phase 2: サービス全体スナップショット（店舗別行のrollup + pending申請数）
// ========================================

const serviceAccValidator = v.object({
  shopCount: v.number(),
  freePlanShopCount: v.number(),
  standardPlanShopCount: v.number(),
  premiumPlanShopCount: v.number(),
  staffCount: v.number(),
  shiftTargetStaffCount: v.number(),
  lineLinkedStaffCount: v.number(),
  lineFollowingStaffCount: v.number(),
  openRecruitmentCount: v.number(),
  pendingRegistrationRequestCount: v.number(),
});

function emptyServiceAcc() {
  return {
    shopCount: 0,
    freePlanShopCount: 0,
    standardPlanShopCount: 0,
    premiumPlanShopCount: 0,
    staffCount: 0,
    shiftTargetStaffCount: 0,
    lineLinkedStaffCount: 0,
    lineFollowingStaffCount: 0,
    openRecruitmentCount: 0,
    pendingRegistrationRequestCount: 0,
  };
}

export const rollupServiceSnapshot = internalMutation({
  args: {
    date: v.string(),
    stage: v.union(v.literal("shopSnapshots"), v.literal("pendingRequests")),
    cursor: cursorValidator,
    acc: serviceAccValidator,
  },
  handler: async (ctx, { date, stage, cursor, acc }) => {
    if (stage === "shopSnapshots") {
      const page = await ctx.db
        .query("analyticsDailyShopSnapshots")
        .withIndex("by_date_shopId", (q) => q.eq("date", date))
        .paginate({ cursor, numItems: ANALYTICS_AGGREGATION_PAGE_SIZE });

      for (const snapshot of page.page) {
        acc.shopCount += 1;
        if (snapshot.planKey === "free") acc.freePlanShopCount += 1;
        if (snapshot.planKey === "standard") acc.standardPlanShopCount += 1;
        if (snapshot.planKey === "premium") acc.premiumPlanShopCount += 1;
        acc.staffCount += snapshot.staffCount;
        acc.shiftTargetStaffCount += snapshot.shiftTargetStaffCount;
        acc.lineLinkedStaffCount += snapshot.lineLinkedStaffCount;
        acc.lineFollowingStaffCount += snapshot.lineFollowingStaffCount;
        acc.openRecruitmentCount += snapshot.openRecruitmentCount;
      }

      await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.rollupServiceSnapshot, {
        date,
        stage: page.isDone ? "pendingRequests" : "shopSnapshots",
        cursor: page.isDone ? null : page.continueCursor,
        acc,
      });
      return;
    }

    const page = await ctx.db
      .query("staffRegistrationRequests")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "pending"))
      .paginate({ cursor, numItems: ANALYTICS_AGGREGATION_PAGE_SIZE });
    acc.pendingRegistrationRequestCount += page.page.length;

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.rollupServiceSnapshot, {
        date,
        stage: "pendingRequests",
        cursor: page.continueCursor,
        acc,
      });
      return;
    }

    await setServiceSnapshot(ctx, {
      date,
      shopCount: acc.shopCount,
      shopCountByPlan: {
        free: acc.freePlanShopCount,
        standard: acc.standardPlanShopCount,
        premium: acc.premiumPlanShopCount,
      },
      staffCount: acc.staffCount,
      shiftTargetStaffCount: acc.shiftTargetStaffCount,
      lineLinkedStaffCount: acc.lineLinkedStaffCount,
      lineFollowingStaffCount: acc.lineFollowingStaffCount,
      openRecruitmentCount: acc.openRecruitmentCount,
      pendingRegistrationRequestCount: acc.pendingRegistrationRequestCount,
      computedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.aggregateNotificationEvents, {
      date,
      stage: "sent",
      cursor: null,
      acc: {},
    });
  },
});

// ========================================
// Phase 3: 通知イベント（outboxの sent / 最終failed を日次窓でカウント）
// ========================================

export const aggregateNotificationEvents = internalMutation({
  args: {
    date: v.string(),
    stage: v.union(v.literal("sent"), v.literal("failed")),
    cursor: cursorValidator,
    acc: v.record(v.string(), v.number()),
    followUp: followUpValidator,
  },
  handler: async (ctx, { date, stage, cursor, acc, followUp }) => {
    const { startMs, endMs } = jstDayRangeMs(date);
    const page =
      stage === "sent"
        ? await ctx.db
            .query("notificationOutbox")
            .withIndex("by_status_sentAt", (q) => q.eq("status", "sent").gte("sentAt", startMs).lt("sentAt", endMs))
            .paginate({ cursor, numItems: ANALYTICS_AGGREGATION_PAGE_SIZE })
        : await ctx.db
            .query("notificationOutbox")
            .withIndex("by_status_failedAt", (q) =>
              q.eq("status", "failed").gte("failedAt", startMs).lt("failedAt", endMs),
            )
            .paginate({ cursor, numItems: ANALYTICS_AGGREGATION_PAGE_SIZE });

    for (const job of page.page) {
      // dry-run等で実際には配送していないジョブはKPI対象外（markSentの使用量カウントと同じ扱い）
      if (job.payload.suppressDelivery === true) continue;
      const { kind } = describeNotificationFailureContext(notificationContextForJob(job));
      const metric = notificationMetric(job.channel, stage, kind);
      acc[metric] = (acc[metric] ?? 0) + 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.aggregateNotificationEvents, {
        date,
        stage,
        cursor: page.continueCursor,
        acc,
        followUp,
      });
      return;
    }
    if (stage === "sent") {
      await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.aggregateNotificationEvents, {
        date,
        stage: "failed",
        cursor: null,
        acc,
        followUp,
      });
      return;
    }

    // 全組み合わせをゼロ埋めで書く（「未集計」と「0件」を区別するため）
    for (const metric of allNotificationEventMetrics()) {
      await setDailyEventCount(ctx, { date, metric, count: acc[metric] ?? 0 });
    }
    await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.aggregateLifecycleEvents, {
      date,
      stage: "shops",
      cursor: null,
      count: 0,
      followUp,
    });
  },
});

// ========================================
// Phase 4: 作成イベント（_creationTime の日次窓カウント）
// 「その日に作成された数」は後の論理削除で変わるべきではないため isDeleted はフィルタしない
// ========================================

const LIFECYCLE_METRICS = {
  shops: ANALYTICS_METRICS.shopCreated,
  staffs: ANALYTICS_METRICS.staffCreated,
  recruitments: ANALYTICS_METRICS.recruitmentCreated,
  // shiftSubmissions は初回提出時にinsertされるため _creationTime ≒ firstSubmittedAt
  shiftSubmissions: ANALYTICS_METRICS.submissionFirst,
  staffRegistrationRequests: ANALYTICS_METRICS.registrationRequested,
} as const;

const LIFECYCLE_NEXT_STAGE = {
  shops: "staffs",
  staffs: "recruitments",
  recruitments: "shiftSubmissions",
  shiftSubmissions: "staffRegistrationRequests",
  staffRegistrationRequests: null,
} as const;

type LifecycleStage = keyof typeof LIFECYCLE_METRICS;

const lifecycleStageValidator = v.union(
  v.literal("shops"),
  v.literal("staffs"),
  v.literal("recruitments"),
  v.literal("shiftSubmissions"),
  v.literal("staffRegistrationRequests"),
);

async function paginateCreatedInDay(
  ctx: MutationCtx,
  stage: LifecycleStage,
  range: { startMs: number; endMs: number },
  cursor: string | null,
) {
  // テーブル名をジェネリックにすると withIndex のフィールドパス型が解決できないため、caseごとに展開する
  const paginationOpts = { cursor, numItems: ANALYTICS_AGGREGATION_PAGE_SIZE };
  switch (stage) {
    case "shops":
      return await ctx.db
        .query("shops")
        .withIndex("by_creation_time", (q) => q.gte("_creationTime", range.startMs).lt("_creationTime", range.endMs))
        .paginate(paginationOpts);
    case "staffs":
      return await ctx.db
        .query("staffs")
        .withIndex("by_creation_time", (q) => q.gte("_creationTime", range.startMs).lt("_creationTime", range.endMs))
        .paginate(paginationOpts);
    case "recruitments":
      return await ctx.db
        .query("recruitments")
        .withIndex("by_creation_time", (q) => q.gte("_creationTime", range.startMs).lt("_creationTime", range.endMs))
        .paginate(paginationOpts);
    case "shiftSubmissions":
      return await ctx.db
        .query("shiftSubmissions")
        .withIndex("by_creation_time", (q) => q.gte("_creationTime", range.startMs).lt("_creationTime", range.endMs))
        .paginate(paginationOpts);
    case "staffRegistrationRequests":
      return await ctx.db
        .query("staffRegistrationRequests")
        .withIndex("by_creation_time", (q) => q.gte("_creationTime", range.startMs).lt("_creationTime", range.endMs))
        .paginate(paginationOpts);
  }
}

export const aggregateLifecycleEvents = internalMutation({
  args: {
    date: v.string(),
    stage: lifecycleStageValidator,
    cursor: cursorValidator,
    count: v.number(),
    followUp: followUpValidator,
  },
  handler: async (ctx, { date, stage, cursor, count, followUp }) => {
    const range = jstDayRangeMs(date);
    const page = await paginateCreatedInDay(ctx, stage, range, cursor);
    const total = count + page.page.length;

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.aggregateLifecycleEvents, {
        date,
        stage,
        cursor: page.continueCursor,
        count: total,
        followUp,
      });
      return;
    }

    await setDailyEventCount(ctx, { date, metric: LIFECYCLE_METRICS[stage], count: total });

    const nextStage = LIFECYCLE_NEXT_STAGE[stage];
    if (nextStage) {
      await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.aggregateLifecycleEvents, {
        date,
        stage: nextStage,
        cursor: null,
        count: 0,
        followUp,
      });
      return;
    }
    await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.aggregateConfirmationEvents, {
      date,
      cursor: null,
      acc: { count: 0, leadTimeSumMs: 0, submittedTotal: 0, expectedStaffTotal: 0 },
      followUp,
    });
  },
});

// ========================================
// Phase 5: シフト確定イベント（リードタイム + 提出率の分子分母）
// ========================================

export const aggregateConfirmationEvents = internalMutation({
  args: {
    date: v.string(),
    cursor: cursorValidator,
    acc: v.object({
      count: v.number(),
      leadTimeSumMs: v.number(),
      submittedTotal: v.number(),
      expectedStaffTotal: v.number(),
    }),
    followUp: followUpValidator,
  },
  handler: async (ctx, { date, cursor, acc, followUp }) => {
    const { startMs, endMs } = jstDayRangeMs(date);
    const page = await ctx.db
      .query("recruitments")
      .withIndex("by_status_and_confirmedAt", (q) =>
        q.eq("status", "confirmed").gte("confirmedAt", startMs).lt("confirmedAt", endMs),
      )
      .paginate({ cursor, numItems: ANALYTICS_AGGREGATION_PAGE_SIZE });

    for (const recruitment of page.page) {
      if (recruitment.confirmedAt === undefined) continue;
      acc.count += 1;
      acc.leadTimeSumMs += recruitment.confirmedAt - recruitment._creationTime;
      const stats = await ctx.db
        .query("recruitmentStats")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
        .first();
      acc.submittedTotal += stats?.submittedCount ?? 0;
      acc.expectedStaffTotal += stats?.activeStaffCountSnapshot ?? 0;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.aggregateConfirmationEvents, {
        date,
        cursor: page.continueCursor,
        acc,
        followUp,
      });
      return;
    }

    await setDailyEventCount(ctx, {
      date,
      metric: ANALYTICS_METRICS.recruitmentConfirmed,
      count: acc.count,
      valueSum: acc.leadTimeSumMs,
    });
    await setDailyEventCount(ctx, {
      date,
      metric: ANALYTICS_METRICS.recruitmentConfirmedSubmittedTotal,
      count: acc.count,
      valueSum: acc.submittedTotal,
    });
    await setDailyEventCount(ctx, {
      date,
      metric: ANALYTICS_METRICS.recruitmentConfirmedExpectedStaffTotal,
      count: acc.count,
      valueSum: acc.expectedStaffTotal,
    });
    await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.aggregateLineAndRegistrationEvents, {
      date,
      stage: "lineLinked",
      cursor: null,
      count: 0,
      followUp,
    });
  },
});

// ========================================
// Phase 6: LINE連携・参加申請レビューイベント（チェーン終端。バックフィル継続もここで判定）
// ========================================

const LINE_REGISTRATION_METRICS = {
  lineLinked: ANALYTICS_METRICS.lineLinked,
  approved: ANALYTICS_METRICS.registrationApproved,
  rejected: ANALYTICS_METRICS.registrationRejected,
} as const;

const LINE_REGISTRATION_NEXT_STAGE = {
  lineLinked: "approved",
  approved: "rejected",
  rejected: null,
} as const;

export const aggregateLineAndRegistrationEvents = internalMutation({
  args: {
    date: v.string(),
    stage: v.union(v.literal("lineLinked"), v.literal("approved"), v.literal("rejected")),
    cursor: cursorValidator,
    count: v.number(),
    followUp: followUpValidator,
  },
  handler: async (ctx, { date, stage, cursor, count, followUp }) => {
    const { startMs, endMs } = jstDayRangeMs(date);
    const page =
      stage === "lineLinked"
        ? await ctx.db
            .query("staffLineAccounts")
            .withIndex("by_linkedAt", (q) => q.gte("linkedAt", startMs).lt("linkedAt", endMs))
            .paginate({ cursor, numItems: ANALYTICS_AGGREGATION_PAGE_SIZE })
        : await ctx.db
            .query("staffRegistrationRequests")
            .withIndex("by_status_and_reviewedAt", (q) =>
              q.eq("status", stage).gte("reviewedAt", startMs).lt("reviewedAt", endMs),
            )
            .paginate({ cursor, numItems: ANALYTICS_AGGREGATION_PAGE_SIZE });
    const total = count + page.page.length;

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.aggregateLineAndRegistrationEvents, {
        date,
        stage,
        cursor: page.continueCursor,
        count: total,
        followUp,
      });
      return;
    }

    await setDailyEventCount(ctx, { date, metric: LINE_REGISTRATION_METRICS[stage], count: total });

    const nextStage = LINE_REGISTRATION_NEXT_STAGE[stage];
    if (nextStage) {
      await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.aggregateLineAndRegistrationEvents, {
        date,
        stage: nextStage,
        cursor: null,
        count: 0,
        followUp,
      });
      return;
    }

    // バックフィル継続: untilDate 未到達なら翌日のイベント系フェーズ（Phase 3）を予約する
    if (followUp && date < followUp.untilDate) {
      await ctx.scheduler.runAfter(0, internal.analytics.dailyAggregation.aggregateNotificationEvents, {
        date: addDays(date, 1),
        stage: "sent",
        cursor: null,
        acc: {},
        followUp,
      });
    }
  },
});
