import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { jstDayRangeMs } from "../_lib/dateFormat";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { ANALYTICS_AGGREGATION_PAGE_SIZE } from "../constants";
import { ANALYTICS_METRICS, notificationMetric } from "./metrics";

const TARGET_DATE = "2026-07-03";
const { startMs, endMs } = jstDayRangeMs(TARGET_DATE);
const DAY_MS = 24 * 60 * 60 * 1000;

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

async function runDailyAggregation(t: T, date: string) {
  await t.mutation(internal.analytics.dailyAggregation.run, { date });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function getEventCount(t: T, date: string, metric: string) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("analyticsDailyEventCounts")
      .withIndex("by_date_metric", (q) => q.eq("date", date).eq("metric", metric))
      .first();
  });
}

async function insertStaff(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  overrides: Partial<Doc<"staffs">> = {},
): Promise<Id<"staffs">> {
  return await ctx.db.insert("staffs", {
    shopId,
    name: "スタッフ",
    email: "staff@example.com",
    isDeleted: false,
    ...overrides,
  });
}

function emailPayload(context: string, suppressDelivery?: boolean) {
  return {
    kind: "email" as const,
    from: "シフトリ <noreply@example.com>",
    to: "staff@example.com",
    subject: "テスト",
    html: "<p>test</p>",
    context,
    ...(suppressDelivery ? { suppressDelivery } : {}),
  };
}

let dedupeSeq = 0;

async function insertOutbox(
  ctx: MutationCtx,
  args: {
    shopId: Id<"shops">;
    channel: "email" | "line";
    status: "sent" | "failed";
    at: number;
    context: string;
    suppressDelivery?: boolean;
  },
) {
  dedupeSeq += 1;
  const payload =
    args.channel === "email"
      ? emailPayload(args.context, args.suppressDelivery)
      : {
          kind: "line" as const,
          toUserId: "U0000000000000000000000000000000",
          text: "テスト",
          ...(args.suppressDelivery ? { suppressDelivery: args.suppressDelivery } : {}),
          fallbackEmail: { dedupeKey: `fallback:${dedupeSeq}`, payload: emailPayload(args.context) },
        };
  return await ctx.db.insert("notificationOutbox", {
    channel: args.channel,
    status: args.status,
    dedupeKey: `test:${dedupeSeq}`,
    shopId: args.shopId,
    payload,
    attemptCount: 1,
    nextRunAt: args.at,
    createdAt: args.at,
    updatedAt: args.at,
    ...(args.status === "sent" ? { sentAt: args.at } : { failedAt: args.at }),
  });
}

async function insertRegistrationRequest(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  args: { status: "pending" | "approved" | "rejected"; createdAt: number; reviewedAt?: number },
) {
  return await ctx.db.insert("staffRegistrationRequests", {
    shopId,
    name: "申請者",
    email: "request@example.com",
    emailNormalized: "request@example.com",
    status: args.status,
    termsConsentVersion: "1",
    privacyConsentVersion: "1",
    termsDocumentVersion: "1",
    privacyDocumentVersion: "1",
    consentedAt: args.createdAt,
    createdAt: args.createdAt,
    reviewedAt: args.reviewedAt,
  });
}

describe("analytics/dailyAggregation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 対象日のJST正午に固定（挿入するドキュメントの _creationTime が対象日窓に入る）
    vi.setSystemTime(new Date(startMs + 12 * 60 * 60 * 1000));
  });
  afterEach(() => vi.useRealTimers());

  it("店舗別スナップショットとサービス全体rollupを集計する", async () => {
    const t = setup();
    const { shopA, shopB } = await t.run(async (ctx) => {
      // 店舗A: standardプラン、スタッフ3名（うち1名シフト対象外）+ 論理削除1名、LINE連携2名（うち1名フォロー解除）
      const shopA = await seedShop(ctx, "店舗A");
      await ctx.db.insert("shopBillingStates", {
        shopId: shopA,
        planKey: "standard",
        source: "manual",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const staffA1 = await insertStaff(ctx, shopA);
      const staffA2 = await insertStaff(ctx, shopA);
      await insertStaff(ctx, shopA, { excludedFromShift: true });
      const deletedStaff = await insertStaff(ctx, shopA, { isDeleted: true });
      await ctx.db.insert("staffLineAccounts", {
        staffId: staffA1,
        shopId: shopA,
        lineUserId: "U1",
        linkedAt: startMs - 100 * 24 * 60 * 60 * 1000, // 過去の連携（スナップショットには影響しない）
        following: true,
        isDeleted: false,
      });
      await ctx.db.insert("staffLineAccounts", {
        staffId: staffA2,
        shopId: shopA,
        lineUserId: "U2",
        linkedAt: startMs - 100 * 24 * 60 * 60 * 1000,
        following: false,
        isDeleted: false,
      });
      // 論理削除スタッフのLINE連携はカウントしない
      await ctx.db.insert("staffLineAccounts", {
        staffId: deletedStaff,
        shopId: shopA,
        lineUserId: "U3",
        linkedAt: startMs - 100 * 24 * 60 * 60 * 1000,
        following: true,
        isDeleted: false,
      });
      // open募集1 + 論理削除されたopen募集1 + confirmed募集1
      const recruitmentBase = {
        shopId: shopA,
        periodStart: "2026-07-10",
        periodEnd: "2026-07-16",
        deadline: "2026-07-07",
        shopClosedDates: [] as string[],
        submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
      };
      await ctx.db.insert("recruitments", { ...recruitmentBase, status: "open", isDeleted: false });
      await ctx.db.insert("recruitments", { ...recruitmentBase, status: "open", isDeleted: true });
      await ctx.db.insert("recruitments", {
        ...recruitmentBase,
        status: "confirmed",
        confirmedAt: startMs - 24 * 60 * 60 * 1000,
        isDeleted: false,
      });

      // 店舗B: 課金状態なし → free扱い、スタッフ1名
      const shopB = await seedShop(ctx, "店舗B");
      await insertStaff(ctx, shopB);

      // 論理削除店舗はスナップショット対象外
      const deletedShop = await seedShop(ctx, "削除済み店舗");
      await ctx.db.patch(deletedShop, { isDeleted: true });
      await insertStaff(ctx, deletedShop);

      // pending申請2件（サービス全体のpendingRegistrationRequestCount）
      await insertRegistrationRequest(ctx, shopA, { status: "pending", createdAt: Date.now() });
      await insertRegistrationRequest(ctx, shopB, { status: "pending", createdAt: Date.now() });

      return { shopA, shopB };
    });

    await runDailyAggregation(t, TARGET_DATE);

    const shopSnapshots = await t.run(async (ctx) => {
      return await ctx.db
        .query("analyticsDailyShopSnapshots")
        .withIndex("by_date_shopId", (q) => q.eq("date", TARGET_DATE))
        .collect();
    });
    expect(shopSnapshots).toHaveLength(2);

    const snapshotA = shopSnapshots.find((s) => s.shopId === shopA);
    expect(snapshotA).toMatchObject({
      planKey: "standard",
      staffCount: 3,
      shiftTargetStaffCount: 2,
      lineLinkedStaffCount: 2,
      lineFollowingStaffCount: 1,
      openRecruitmentCount: 1,
      // 実スタッフ2人 + 現在/未来シフトあり + 今日の確定シフトなしなので立ち上がり中。判定材料も保存される
      stage: "activeTrial",
      recruitmentCount: 2,
      confirmedRecruitmentCount: 1,
      hasSubmission: false,
      hasNotificationSent: false,
      hasCurrentOrFutureConfirmedShift: true,
      hasCurrentConfirmedShift: false,
    });
    const snapshotB = shopSnapshots.find((s) => s.shopId === shopB);
    expect(snapshotB).toMatchObject({ planKey: "free", staffCount: 1, stage: "beforeStart" });

    const service = await t.run(async (ctx) => {
      return await ctx.db
        .query("analyticsDailyServiceSnapshots")
        .withIndex("by_date", (q) => q.eq("date", TARGET_DATE))
        .first();
    });
    expect(service).toMatchObject({
      shopCount: 2,
      shopCountByPlan: { free: 1, standard: 1, premium: 0 },
      staffCount: 4,
      shiftTargetStaffCount: 3,
      lineLinkedStaffCount: 2,
      lineFollowingStaffCount: 1,
      openRecruitmentCount: 1,
      pendingRegistrationRequestCount: 2,
      shopStageCounts: { beforeStart: 1, activeTrial: 1, activeTrialDormant: 0, retained: 0, retainedDormant: 0 },
    });
  });

  it("店舗ステージを継続中/継続後休眠まで判定して集計する", async () => {
    const t = setup();
    const oldMs = startMs - 45 * 24 * 60 * 60 * 1000; // 45日前

    const recruitmentBase = {
      shopClosedDates: [] as string[],
      submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
      isDeleted: false,
    };

    // 休眠店舗: 45日前に一式作成し、それ以降イベントがない（確定3件・提出あり・通知あり）
    vi.setSystemTime(new Date(oldMs));
    const dormantShop = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "休眠店舗");
      for (let i = 0; i < 3; i++) {
        await insertStaff(ctx, shopId, { email: `dormant${i}@example.com` });
      }
      for (let i = 0; i < 3; i++) {
        const recruitmentId = await ctx.db.insert("recruitments", {
          ...recruitmentBase,
          shopId,
          periodStart: "2026-05-01",
          periodEnd: "2026-05-07",
          deadline: "2026-04-28",
          status: "confirmed",
          confirmedAt: oldMs,
        });
        await ctx.db.insert("recruitmentStats", {
          recruitmentId,
          shopId,
          submittedCount: 2,
          activeStaffCountSnapshot: 3,
          updatedAt: oldMs,
        });
      }
      await insertOutbox(ctx, {
        shopId,
        channel: "email",
        status: "sent",
        at: oldMs,
        context: "notification.sendRecruitmentNotificationEmails",
      });
      return shopId;
    });

    // 継続店舗: 対象日と被る確定シフトがある（現在も稼働中）
    vi.setSystemTime(new Date(startMs + 12 * 60 * 60 * 1000));
    const retainedShop = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "継続店舗");
      for (let i = 0; i < 3; i++) {
        await insertStaff(ctx, shopId, { email: `retained${i}@example.com` });
      }
      for (let i = 0; i < 3; i++) {
        const recruitmentId = await ctx.db.insert("recruitments", {
          ...recruitmentBase,
          shopId,
          periodStart: i === 0 ? TARGET_DATE : "2026-06-01",
          periodEnd: i === 0 ? TARGET_DATE : "2026-06-07",
          deadline: "2026-05-28",
          status: "confirmed",
          confirmedAt: startMs - 24 * 60 * 60 * 1000,
        });
        await ctx.db.insert("recruitmentStats", {
          recruitmentId,
          shopId,
          submittedCount: 2,
          activeStaffCountSnapshot: 3,
          updatedAt: startMs,
        });
      }
      const openId = await ctx.db.insert("recruitments", {
        ...recruitmentBase,
        shopId,
        periodStart: "2026-07-10",
        periodEnd: "2026-07-16",
        deadline: "2026-07-07",
        status: "open",
      });
      await ctx.db.insert("recruitmentStats", {
        recruitmentId: openId,
        shopId,
        submittedCount: 0,
        activeStaffCountSnapshot: 3,
        updatedAt: startMs,
      });
      await insertOutbox(ctx, {
        shopId,
        channel: "email",
        status: "sent",
        at: startMs + 60 * 60 * 1000,
        context: "notification.sendRecruitmentNotificationEmails",
      });
      return shopId;
    });

    await runDailyAggregation(t, TARGET_DATE);

    const snapshots = await t.run(async (ctx) => {
      return await ctx.db
        .query("analyticsDailyShopSnapshots")
        .withIndex("by_date_shopId", (q) => q.eq("date", TARGET_DATE))
        .collect();
    });

    // 過去に継続実績はあるが、現在/未来シフト・進行中募集・直近30日の活動がない → 継続後休眠
    const dormantSnapshot = snapshots.find((s) => s.shopId === dormantShop);
    expect(dormantSnapshot).toMatchObject({
      stage: "retainedDormant",
      recruitmentCount: 3,
      confirmedRecruitmentCount: 3,
      hasSubmission: true,
      hasNotificationSent: true,
      hasCurrentOrFutureConfirmedShift: false,
      hasCurrentConfirmedShift: false,
      hadRetainedStage: true,
    });
    // _creationTime はconvex-testでサブミリ秒が付くため、45日前ちょうど付近であることだけ確認する
    expect(dormantSnapshot?.lastActivityAt).toBeGreaterThanOrEqual(oldMs);
    expect(dormantSnapshot?.lastActivityAt).toBeLessThan(oldMs + 1000);

    // 今日に被る確定シフトあり → 継続。進行中募集の提出0件も判定材料として残る
    expect(snapshots.find((s) => s.shopId === retainedShop)).toMatchObject({
      stage: "retained",
      recruitmentCount: 4,
      confirmedRecruitmentCount: 3,
      hasCurrentConfirmedShift: true,
      openRecruitmentCount: 1,
      openRecruitmentSubmittedCount: 0,
    });

    const service = await t.run(async (ctx) => {
      return await ctx.db
        .query("analyticsDailyServiceSnapshots")
        .withIndex("by_date", (q) => q.eq("date", TARGET_DATE))
        .first();
    });
    expect(service?.shopStageCounts).toEqual({
      beforeStart: 0,
      activeTrial: 0,
      activeTrialDormant: 0,
      retained: 1,
      retainedDormant: 1,
    });
  });

  it("ステージ判定は実行日ではなく集計対象日の終端を基準にする", async () => {
    const t = setup();
    const oldMs = startMs - 45 * 24 * 60 * 60 * 1000;
    const recruitmentBase = {
      shopClosedDates: [] as string[],
      submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
      isDeleted: false,
    };

    vi.setSystemTime(new Date(oldMs));
    const shopId = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "対象日基準の店舗");
      for (let i = 0; i < 3; i++) {
        await insertStaff(ctx, shopId, { email: `asof${i}@example.com` });
      }
      for (let i = 0; i < 3; i++) {
        const recruitmentId = await ctx.db.insert("recruitments", {
          ...recruitmentBase,
          shopId,
          periodStart: i === 0 ? TARGET_DATE : "2026-05-01",
          periodEnd: i === 0 ? TARGET_DATE : "2026-05-07",
          deadline: "2026-04-28",
          status: "confirmed",
          confirmedAt: oldMs,
        });
        await ctx.db.insert("recruitmentStats", {
          recruitmentId,
          shopId,
          submittedCount: 2,
          activeStaffCountSnapshot: 3,
          updatedAt: oldMs,
        });
      }
      await insertOutbox(ctx, {
        shopId,
        channel: "email",
        status: "sent",
        at: oldMs,
        context: "notification.sendRecruitmentNotificationEmails",
      });
      return shopId;
    });

    // 翌日以降に前日分を集計しても、TARGET_DATE時点では「現在/未来シフトあり」と判定する。
    vi.setSystemTime(new Date(endMs + 12 * 60 * 60 * 1000));
    await runDailyAggregation(t, TARGET_DATE);

    const snapshot = await t.run(async (ctx) => {
      return await ctx.db
        .query("analyticsDailyShopSnapshots")
        .withIndex("by_date_shopId", (q) => q.eq("date", TARGET_DATE).eq("shopId", shopId))
        .first();
    });
    expect(snapshot).toMatchObject({
      stage: "retained",
      hasCurrentOrFutureConfirmedShift: true,
      hasCurrentConfirmedShift: true,
      stageReferenceAt: endMs - 1,
    });
  });

  it("継続店舗向けの作成頻度と確定リードタイムを店舗スナップショットに保存する", async () => {
    const t = setup();
    const recruitmentBase = {
      shopClosedDates: [] as string[],
      submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
      isDeleted: false,
    };
    const recruitmentSpecs = [
      { createdAt: startMs - 20 * DAY_MS, leadTimeMs: 2 * DAY_MS },
      { createdAt: startMs - 10 * DAY_MS, leadTimeMs: 1 * DAY_MS },
      { createdAt: startMs - 40 * DAY_MS, leadTimeMs: 4 * DAY_MS },
    ];

    vi.setSystemTime(new Date(startMs - 45 * DAY_MS));
    const { shopId, staffIds } = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "継続KPI店舗");
      const staffIds: Id<"staffs">[] = [];
      for (let i = 0; i < 3; i++) {
        staffIds.push(await insertStaff(ctx, shopId, { email: `retained-kpi-${i}@example.com` }));
      }
      return { shopId, staffIds };
    });

    for (const [index, spec] of recruitmentSpecs.entries()) {
      vi.setSystemTime(new Date(spec.createdAt));
      await t.run(async (ctx) => {
        const confirmedAt = spec.createdAt + spec.leadTimeMs;
        const firstSubmittedAt = spec.createdAt + 12 * 60 * 60 * 1000;
        const recruitmentId = await ctx.db.insert("recruitments", {
          ...recruitmentBase,
          shopId,
          periodStart: index === 1 ? TARGET_DATE : "2026-06-01",
          periodEnd: index === 1 ? TARGET_DATE : "2026-06-07",
          deadline: "2026-05-28",
          status: "confirmed",
          confirmedAt,
          lastReminderSentAt: spec.createdAt + 6 * 60 * 60 * 1000,
        });
        await ctx.db.insert("recruitmentStats", {
          recruitmentId,
          shopId,
          submittedCount: 2,
          activeStaffCountSnapshot: 3,
          updatedAt: confirmedAt,
        });
        await ctx.db.insert("shiftSubmissions", {
          recruitmentId,
          staffId: staffIds[0],
          firstSubmittedAt,
          submittedAt: index === 0 ? firstSubmittedAt + 60 * 60 * 1000 : firstSubmittedAt,
        });
        await ctx.db.insert("shiftSubmissions", {
          recruitmentId,
          staffId: staffIds[1],
          firstSubmittedAt: firstSubmittedAt + 60 * 60 * 1000,
          submittedAt: firstSubmittedAt + 60 * 60 * 1000,
        });
      });
    }

    await t.run(async (ctx) => {
      await insertOutbox(ctx, {
        shopId,
        channel: "email",
        status: "sent",
        at: startMs + 60 * 60 * 1000,
        context: "notification.sendRecruitmentNotificationEmails",
      });
      await insertOutbox(ctx, {
        shopId,
        channel: "email",
        status: "sent",
        at: startMs + 2 * 60 * 60 * 1000,
        context: "notification.sendReminderEmails",
      });
      await insertOutbox(ctx, {
        shopId,
        channel: "line",
        status: "sent",
        at: startMs + 3 * 60 * 60 * 1000,
        context: "notification.sendRecruitmentNotificationEmails",
      });
    });

    const expected = await t.run(async (ctx) => {
      const recruitments = await ctx.db
        .query("recruitments")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
        .collect();
      const submissionsByRecruitment = await Promise.all(
        recruitments.map(async (recruitment) => {
          return {
            recruitment,
            submissions: await ctx.db
              .query("shiftSubmissions")
              .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
              .collect(),
          };
        }),
      );
      const snapshotAt = endMs - 1;
      const recentStartAt = snapshotAt - 30 * DAY_MS;
      const leadTimes = recruitments.flatMap((recruitment) =>
        recruitment.status === "confirmed" && recruitment.confirmedAt !== undefined
          ? [Math.max(0, recruitment.confirmedAt - recruitment._creationTime)]
          : [],
      );
      const lastConfirmedRecruitment = recruitments.reduce<{
        recruitment: (typeof recruitments)[number];
        confirmedAt: number;
      } | null>((latest, recruitment) => {
        if (recruitment.status !== "confirmed" || recruitment.confirmedAt === undefined) return latest;
        return latest === null || recruitment.confirmedAt > latest.confirmedAt
          ? { recruitment, confirmedAt: recruitment.confirmedAt }
          : latest;
      }, null);
      const firstSubmissionLeadTimes = submissionsByRecruitment.map(({ recruitment, submissions }) => {
        const firstSubmittedAt = Math.min(
          ...submissions.map((submission) => submission.firstSubmittedAt ?? submission.submittedAt),
        );
        return Math.max(0, firstSubmittedAt - recruitment._creationTime);
      });
      return {
        averageConfirmationLeadTimeMs: leadTimes.reduce((sum, value) => sum + value, 0) / leadTimes.length,
        averageFirstSubmissionLeadTimeMs:
          firstSubmissionLeadTimes.reduce((sum, value) => sum + value, 0) / firstSubmissionLeadTimes.length,
        lastRecruitmentConfirmedAt: Math.max(...recruitments.flatMap((recruitment) => recruitment.confirmedAt ?? [])),
        lastConfirmedRecruitmentLeadTimeMs: lastConfirmedRecruitment
          ? lastConfirmedRecruitment.confirmedAt - lastConfirmedRecruitment.recruitment._creationTime
          : null,
        lastRecruitmentCreatedAt: Math.max(...recruitments.map((recruitment) => recruitment._creationTime)),
        recruitmentCreatedLast30Days: recruitments.filter((recruitment) => recruitment._creationTime >= recentStartAt)
          .length,
        submittedRecruitmentCount: submissionsByRecruitment.filter(({ submissions }) => submissions.length > 0).length,
      };
    });

    vi.setSystemTime(new Date(endMs + 12 * 60 * 60 * 1000));
    await runDailyAggregation(t, TARGET_DATE);

    const snapshot = await t.run(async (ctx) => {
      return await ctx.db
        .query("analyticsDailyShopSnapshots")
        .withIndex("by_date_shopId", (q) => q.eq("date", TARGET_DATE).eq("shopId", shopId))
        .first();
    });
    expect(snapshot).toMatchObject({
      stage: "retained",
      recruitmentCreatedLast30Days: expected.recruitmentCreatedLast30Days,
      submittedRecruitmentCount: expected.submittedRecruitmentCount,
      submissionRate: 6 / 9,
      averageFirstSubmissionLeadTimeMs: expected.averageFirstSubmissionLeadTimeMs,
      averageConfirmationLeadTimeMs: expected.averageConfirmationLeadTimeMs,
      emailNotificationSentCount: 2,
      lineNotificationSentCount: 1,
      postReminderSubmissionRate: 6 / 9,
      resubmissionRate: 1 / 6,
      lastRecruitmentSubmissionRate: 2 / 3,
      lastRecruitmentConfirmedAt: expected.lastRecruitmentConfirmedAt,
      lastConfirmedRecruitmentLeadTimeMs: expected.lastConfirmedRecruitmentLeadTimeMs,
    });
    expect(snapshot?.lastRecruitmentCreatedAt).toBe(expected.lastRecruitmentCreatedAt);

    const stages = await t.query(internal.analyticsDashboard.queries.getShopStages, { date: TARGET_DATE });
    const row = stages.rows.find((item) => item.shopId === shopId);
    expect(row).toMatchObject({
      submissionRate: 6 / 9,
      submittedRecruitmentCount: expected.submittedRecruitmentCount,
      averageFirstSubmissionLeadTimeMs: expected.averageFirstSubmissionLeadTimeMs,
      lastConfirmedRecruitmentLeadTimeMs: expected.lastConfirmedRecruitmentLeadTimeMs,
      notificationLineSentRate: 1 / 3,
      postReminderSubmissionRate: 6 / 9,
      resubmissionRate: 1 / 6,
      lastRecruitmentSubmissionRate: 2 / 3,
    });
  });

  it("通知イベントをchannel×結果×種別でカウントし、発生ゼロのmetricも0で書く", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const shopId = await seedShop(ctx);
      const at = startMs + 60 * 60 * 1000;
      // 催促メール2件
      await insertOutbox(ctx, {
        shopId,
        channel: "email",
        status: "sent",
        at,
        context: "notification.sendReminderEmails",
      });
      await insertOutbox(ctx, {
        shopId,
        channel: "email",
        status: "sent",
        at,
        context: "notification.sendReminderEmails",
      });
      // 募集メール1件
      await insertOutbox(ctx, {
        shopId,
        channel: "email",
        status: "sent",
        at,
        context: "notification.sendRecruitmentNotificationEmails",
      });
      // LINE確定通知1件（fallbackEmailのcontextで種別判定される）
      await insertOutbox(ctx, {
        shopId,
        channel: "line",
        status: "sent",
        at,
        context: "notification.sendConfirmationEmail",
      });
      // LINE連携案内メールの最終失敗1件
      await insertOutbox(ctx, { shopId, channel: "email", status: "failed", at, context: "line.sendInviteEmail" });
      // dry-run（suppressDelivery）はKPI対象外
      await insertOutbox(ctx, {
        shopId,
        channel: "email",
        status: "sent",
        at,
        context: "notification.sendReminderEmails",
        suppressDelivery: true,
      });
    });

    await runDailyAggregation(t, TARGET_DATE);

    expect(await getEventCount(t, TARGET_DATE, notificationMetric("email", "sent", "reminder"))).toMatchObject({
      count: 2,
    });
    expect(await getEventCount(t, TARGET_DATE, notificationMetric("email", "sent", "recruitment"))).toMatchObject({
      count: 1,
    });
    expect(await getEventCount(t, TARGET_DATE, notificationMetric("line", "sent", "confirmation"))).toMatchObject({
      count: 1,
    });
    expect(await getEventCount(t, TARGET_DATE, notificationMetric("email", "failed", "lineInvite"))).toMatchObject({
      count: 1,
    });
    // 発生していない組み合わせも0行として書かれる（「未集計」と「0件」の区別）
    expect(await getEventCount(t, TARGET_DATE, notificationMetric("line", "failed", "other"))).toMatchObject({
      count: 0,
    });
  });

  it("JST日付境界の半開区間 [00:00, 24:00) でイベントを振り分ける", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const shopId = await seedShop(ctx);
      const context = "notification.sendReminderEmails";
      // 前日 23:59:59.999 JST → 対象日に含まない
      await insertOutbox(ctx, { shopId, channel: "email", status: "sent", at: startMs - 1, context });
      // 対象日 00:00:00 JST → 含む
      await insertOutbox(ctx, { shopId, channel: "email", status: "sent", at: startMs, context });
      // 対象日 23:59:59.999 JST → 含む
      await insertOutbox(ctx, { shopId, channel: "email", status: "sent", at: endMs - 1, context });
      // 翌日 00:00:00 JST → 含まない
      await insertOutbox(ctx, { shopId, channel: "email", status: "sent", at: endMs, context });
    });

    await runDailyAggregation(t, TARGET_DATE);

    expect(await getEventCount(t, TARGET_DATE, notificationMetric("email", "sent", "reminder"))).toMatchObject({
      count: 2,
    });
  });

  it("同日を再実行しても値が変わらない（絶対値upsertの冪等性）", async () => {
    const t = setup();
    const shopId = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx);
      await insertStaff(ctx, shopId);
      await insertOutbox(ctx, {
        shopId,
        channel: "email",
        status: "sent",
        at: startMs + 1000,
        context: "notification.sendReminderEmails",
      });
      return shopId;
    });

    await runDailyAggregation(t, TARGET_DATE);

    await t.run(async (ctx) => {
      const shopSnapshot = await ctx.db
        .query("analyticsDailyShopSnapshots")
        .withIndex("by_date_shopId", (q) => q.eq("date", TARGET_DATE).eq("shopId", shopId))
        .first();
      if (!shopSnapshot) throw new Error("shopSnapshot is missing");
      const { _creationTime: _shopCreationTime, _id: _shopSnapshotId, ...shopSnapshotValues } = shopSnapshot;
      await ctx.db.insert("analyticsDailyShopSnapshots", {
        ...shopSnapshotValues,
        computedAt: shopSnapshotValues.computedAt - 1,
      });

      const serviceSnapshot = await ctx.db
        .query("analyticsDailyServiceSnapshots")
        .withIndex("by_date", (q) => q.eq("date", TARGET_DATE))
        .first();
      if (!serviceSnapshot) throw new Error("serviceSnapshot is missing");
      const {
        _creationTime: _serviceCreationTime,
        _id: _serviceSnapshotId,
        ...serviceSnapshotValues
      } = serviceSnapshot;
      await ctx.db.insert("analyticsDailyServiceSnapshots", {
        ...serviceSnapshotValues,
        computedAt: serviceSnapshotValues.computedAt - 1,
      });

      const eventCount = await ctx.db
        .query("analyticsDailyEventCounts")
        .withIndex("by_date_metric", (q) =>
          q.eq("date", TARGET_DATE).eq("metric", notificationMetric("email", "sent", "reminder")),
        )
        .first();
      if (!eventCount) throw new Error("eventCount is missing");
      const { _creationTime: _eventCreationTime, _id: _eventCountId, ...eventCountValues } = eventCount;
      await ctx.db.insert("analyticsDailyEventCounts", {
        ...eventCountValues,
        updatedAt: eventCountValues.updatedAt - 1,
      });
    });

    await runDailyAggregation(t, TARGET_DATE);

    expect(await getEventCount(t, TARGET_DATE, notificationMetric("email", "sent", "reminder"))).toMatchObject({
      count: 1,
    });
    expect(await getEventCount(t, TARGET_DATE, ANALYTICS_METRICS.staffCreated)).toMatchObject({ count: 1 });

    // (date, metric) の行が重複していないこと
    const reminderRows = await t.run(async (ctx) => {
      return await ctx.db
        .query("analyticsDailyEventCounts")
        .withIndex("by_date_metric", (q) =>
          q.eq("date", TARGET_DATE).eq("metric", notificationMetric("email", "sent", "reminder")),
        )
        .collect();
    });
    expect(reminderRows).toHaveLength(1);

    const shopRows = await t.run(async (ctx) => {
      return await ctx.db
        .query("analyticsDailyShopSnapshots")
        .withIndex("by_date_shopId", (q) => q.eq("date", TARGET_DATE).eq("shopId", shopId))
        .collect();
    });
    expect(shopRows).toHaveLength(1);

    const serviceRows = await t.run(async (ctx) => {
      return await ctx.db
        .query("analyticsDailyServiceSnapshots")
        .withIndex("by_date", (q) => q.eq("date", TARGET_DATE))
        .collect();
    });
    expect(serviceRows).toHaveLength(1);
    expect(serviceRows[0]).toMatchObject({ shopCount: 1, staffCount: 1 });
  });

  it("ページサイズを超える件数でも全件集計する（acc引き継ぎ）", async () => {
    const t = setup();
    const total = ANALYTICS_AGGREGATION_PAGE_SIZE + 1;
    await t.run(async (ctx) => {
      const shopId = await seedShop(ctx);
      for (let i = 0; i < total; i++) {
        await insertStaff(ctx, shopId, { email: `staff${i}@example.com` });
      }
    });

    await runDailyAggregation(t, TARGET_DATE);

    expect(await getEventCount(t, TARGET_DATE, ANALYTICS_METRICS.staffCreated)).toMatchObject({ count: total });
  });

  it("確定イベントのリードタイムと提出率の分子分母を集計する", async () => {
    const t = setup();
    const createdAtMs = startMs - 3 * 24 * 60 * 60 * 1000; // 3日前に作成
    const confirmedAtMs = startMs + 10 * 60 * 60 * 1000; // 対象日 10:00 JST に確定

    // _creationTime はトランザクション開始時刻で採番されるため、挿入前にシステム時刻を移動する
    vi.setSystemTime(new Date(createdAtMs));
    const { shopId, confirmedId } = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx);
      const recruitmentBase = {
        shopId,
        periodStart: "2026-07-10",
        periodEnd: "2026-07-16",
        deadline: "2026-07-07",
        shopClosedDates: [] as string[],
        submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
        isDeleted: false,
      };
      const confirmedId = await ctx.db.insert("recruitments", {
        ...recruitmentBase,
        status: "confirmed",
        confirmedAt: confirmedAtMs,
      });
      // 窓の外（前日）に確定した募集は対象外
      await ctx.db.insert("recruitments", {
        ...recruitmentBase,
        status: "confirmed",
        confirmedAt: startMs - 1,
      });
      return { shopId, confirmedId };
    });

    vi.setSystemTime(new Date(startMs + 12 * 60 * 60 * 1000));
    const creationTime = await t.run(async (ctx) => {
      await ctx.db.insert("recruitmentStats", {
        recruitmentId: confirmedId,
        shopId,
        submittedCount: 3,
        activeStaffCountSnapshot: 5,
        updatedAt: Date.now(),
      });
      const confirmed = await ctx.db.get(confirmedId);
      return confirmed?._creationTime ?? 0;
    });

    await runDailyAggregation(t, TARGET_DATE);

    expect(await getEventCount(t, TARGET_DATE, ANALYTICS_METRICS.recruitmentConfirmed)).toMatchObject({
      count: 1,
      valueSum: confirmedAtMs - creationTime,
    });
    expect(await getEventCount(t, TARGET_DATE, ANALYTICS_METRICS.recruitmentConfirmedSubmittedTotal)).toMatchObject({
      count: 1,
      valueSum: 3,
    });
    expect(await getEventCount(t, TARGET_DATE, ANALYTICS_METRICS.recruitmentConfirmedExpectedStaffTotal)).toMatchObject(
      { count: 1, valueSum: 5 },
    );
  });

  it("LINE連携・参加申請の承認/却下イベントを集計する", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const shopId = await seedShop(ctx);
      const staffId = await insertStaff(ctx, shopId);
      const inDay = startMs + 9 * 60 * 60 * 1000;
      await ctx.db.insert("staffLineAccounts", {
        staffId,
        shopId,
        lineUserId: "U1",
        linkedAt: inDay,
        following: true,
        isDeleted: false,
      });
      await insertRegistrationRequest(ctx, shopId, {
        status: "approved",
        createdAt: startMs - 1000,
        reviewedAt: inDay,
      });
      await insertRegistrationRequest(ctx, shopId, {
        status: "rejected",
        createdAt: startMs - 1000,
        reviewedAt: inDay,
      });
      // 窓の外のレビューは対象外
      await insertRegistrationRequest(ctx, shopId, {
        status: "approved",
        createdAt: startMs - 1000,
        reviewedAt: startMs - 1,
      });
    });

    await runDailyAggregation(t, TARGET_DATE);

    expect(await getEventCount(t, TARGET_DATE, ANALYTICS_METRICS.lineLinked)).toMatchObject({ count: 1 });
    expect(await getEventCount(t, TARGET_DATE, ANALYTICS_METRICS.registrationApproved)).toMatchObject({ count: 1 });
    expect(await getEventCount(t, TARGET_DATE, ANALYTICS_METRICS.registrationRejected)).toMatchObject({ count: 1 });
  });
});
