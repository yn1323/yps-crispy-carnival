import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import {
  hasScheduledJob,
  MANAGER_SUBJECT,
  readScheduledFunctions,
  SCENARIO_NOW,
  scenarioDate,
  seedSession,
  seedStaff,
} from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("確定シフト閲覧・再発行シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("確定シフトは既存セッションで閲覧でき、再発行依頼は通知 job と通知データにつながる", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const staff = scenario.staff();

    // Arrange: 確定済みシフトと閲覧セッションを用意する。
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "view-manager@example.com",
        shopName: "閲覧店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "閲覧スタッフ",
        email: "view-staff@example.com",
      });
      const positionId = await ctx.db.insert("positions", {
        shopId,
        name: "シフト",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(9),
        deadline: scenarioDate(3),
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId,
        date: scenarioDate(7),
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      });
      await seedSession(ctx, {
        sessionToken: "scenario-shift-view-session",
        staffId,
        shopId,
        recruitmentId,
        accessKind: "view",
      });
      return { staffId, recruitmentId, positionId };
    });

    // Assert: 確定募集の基本情報とスタッフ閲覧データを取得できる。
    const info = await staff.getRecruitmentInfo(ids.recruitmentId);
    expect(info).toMatchObject({
      shopName: "閲覧店舗",
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(9),
    });

    const view = await staff.getShiftViewData({
      sessionToken: "scenario-shift-view-session",
      recruitmentId: ids.recruitmentId,
    });
    expect(view?.assignments).toEqual([
      {
        staffId: ids.staffId,
        date: scenarioDate(7),
        startTime: "10:00",
        endTime: "18:00",
        positionId: ids.positionId,
      },
    ]);

    // Act: スタッフが確定シフトURLの再発行を依頼する。
    await staff.requestReissue({
      email: "view-staff@example.com",
      recruitmentId: ids.recruitmentId,
    });

    // Assert: 再発行通知jobと通知データが作られる。
    const scheduled = await readScheduledFunctions(t);
    expect(
      hasScheduledJob(scheduled, "notification/actions:sendReissueEmail", {
        staffId: ids.staffId,
        recruitmentId: ids.recruitmentId,
      }),
    ).toBe(true);

    const reissueData = await t.query(internal.notification.queries.getReissueEmailData, {
      staffId: ids.staffId,
      recruitmentId: ids.recruitmentId,
    });
    expect(reissueData).toMatchObject({
      shopName: "閲覧店舗",
      staffName: "閲覧スタッフ",
      staffEmail: "view-staff@example.com",
    });
  });

  it("募集中のシフトでは閲覧データも再発行通知も出さない", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const staff = scenario.staff();

    // Arrange: まだ確定していない募集中シフトとセッションを用意する。
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "open-view-manager@example.com",
        shopName: "募集中店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "募集中スタッフ",
        email: "open-view-staff@example.com",
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(9),
        deadline: scenarioDate(3),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await seedSession(ctx, {
        sessionToken: "scenario-open-view-session",
        staffId,
        shopId,
        recruitmentId,
        accessKind: "view",
      });
      return { recruitmentId };
    });

    // Act / Assert: 募集中シフトは閲覧データを返さない。
    await expect(
      staff.getShiftViewData({
        sessionToken: "scenario-open-view-session",
        recruitmentId: ids.recruitmentId,
      }),
    ).resolves.toBeNull();

    // Act: 募集中シフトに再発行依頼を出す。
    await staff.requestReissue({
      email: "open-view-staff@example.com",
      recruitmentId: ids.recruitmentId,
    });

    // Assert: 再発行通知jobは予約されない。
    const scheduled = await readScheduledFunctions(t);
    expect(scheduled.some((job) => job.name === "notification/actions:sendReissueEmail")).toBe(false);
  });
});
