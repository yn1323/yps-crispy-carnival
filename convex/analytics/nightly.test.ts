import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { jstDayRangeMs } from "../_lib/dateFormat";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getOverviewRef } from "../analyticsDashboard/refs";
import { DAY_MS } from "../constants";
import { emptyAnalyticsResultCounts } from "./model";
import { ensureAnalyticsState, recordAnalyticsUsage } from "./record";
import {
  aggregateAnalyticsPageRef,
  failAnalyticsPageRef,
  retryAnalyticsRunRef,
  scheduleAnalyticsMaintenanceRef,
  scheduleDailyAnalyticsRef,
} from "./refs";
import { getDailyResult, startDailyRun } from "./runs";

async function seedRecruitment(ctx: MutationCtx, shopId: Id<"shops">) {
  return await ctx.db.insert("recruitments", {
    shopId,
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    deadline: "2026-09-25",
    shopClosedDates: [],
    status: "open",
    isDeleted: false,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  });
}

const START = Date.parse("2026-09-05T05:00:00Z");
const MORNING = Date.parse("2026-09-05T18:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Analyticsの自動開始と日次集計", () => {
  it("初回cronを開始点にし、その前日を0として作らない", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("ANALYTICS_NIGHTLY_CRON_ENABLED", "false");
    vi.setSystemTime(MORNING);
    await t.mutation(scheduleDailyAnalyticsRef, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const initial = await t.run(async (ctx) => ({
      state: await ctx.db.query("analyticsState").unique(),
      runs: await ctx.db.query("analyticsDailyResults").collect(),
    }));
    expect(initial.state).toMatchObject({ startedAt: MORNING });
    expect(initial.runs).toEqual([]);

    vi.setSystemTime(MORNING + 86_400_000);
    await t.mutation(scheduleDailyAnalyticsRef, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await t.run(async (ctx) => ctx.db.query("analyticsDailyResults").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: "2026-09-06",
      status: "complete",
      isPartialDay: true,
      observationStartAt: MORNING,
      observationEndAt: jstDayRangeMs("2026-09-06").endMs,
      counts: emptyAnalyticsResultCounts(),
    });
  });

  it("同日の再提出を重複させず、既存店舗の操作で開始し、日付を跨いだ提出は別日に残す", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId } = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx);
      const recruitmentId = await seedRecruitment(ctx, shopId);
      return { shopId, recruitmentId };
    });
    await t.run(async (ctx) => {
      await recordAnalyticsUsage(ctx, { shopId, recruitmentId, metric: "submitted" });
      await recordAnalyticsUsage(ctx, { shopId, recruitmentId, metric: "submitted" });
    });
    vi.setSystemTime(jstDayRangeMs("2026-09-06").startMs);
    await t.run(async (ctx) => recordAnalyticsUsage(ctx, { shopId, recruitmentId, metric: "submitted" }));
    const facts = await t.run(async (ctx) => ({
      days: await ctx.db
        .query("analyticsShopDays")
        .withIndex("by_shopId_and_date", (q) => q.eq("shopId", shopId))
        .collect(),
      cycles: await ctx.db.query("analyticsCycleEvidence").collect(),
    }));
    expect(
      facts.days.map(({ date, registered, submitted, confirmed }) => ({ date, registered, submitted, confirmed })),
    ).toEqual([
      { date: "2026-09-05", registered: false, submitted: true, confirmed: false },
      { date: "2026-09-06", registered: false, submitted: true, confirmed: false },
    ]);
    expect(facts.cycles).toHaveLength(1);
    expect(facts.cycles[0]).toMatchObject({
      firstSubmittedAt: START,
      lastSubmittedAt: jstDayRangeMs("2026-09-06").startMs,
    });
  });

  it("日次と7/30/90日の店舗重複を別々に除き、後日の店舗削除で減らさない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopA = await seedShop(ctx, "A");
      const shopB = await seedShop(ctx, "B");
      const shopC = await seedShop(ctx, "C");
      const recruitmentA = await seedRecruitment(ctx, shopA);
      const recruitmentB = await seedRecruitment(ctx, shopB);
      await recordAnalyticsUsage(ctx, { shopId: shopA, metric: "registered" });
      await recordAnalyticsUsage(ctx, { shopId: shopB, metric: "registered" });
      await recordAnalyticsUsage(ctx, { shopId: shopA, recruitmentId: recruitmentA, metric: "submitted" });
      await recordAnalyticsUsage(ctx, { shopId: shopB, recruitmentId: recruitmentB, metric: "submitted" });
      return { shopA, shopB, shopC, recruitmentA };
    });
    vi.setSystemTime(jstDayRangeMs("2026-09-12").startMs);
    await t.run(async (ctx) => {
      await recordAnalyticsUsage(ctx, { shopId: ids.shopC, metric: "registered" });
      await recordAnalyticsUsage(ctx, { shopId: ids.shopA, recruitmentId: ids.recruitmentA, metric: "submitted" });
      await recordAnalyticsUsage(ctx, {
        shopId: ids.shopA,
        recruitmentId: ids.recruitmentA,
        metric: "confirmed",
        confirmedPeriodStartAt: jstDayRangeMs("2026-10-01").startMs,
      });
      await ctx.db.patch(ids.shopB, { isDeleted: true });
    });
    vi.setSystemTime(jstDayRangeMs("2026-09-13").startMs + 10_800_000);
    await t.mutation(scheduleDailyAnalyticsRef, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const result = await t.run(async (ctx) => getDailyResult(ctx, "2026-09-12"));
    expect(result).toMatchObject({
      status: "complete",
      counts: {
        day: { registered: 1, submitted: 1, confirmed: 1 },
        days7: { registered: 1, submitted: 1, confirmed: 1 },
        days30: { registered: 3, submitted: 2, confirmed: 1 },
        days90: { registered: 3, submitted: 2, confirmed: 1 },
      },
    });
  });

  it("複数ページの進捗を永続化し、同じstepの再配送では加算しない", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 22; i++) {
        const shopId = await seedShop(ctx, `店舗${i}`);
        await recordAnalyticsUsage(ctx, { shopId, metric: "registered" });
      }
    });
    vi.setSystemTime(MORNING);
    await t.mutation(scheduleDailyAnalyticsRef, {});
    let run = await t.run(async (ctx) => getDailyResult(ctx, "2026-09-05"));
    // 前日分のrunは、2名以上・通知ありの組織・店舗を数え終えてから利用実績を集計する。
    while (run?.engagement && run.engagement.stage !== "complete") {
      await t.mutation(aggregateAnalyticsPageRef, { runId: run._id, stepVersion: run.stepVersion });
      run = await t.run(async (ctx) => getDailyResult(ctx, "2026-09-05"));
    }
    if (!run) throw new Error("run missing");
    const runId = run._id;
    const args = { runId, stepVersion: run.stepVersion };
    await t.mutation(aggregateAnalyticsPageRef, args);
    const first = await t.run(async (ctx) => ctx.db.get(runId));
    expect(first).toMatchObject({
      status: "running",
      stepVersion: run.stepVersion + 1,
      counts: { day: { registered: 20 } },
    });
    await t.mutation(aggregateAnalyticsPageRef, args);
    expect(await t.run(async (ctx) => ctx.db.get(runId))).toEqual(first);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const completed = await t.run(async (ctx) => ctx.db.get(runId));
    expect(completed).toMatchObject({
      status: "complete",
      counts: { day: { registered: 22 } },
    });
    expect(completed?.cursorShopId).toBeUndefined();
  });

  it("失敗ページを再開し、古い失敗通知で新しい結果を上書きしない", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const shopId = await seedShop(ctx);
      await recordAnalyticsUsage(ctx, { shopId, metric: "registered" });
    });
    vi.setSystemTime(MORNING);
    await t.mutation(scheduleDailyAnalyticsRef, {});
    const run = await t.run(async (ctx) => getDailyResult(ctx, "2026-09-05"));
    if (!run) throw new Error("run missing");
    await t.mutation(failAnalyticsPageRef, { runId: run._id, stepVersion: 0, errorCode: "private@example.com" });
    const failed = await t.run(async (ctx) => ctx.db.get(run._id));
    expect(failed).toMatchObject({
      status: "failed",
      retryAt: MORNING + 60_000,
      retryAttempt: 1,
      errorCode: "analytics_unexpected",
    });
    await t.mutation(retryAnalyticsRunRef, { runId: run._id, stepVersion: 1 });
    expect(await t.run(async (ctx) => ctx.db.get(run._id))).toEqual(failed);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const completed = await t.run(async (ctx) => ctx.db.get(run._id));
    expect(completed).toMatchObject({ status: "complete", attemptCount: 2, counts: { day: { registered: 1 } } });
    await t.mutation(failAnalyticsPageRef, { runId: run._id, stepVersion: 0, errorCode: "analytics_run_stale" });
    expect(await t.run(async (ctx) => ctx.db.get(run._id))).toEqual(completed);
  });

  it("前日分の集計で、日の終わり時点に直近14日に通知を受け付けた組織と店舗を2名以上・6名以上に分けて数え、過去の日には記録しない", async () => {
    const t = convexTest(schema, modules);
    const dayEnd = jstDayRangeMs("2026-09-25").endMs;
    const ids = await t.run(async (ctx) => {
      await ensureAnalyticsState(ctx);
      const seedTeam = async (name: string, staffCount: number) => {
        const shopId = await seedShop(ctx, name);
        for (let index = 0; index < staffCount; index += 1) await seedStaff(ctx, { shopId, name: `${name}${index}` });
        return shopId;
      };
      const ids = {
        engaged: await seedTeam("通知あり2名", 2),
        large: await seedTeam("通知あり6名", 6),
        oldNotice: await seedTeam("15日前の通知", 2),
        alone: await seedTeam("通知あり1名", 1),
        cancelled: await seedTeam("取消した通知", 2),
        afterDayEnd: await seedTeam("翌日の通知", 2),
      };
      // 1回に確認する上限を超える組織・店舗を置き、続きのpageでも数える。
      for (let index = 0; index < 100; index += 1) await seedShop(ctx, `通知なし${index}`);
      return ids;
    });
    const notify = async (shopId: Id<"shops">, status: Doc<"notificationOutbox">["status"], at: number) => {
      vi.setSystemTime(at);
      await t.run(async (ctx) => {
        const shop = await ctx.db.get(shopId);
        if (!shop) throw new Error("missing fixture shop");
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status,
          dedupeKey: `email:analytics-engaged:${shopId}:${at}`,
          shopId,
          organizationId: shop.organizationId,
          purpose: "business",
          notificationContext: "notification.sendRecruitmentNotificationEmails",
          deliverySuppressed: false,
          payload: {
            kind: "email",
            from: "シフトリ <noreply@example.com>",
            to: "staff@example.com",
            subject: "シフト募集のお知らせ",
            html: "<p>募集</p>",
            context: "notification.sendRecruitmentNotificationEmails",
          },
          attemptCount: 1,
          nextRunAt: at,
          createdAt: at,
          updatedAt: at,
        });
      });
    };
    await notify(ids.oldNotice, "sent", dayEnd - 15 * DAY_MS);
    await notify(ids.engaged, "sent", dayEnd - 3 * DAY_MS);
    await notify(ids.large, "failed", dayEnd - 3 * DAY_MS);
    await notify(ids.alone, "sent", dayEnd - 3 * DAY_MS);
    await notify(ids.cancelled, "cancelled", dayEnd - 2 * DAY_MS);
    await notify(ids.afterDayEnd, "sent", dayEnd + 60 * 60 * 1000);

    const morning = dayEnd + 3 * 60 * 60 * 1000;
    vi.setSystemTime(morning);
    await t.mutation(scheduleDailyAnalyticsRef, {});
    const run = await t.run(async (ctx) => getDailyResult(ctx, "2026-09-25"));
    if (!run) throw new Error("run missing");
    await t.mutation(aggregateAnalyticsPageRef, { runId: run._id, stepVersion: run.stepVersion });
    expect((await t.run(async (ctx) => ctx.db.get(run._id)))?.engagement).toEqual({
      stage: "organizations",
      counts: { min2: { organizations: 2, shops: 0 }, min6: { organizations: 1, shops: 0 } },
      cursorCreationTime: expect.any(Number),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const result = await t.run(async (ctx) => getDailyResult(ctx, "2026-09-25"));
    const engaged = { min2: { organizations: 2, shops: 2 }, min6: { organizations: 1, shops: 1 } };
    expect(result).toMatchObject({ status: "complete", engagement: { stage: "complete", counts: engaged } });
    const overview = await t.query(getOverviewRef, { rangeDays: 30, asOf: morning });
    expect(overview.yesterday).toMatchObject({ date: "2026-09-25", engaged });
    expect(overview.series.find((day) => day.date === "2026-09-24")).toMatchObject({
      status: "complete",
      engaged: null,
    });
  });

  it("保持期限に達したrunを終端化してから入力を削除し、集計結果は残す", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const shopId = await seedShop(ctx);
      await recordAnalyticsUsage(ctx, { shopId, metric: "registered" });
    });
    vi.setSystemTime(MORNING);
    await t.run(async (ctx) => startDailyRun(ctx, await ensureAnalyticsState(ctx), "2026-09-05"));
    vi.setSystemTime(jstDayRangeMs("2028-11-06").startMs);
    await t.mutation(scheduleAnalyticsMaintenanceRef, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const state = await t.run(async (ctx) => ({
      result: await getDailyResult(ctx, "2026-09-05"),
      facts: await ctx.db.query("analyticsShopDays").collect(),
    }));
    expect(state.result).toMatchObject({
      status: "failed",
      retryable: false,
      errorCode: "analytics_retention_expired",
    });
    expect(state.facts).toEqual([]);
  });
});
