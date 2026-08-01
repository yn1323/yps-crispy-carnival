import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { addDays, dateJST, dateToUtcMs, formatUtcDate, jstDayRangeMs, todayJST } from "../_lib/dateFormat";
import {
  ANALYTICS_AGGREGATION_PAGE_SIZE,
  ANALYTICS_SHOP_SNAPSHOT_PAGE_SIZE,
  ANALYTICS_SHOP_STAGE_SCAN_LIMIT,
  SHIFT_BOARD_STAFF_LIMIT,
} from "../constants";
import { describeNotificationFailureContext } from "../notificationOutbox/failureResend";
import { notificationContextForJob, notificationDeliverySuppressedForJob } from "../notificationOutbox/mutations";
import { resolveOrganizationBillingPlans } from "../organizationBilling/policy";
import { ANALYTICS_METRICS, allNotificationEventMetrics, notificationMetric } from "./metrics";
import { setDailyEventCount, setServiceSnapshot, setShopSnapshot } from "./mutations";
import { classifyShopStage, type ShopStage, type ShopStageInputs } from "./stage";

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
const SNAPSHOT_END_OFFSET_MS = 1;
const RECENT_RECRUITMENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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
    const snapshotAt = jstDayRangeMs(date).endMs - SNAPSHOT_END_OFFSET_MS;
    const page = await ctx.db.query("shops").paginate({ cursor, numItems: ANALYTICS_SHOP_SNAPSHOT_PAGE_SIZE });

    for (const shop of page.page) {
      if (shop.isDeleted) continue;
      if (shop._creationTime > snapshotAt) continue;
      const values = await computeShopSnapshotValues(ctx, shop, { date, snapshotAt });
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

type ShopSnapshotContext = {
  date: string;
  snapshotAt: number;
};

function confirmedAtForStage(recruitment: Doc<"recruitments">): number | null {
  if (recruitment.status !== "confirmed") return null;
  return recruitment.confirmedAt ?? recruitment._creationTime;
}

function happenedBy(at: number | undefined, snapshotAt: number): at is number {
  return at !== undefined && at <= snapshotAt;
}

function isActiveOrRetainedHistoryStage(stage: ShopStage | undefined): boolean {
  return (
    stage === "activeTrial" || stage === "retained" || stage === "activeTrialDormant" || stage === "retainedDormant"
  );
}

function isRetainedHistoryStage(stage: ShopStage | undefined): boolean {
  return stage === "retained" || stage === "retainedDormant";
}

async function latestPreviousShopStage(ctx: MutationCtx, shopId: Doc<"shops">["_id"], date: string) {
  const previous = await ctx.db
    .query("analyticsDailyShopSnapshots")
    .withIndex("by_shopId_date", (q) => q.eq("shopId", shopId).lt("date", date))
    .order("desc")
    .first();
  return previous?.stage;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratioOrNull(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function dateStringToEpochDay(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = dateToUtcMs(value);
  if (!Number.isFinite(ms) || formatUtcDate(ms) !== value) return null;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function daysBetweenJstDates(from: string | null | undefined, to: string | null | undefined) {
  const fromDay = dateStringToEpochDay(from);
  const toDay = dateStringToEpochDay(to);
  if (fromDay === null || toDay === null) return null;
  return toDay - fromDay;
}

function isReminderNotificationJob(job: Doc<"notificationOutbox">) {
  return (
    notificationContextForJob(job) === "notification.sendReminderEmails" ||
    job.dedupeKey.startsWith("line:reminder:") ||
    job.dedupeKey.startsWith("line:failureRetryReminder:")
  );
}

async function computeSubmissionTimingKpis(
  ctx: MutationCtx,
  recruitments: Doc<"recruitments">[],
  statsByRecruitmentId: Map<Doc<"recruitments">["_id"], Doc<"recruitmentStats">>,
  snapshotAt: number,
) {
  const firstSubmissionLeadTimes: number[] = [];
  let submittedRows = 0;
  let resubmittedRows = 0;
  let postReminderSubmittedRows = 0;
  let postReminderExpectedStaff = 0;

  for (const recruitment of recruitments) {
    const submissions = await ctx.db
      .query("shiftSubmissions")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
      .take(SHIFT_BOARD_STAFF_LIMIT);
    const visibleSubmissions = submissions.filter((submission) => {
      // TODO[narrow]: 全deploymentでm033が完走し、verifyShiftSubmissionsの全pageが0になった後にfallbackを削除する。
      const firstSubmittedAt = submission.firstSubmittedAt ?? submission.submittedAt;
      return firstSubmittedAt <= snapshotAt;
    });
    const firstSubmittedAtValues = visibleSubmissions.map(
      // TODO[narrow]: 全deploymentでm033が完走し、verifyShiftSubmissionsの全pageが0になった後にfallbackを削除する。
      (submission) => submission.firstSubmittedAt ?? submission.submittedAt,
    );
    if (firstSubmittedAtValues.length > 0) {
      firstSubmissionLeadTimes.push(Math.max(0, Math.min(...firstSubmittedAtValues) - recruitment._creationTime));
    }

    submittedRows += visibleSubmissions.length;
    resubmittedRows += visibleSubmissions.filter(
      (submission) =>
        submission.firstSubmittedAt !== undefined &&
        submission.submittedAt > submission.firstSubmittedAt &&
        submission.submittedAt <= snapshotAt,
    ).length;

    const lastReminderSentAt = recruitment.lastReminderSentAt;
    if (happenedBy(lastReminderSentAt, snapshotAt)) {
      const stats = statsByRecruitmentId.get(recruitment._id);
      if (stats && stats.activeStaffCountSnapshot > 0) {
        postReminderExpectedStaff += stats.activeStaffCountSnapshot;
        postReminderSubmittedRows += visibleSubmissions.filter((submission) => {
          // TODO[narrow]: 全deploymentでm033が完走し、verifyShiftSubmissionsの全pageが0になった後にfallbackを削除する。
          const firstSubmittedAt = submission.firstSubmittedAt ?? submission.submittedAt;
          return firstSubmittedAt > lastReminderSentAt;
        }).length;
      }
    }
  }

  return {
    averageFirstSubmissionLeadTimeMs: average(firstSubmissionLeadTimes),
    postReminderSubmissionRate: ratioOrNull(postReminderSubmittedRows, postReminderExpectedStaff),
    resubmissionRate: ratioOrNull(resubmittedRows, submittedRows),
  };
}

async function computeShopSnapshotValues(ctx: MutationCtx, shop: Doc<"shops">, snapshot: ShopSnapshotContext) {
  const shopId = shop._id;
  const allStaffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(SHIFT_BOARD_STAFF_LIMIT);
  const staffs = allStaffs.filter((staff) => staff._creationTime <= snapshot.snapshotAt);
  const staffIds = new Set(staffs.map((staff) => staff._id));

  // 論理削除されていないLINE連携のうち、生きているスタッフに紐づくものだけを数える
  const lineAccounts = await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(SHIFT_BOARD_STAFF_LIMIT);
  const linkedAccounts = lineAccounts.filter(
    (account) => staffIds.has(account.staffId) && account.linkedAt <= snapshot.snapshotAt,
  );

  // TODO[narrow]: 全deploymentでm025/m028完走・billing readiness 0・canonical分析切替を確認後、
  //   shopBillingStatesのdual-readと下流のlegacy/free fallbackを削除する。旧rowの物理削除は別gateで行う。
  const legacyBillingState = await ctx.db
    .query("shopBillingStates")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .first();
  const organizationId = shop.organizationId;
  const organizationBillingState = organizationId
    ? await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .unique()
    : null;

  const allRecruitments = await ctx.db
    .query("recruitments")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(ANALYTICS_SHOP_STAGE_SCAN_LIMIT);
  const recruitments = allRecruitments.filter((recruitment) => recruitment._creationTime <= snapshot.snapshotAt);
  const firstRecruitment = recruitments.reduce<Doc<"recruitments"> | null>(
    (earliest, recruitment) =>
      earliest === null || recruitment._creationTime < earliest._creationTime ? recruitment : earliest,
    null,
  );
  const lastShiftRecruitment = recruitments.reduce<Doc<"recruitments"> | null>((latest, recruitment) => {
    if (latest === null) return recruitment;
    const recruitmentEndDay = dateStringToEpochDay(recruitment.periodEnd) ?? Number.NEGATIVE_INFINITY;
    const latestEndDay = dateStringToEpochDay(latest.periodEnd) ?? Number.NEGATIVE_INFINITY;
    if (recruitmentEndDay !== latestEndDay) return recruitmentEndDay > latestEndDay ? recruitment : latest;
    const recruitmentStartDay = dateStringToEpochDay(recruitment.periodStart) ?? Number.NEGATIVE_INFINITY;
    const latestStartDay = dateStringToEpochDay(latest.periodStart) ?? Number.NEGATIVE_INFINITY;
    if (recruitmentStartDay !== latestStartDay) return recruitmentStartDay > latestStartDay ? recruitment : latest;
    return recruitment._creationTime > latest._creationTime ? recruitment : latest;
  }, null);
  const recruitmentOpenDays = recruitments.flatMap((recruitment) => {
    const days = daysBetweenJstDates(dateJST(recruitment._creationTime), recruitment.deadline);
    return days === null ? [] : [Math.max(0, days + 1)];
  });
  const averageRecruitmentOpenDays = average(recruitmentOpenDays);
  const confirmedRecruitments = recruitments.filter((recruitment) => {
    const confirmedAt = confirmedAtForStage(recruitment);
    return confirmedAt !== null && confirmedAt <= snapshot.snapshotAt;
  });
  const lastConfirmedRecruitment = confirmedRecruitments.reduce<{
    recruitment: Doc<"recruitments">;
    confirmedAt: number;
  } | null>((latest, recruitment) => {
    const confirmedAt = confirmedAtForStage(recruitment);
    if (confirmedAt === null) return latest;
    return latest === null || confirmedAt > latest.confirmedAt ? { recruitment, confirmedAt } : latest;
  }, null);
  const confirmationLeadTimes = confirmedRecruitments.flatMap((recruitment) => {
    const confirmedAt = confirmedAtForStage(recruitment);
    return confirmedAt === null ? [] : [Math.max(0, confirmedAt - recruitment._creationTime)];
  });
  const averageConfirmationLeadTimeMs = average(confirmationLeadTimes);
  const averageDeadlineToConfirmationDays = average(
    confirmedRecruitments.flatMap((recruitment) => {
      const confirmedAt = confirmedAtForStage(recruitment);
      if (confirmedAt === null) return [];
      const days = daysBetweenJstDates(recruitment.deadline, dateJST(confirmedAt));
      return days === null ? [] : [Math.max(0, days)];
    }),
  );
  const recentRecruitmentStartAt = snapshot.snapshotAt - RECENT_RECRUITMENT_WINDOW_MS;
  const recruitmentCreatedLast30Days = recruitments.filter(
    (recruitment) => recruitment._creationTime >= recentRecruitmentStartAt,
  ).length;
  const lastRecruitmentCreatedAt =
    recruitments.length === 0 ? null : Math.max(...recruitments.map((recruitment) => recruitment._creationTime));
  const lastRecruitmentConfirmedAt = lastConfirmedRecruitment?.confirmedAt ?? null;
  const lastConfirmedRecruitmentLeadTimeMs = lastConfirmedRecruitment
    ? Math.max(0, lastConfirmedRecruitment.confirmedAt - lastConfirmedRecruitment.recruitment._creationTime)
    : null;
  const openRecruitments = recruitments.filter((recruitment) => {
    const confirmedAt = confirmedAtForStage(recruitment);
    return (
      (recruitment.status === "open" && recruitment.periodEnd >= snapshot.date) ||
      (confirmedAt !== null && confirmedAt > snapshot.snapshotAt && recruitment.periodEnd >= snapshot.date)
    );
  });
  const hasFutureOpenRecruitment = openRecruitments.some((recruitment) => recruitment.periodStart > snapshot.date);
  const hasCurrentOrFutureConfirmedShift = confirmedRecruitments.some(
    (recruitment) => recruitment.periodEnd >= snapshot.date,
  );
  const hasCurrentConfirmedShift = confirmedRecruitments.some(
    (recruitment) => recruitment.periodStart <= snapshot.date && recruitment.periodEnd >= snapshot.date,
  );
  const hasFutureConfirmedShift = confirmedRecruitments.some((recruitment) => recruitment.periodStart > snapshot.date);

  const recruitmentStats = await ctx.db
    .query("recruitmentStats")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .take(ANALYTICS_SHOP_STAGE_SCAN_LIMIT);
  const visibleRecruitmentIds = new Set(recruitments.map((recruitment) => recruitment._id));
  const visibleStats = recruitmentStats.filter(
    (stats) => visibleRecruitmentIds.has(stats.recruitmentId) && stats.updatedAt <= snapshot.snapshotAt,
  );
  const submittedStats = visibleStats.filter((stats) => stats.submittedCount > 0);
  const submittedRecruitmentCount = submittedStats.length;
  const submittedByRecruitmentId = new Map(visibleStats.map((stats) => [stats.recruitmentId, stats]));
  const hasSubmission = submittedStats.length > 0;
  const openRecruitmentSubmittedCount = openRecruitments.reduce(
    (sum, recruitment) => sum + (submittedByRecruitmentId.get(recruitment._id)?.submittedCount ?? 0),
    0,
  );
  const submittedTotal = visibleStats.reduce((sum, stats) => sum + stats.submittedCount, 0);
  const expectedStaffTotal = visibleStats.reduce((sum, stats) => sum + stats.activeStaffCountSnapshot, 0);
  const submissionRate = ratioOrNull(submittedTotal, expectedStaffTotal);
  const confirmedRecruitmentIds = new Set(confirmedRecruitments.map((recruitment) => recruitment._id));
  const confirmedStats = visibleStats.filter((stats) => confirmedRecruitmentIds.has(stats.recruitmentId));
  const confirmedSubmissionRate = ratioOrNull(
    confirmedStats.reduce((sum, stats) => sum + stats.submittedCount, 0),
    confirmedStats.reduce((sum, stats) => sum + stats.activeStaffCountSnapshot, 0),
  );
  const lastRecruitment = recruitments.reduce<Doc<"recruitments"> | null>(
    (latest, recruitment) =>
      latest === null || recruitment._creationTime > latest._creationTime ? recruitment : latest,
    null,
  );
  const lastRecruitmentStats = lastRecruitment ? submittedByRecruitmentId.get(lastRecruitment._id) : undefined;
  const lastRecruitmentSubmissionRate = lastRecruitmentStats
    ? ratioOrNull(lastRecruitmentStats.submittedCount, lastRecruitmentStats.activeStaffCountSnapshot)
    : null;
  const lastShiftStats = lastShiftRecruitment ? submittedByRecruitmentId.get(lastShiftRecruitment._id) : undefined;
  const lastShiftSubmissionRate = lastShiftStats
    ? ratioOrNull(lastShiftStats.submittedCount, lastShiftStats.activeStaffCountSnapshot)
    : null;
  const submissionTimingKpis = await computeSubmissionTimingKpis(
    ctx,
    recruitments,
    submittedByRecruitmentId,
    snapshot.snapshotAt,
  );

  // dry-run（suppressDelivery）だけの店舗を「通知送信あり」にしないため、先頭数件から実配送を探す
  const sentNotifications = await ctx.db
    .query("notificationOutbox")
    .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", "sent"))
    .take(ANALYTICS_SHOP_STAGE_SCAN_LIMIT);
  const deliveredNotifications = sentNotifications.filter(
    (job) => !notificationDeliverySuppressedForJob(job) && happenedBy(job.sentAt, snapshot.snapshotAt),
  );
  const hasNotificationSent = deliveredNotifications.length > 0;
  const emailNotificationSentCount = deliveredNotifications.filter((job) => job.channel === "email").length;
  const lineNotificationSentCount = deliveredNotifications.filter((job) => job.channel === "line").length;
  const shiftTargetStaffIds = new Set(
    staffs.filter((staff) => staff.excludedFromShift !== true).map((staff) => staff._id),
  );
  const reminderSentStaffIds = new Set(
    deliveredNotifications.flatMap((job) =>
      job.staffId && shiftTargetStaffIds.has(job.staffId) && isReminderNotificationJob(job) ? [job.staffId] : [],
    ),
  );
  const reminderSentStaffRate = ratioOrNull(reminderSentStaffIds.size, shiftTargetStaffIds.size);

  const openNotificationFailures = await ctx.db
    .query("notificationFailureInbox")
    .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", shopId).eq("status", "open"))
    .take(ANALYTICS_SHOP_STAGE_SCAN_LIMIT);
  const openNotificationFailureCount = openNotificationFailures.filter(
    (failure) => failure.lastFailedAt <= snapshot.snapshotAt,
  ).length;

  // 主要イベント（店舗作成・スタッフ追加・LINE連携・募集作成・確定・催促・下書き保存・提出）の最終発生時刻
  const lastActivityAt = Math.max(
    shop._creationTime,
    ...staffs.map((staff) => staff._creationTime),
    ...linkedAccounts.map((account) => account.linkedAt),
    ...recruitments.flatMap((recruitment) => [
      recruitment._creationTime,
      happenedBy(recruitment.confirmedAt, snapshot.snapshotAt) ? recruitment.confirmedAt : 0,
      happenedBy(recruitment.lastReminderSentAt, snapshot.snapshotAt) ? recruitment.lastReminderSentAt : 0,
      happenedBy(recruitment.draftSavedAt, snapshot.snapshotAt) ? recruitment.draftSavedAt : 0,
    ]),
    ...visibleStats.map((stats) => stats.updatedAt),
  );

  const previousStage = await latestPreviousShopStage(ctx, shopId, snapshot.date);
  const hadRetainedStage =
    isRetainedHistoryStage(previousStage) ||
    confirmedRecruitments.some((recruitment) => recruitment.periodEnd < snapshot.date);
  const hadActiveOrRetainedStage =
    isActiveOrRetainedHistoryStage(previousStage) ||
    hadRetainedStage ||
    recruitments.some((recruitment) => recruitment.periodEnd < snapshot.date);

  const stageInputs: ShopStageInputs = {
    realStaffCount: staffs.filter((staff) => staff.excludedFromShift !== true).length,
    recruitmentCount: recruitments.length,
    confirmedRecruitmentCount: confirmedRecruitments.length,
    hasSubmission,
    hasNotificationSent,
    hasCurrentOrFutureConfirmedShift,
    hasCurrentConfirmedShift,
    hasOpenRecruitment: openRecruitments.length > 0,
    hasFutureOpenRecruitment,
    hasFutureConfirmedShift,
    hadActiveOrRetainedStage,
    hadRetainedStage,
    lastActivityAt,
  };

  return {
    shopName: shop.name,
    shopCreatedAt: shop._creationTime,
    planKey: organizationBillingState
      ? analyticsPlanKeyForOrganizationBillingState(organizationBillingState.state)
      : (legacyBillingState?.planKey ?? ("free" as const)),
    staffCount: staffs.length,
    shiftTargetStaffCount: stageInputs.realStaffCount,
    lineLinkedStaffCount: linkedAccounts.length,
    lineFollowingStaffCount: linkedAccounts.filter((account) => account.following).length,
    openRecruitmentCount: openRecruitments.length,
    stage: classifyShopStage(stageInputs, snapshot.snapshotAt),
    recruitmentCount: stageInputs.recruitmentCount,
    confirmedRecruitmentCount: stageInputs.confirmedRecruitmentCount,
    hasSubmission,
    hasNotificationSent,
    hasCurrentOrFutureConfirmedShift,
    hasCurrentConfirmedShift,
    hasFutureOpenRecruitment,
    hasFutureConfirmedShift,
    hadActiveOrRetainedStage,
    hadRetainedStage,
    lastActivityAt,
    stageReferenceAt: snapshot.snapshotAt,
    openRecruitmentSubmittedCount,
    submittedRecruitmentCount,
    openNotificationFailureCount,
    recruitmentCreatedLast30Days,
    emailNotificationSentCount,
    lineNotificationSentCount,
    ...(submissionRate === null ? {} : { submissionRate }),
    ...(confirmedSubmissionRate === null ? {} : { confirmedSubmissionRate }),
    ...(submissionTimingKpis.averageFirstSubmissionLeadTimeMs === null
      ? {}
      : { averageFirstSubmissionLeadTimeMs: submissionTimingKpis.averageFirstSubmissionLeadTimeMs }),
    ...(averageConfirmationLeadTimeMs === null ? {} : { averageConfirmationLeadTimeMs }),
    ...(submissionTimingKpis.postReminderSubmissionRate === null
      ? {}
      : { postReminderSubmissionRate: submissionTimingKpis.postReminderSubmissionRate }),
    ...(submissionTimingKpis.resubmissionRate === null
      ? {}
      : { resubmissionRate: submissionTimingKpis.resubmissionRate }),
    ...(lastRecruitmentSubmissionRate === null ? {} : { lastRecruitmentSubmissionRate }),
    ...(firstRecruitment === null
      ? {}
      : {
          firstRecruitmentCreatedAt: firstRecruitment._creationTime,
          firstRecruitmentDeadline: firstRecruitment.deadline,
        }),
    ...(lastShiftRecruitment === null
      ? {}
      : {
          lastShiftCreatedAt: lastShiftRecruitment._creationTime,
          lastShiftPeriodStart: lastShiftRecruitment.periodStart,
          lastShiftPeriodEnd: lastShiftRecruitment.periodEnd,
        }),
    ...(lastShiftSubmissionRate === null ? {} : { lastShiftSubmissionRate }),
    ...(averageRecruitmentOpenDays === null ? {} : { averageRecruitmentOpenDays }),
    ...(averageDeadlineToConfirmationDays === null ? {} : { averageDeadlineToConfirmationDays }),
    ...(reminderSentStaffRate === null ? {} : { reminderSentStaffRate }),
    ...(lastRecruitmentCreatedAt === null ? {} : { lastRecruitmentCreatedAt }),
    ...(lastRecruitmentConfirmedAt === null ? {} : { lastRecruitmentConfirmedAt }),
    ...(lastConfirmedRecruitmentLeadTimeMs === null ? {} : { lastConfirmedRecruitmentLeadTimeMs }),
  };
}

function analyticsPlanKeyForOrganizationBillingState(
  state: Doc<"organizationBillingStates">["state"],
): "free" | "standard" | "premium" {
  const plan = resolveOrganizationBillingPlans(state).targetingPlan;
  if (plan === "business") return "premium";
  if (plan === "trial" || plan === "pro") return "standard";
  return "free";
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
  stageCounts: v.object({
    beforeStart: v.number(),
    activeTrial: v.number(),
    activeTrialDormant: v.number(),
    retained: v.number(),
    retainedDormant: v.number(),
  }),
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
    stageCounts: {
      beforeStart: 0,
      activeTrial: 0,
      activeTrialDormant: 0,
      retained: 0,
      retainedDormant: 0,
    },
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
    const snapshotAt = jstDayRangeMs(date).endMs - SNAPSHOT_END_OFFSET_MS;
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
        // Phase 1 導入前の古い行には stage がない
        if (snapshot.stage) acc.stageCounts[snapshot.stage] += 1;
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
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "pending").lte("createdAt", snapshotAt))
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
      shopStageCounts: acc.stageCounts,
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
      if (notificationDeliverySuppressedForJob(job)) continue;
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
