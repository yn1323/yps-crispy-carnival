import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dateJST } from "../_lib/dateFormat";
import { MANAGER_SUBJECT, SCENARIO_NOW, scenarioDate, seedSession, seedStaff } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { scheduleDailyAnalyticsRef } from "../analytics/refs";
import { getOverviewRef, getShopsRef, getStaffRef } from "../analyticsDashboard/refs";
import { DAY_MS } from "../constants";

const startAt = SCENARIO_NOW + 13 * 60 * 60 * 1000;

describe("Analyticsの日次利用と問い合わせシナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(startAt);
    vi.stubEnv("ANALYTICS_NIGHTLY_CRON_ENABLED", "false");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("既存店舗を集計前から閲覧でき、業務の提出・確定が翌朝の日別数値と内訳に反映される", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const manager = scenario.manager(MANAGER_SUBJECT);
    const staff = scenario.staff();
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "analytics-manager@example.com",
        shopName: "既存の利用店舗",
      });
      const staffId = await seedStaff(ctx, { shopId, name: "提出スタッフ", email: "analytics-staff@example.com" });
      return { shopId, staffId };
    });

    const before = await t.query(getOverviewRef, { rangeDays: 7, asOf: startAt });
    expect(before.startedAt).toBeNull();
    const shops = await t.query(getShopsRef, {
      cursor: null,
      limit: 50,
      search: "",
      date: null,
      metric: null,
      asOf: startAt,
    });
    expect(shops.rows.map((row) => row.shopId)).toEqual([ids.shopId]);
    const detail = await t.query(getStaffRef, { ...ids, cursor: null, limit: 20, asOf: startAt });
    expect(detail?.staff).toMatchObject({ name: "提出スタッフ", email: "analytics-staff@example.com" });

    const recruitmentId = await manager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(9),
      deadline: scenarioDate(3),
    });
    await t.run(async (ctx) => {
      await seedSession(ctx, { ...ids, recruitmentId, sessionToken: "analytics-submission-session" });
    });
    for (const endTime of ["17:00", "18:00"]) {
      await staff.submitShiftRequests({
        recruitmentId,
        sessionToken: "analytics-submission-session",
        acceptedLegal: true,
        submission: { kind: "time", requests: [{ date: scenarioDate(7), startTime: "10:00", endTime }] },
      });
    }
    await manager.saveShiftAssignments({
      recruitmentId,
      assignments: [{ staffId: ids.staffId, date: scenarioDate(7), startTime: "10:00", endTime: "17:00" }],
    });
    await manager.confirmRecruitment(recruitmentId);

    // 通知は別scenarioの担当。ここでは日次集計の予約だけを実行する。
    await t.run(async (ctx) => {
      const scheduled = await ctx.db.system.query("_scheduled_functions").collect();
      for (const job of scheduled) {
        if (job.state.kind === "pending" && !job.name.startsWith("analytics/")) await ctx.scheduler.cancel(job._id);
      }
    });
    const nextMorning = SCENARIO_NOW + DAY_MS + 3 * 60 * 60 * 1000;
    vi.setSystemTime(nextMorning);
    await t.mutation(scheduleDailyAnalyticsRef, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const overview = await t.query(getOverviewRef, { rangeDays: 7, asOf: nextMorning });
    expect(overview.yesterday).toMatchObject({
      date: dateJST(startAt),
      status: "partial",
      counts: { registered: 0, submitted: 1, confirmed: 1 },
    });
    expect(overview.period).toMatchObject({ status: "partial", counts: { registered: 0, submitted: 1, confirmed: 1 } });
    const submittedShops = await t.query(getShopsRef, {
      cursor: null,
      limit: 50,
      search: "",
      date: dateJST(startAt),
      metric: "submitted",
      asOf: nextMorning,
    });
    expect(submittedShops.rows.map((row) => row.shopId)).toEqual([ids.shopId]);
    const after = await t.query(getStaffRef, { ...ids, cursor: null, limit: 20, asOf: nextMorning });
    expect(after?.submissions).toEqual([
      expect.objectContaining({ recruitmentId, submittedAt: startAt, status: "confirmed" }),
    ]);
  });
});
