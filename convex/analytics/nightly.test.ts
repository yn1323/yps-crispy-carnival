import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { jstDayRangeMs } from "../_lib/dateFormat";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
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
    const run = await t.run(async (ctx) => getDailyResult(ctx, "2026-09-05"));
    if (!run) throw new Error("run missing");
    const args = { runId: run._id, stepVersion: run.stepVersion };
    await t.mutation(aggregateAnalyticsPageRef, args);
    const first = await t.run(async (ctx) => ctx.db.get(run._id));
    expect(first).toMatchObject({ status: "running", stepVersion: 1, counts: { day: { registered: 20 } } });
    await t.mutation(aggregateAnalyticsPageRef, args);
    expect(await t.run(async (ctx) => ctx.db.get(run._id))).toEqual(first);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const completed = await t.run(async (ctx) => ctx.db.get(run._id));
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
