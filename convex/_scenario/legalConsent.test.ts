import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { MANAGER_SUBJECT, SCENARIO_NOW, scenarioDate, seedSession, seedStaff } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getLegalConsentVersions } from "../legal/documents";

describe("法務同意シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("スタッフ同意リンクは page data から同意済み状態へ遷移し、同意済み通知対象から外れる", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const staff = scenario.staff();

    // Arrange: 法務同意が必要なスタッフと同意リンクを用意する。
    const { staffId, shopId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "legal-manager@example.com",
        shopName: "法務店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "同意スタッフ",
        email: "legal-staff@example.com",
      });
      return { staffId, shopId };
    });
    const { token } = await t.mutation(internal.legal.mutations.createStaffConsentToken, { staffId, shopId });

    // Assert: 同意前のページデータが表示できる。
    const pageBeforeAccept = await staff.getStaffConsentPageData(token);
    expect(pageBeforeAccept).toMatchObject({
      status: "ok",
      staffName: "同意スタッフ",
      shopName: "法務店舗",
    });

    // Act: スタッフが同意リンクから同意する。
    await expect(staff.acceptStaffLegalConsent({ token, acceptedLegal: true })).resolves.toEqual({ status: "ok" });

    // Assert: 同意後は通知対象から外れる。
    const pageAfterAccept = await staff.getStaffConsentPageData(token);
    expect(pageAfterAccept).toMatchObject({
      status: "accepted",
      staffName: "同意スタッフ",
      shopName: "法務店舗",
    });
    const notificationData = await t.query(internal.legal.queries.getStaffConsentNotificationDataInternal, {
      staffId,
    });
    expect(notificationData).toBeNull();
  });

  it("未同意スタッフはシフト提出時の同意で state/event が記録される", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const staff = scenario.staff();

    // Arrange: 未同意スタッフが提出できる募集中シフトとセッションを用意する。
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "submit-legal-manager@example.com",
        shopName: "提出同意店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "提出時同意スタッフ",
        email: "submit-legal@example.com",
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
        sessionToken: "scenario-submit-legal-session",
        staffId,
        shopId,
        recruitmentId,
      });
      return { staffId, recruitmentId };
    });

    // Act: スタッフが提出時に法務同意する。
    await staff.submitShiftRequests({
      sessionToken: "scenario-submit-legal-session",
      recruitmentId: ids.recruitmentId,
      acceptedLegal: true,
      requests: [{ date: scenarioDate(7), startTime: "10:00", endTime: "18:00" }],
    });

    // Assert: 同意 state と event が提出由来として記録される。
    const legalState = await t.run(async (ctx) =>
      ctx.db
        .query("legalConsentStates")
        .withIndex("by_staffId", (q) => q.eq("staffId", ids.staffId))
        .first(),
    );
    const legalEvents = await t.run(async (ctx) =>
      ctx.db
        .query("legalConsentEvents")
        .withIndex("by_staffId", (q) => q.eq("staffId", ids.staffId))
        .collect(),
    );
    expect(legalState).toMatchObject({ subjectType: "staff", method: "shift_submit" });
    expect(legalEvents).toHaveLength(1);
    expect(legalEvents).toMatchObject([{ subjectType: "staff", method: "shift_submit" }]);
    expect(legalEvents[0].sourceRecruitmentId).toBe(ids.recruitmentId);
  });

  it("既存の manager staff は manager 同意済みなら提出時のスタッフ向け同意欄を出さない", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const staff = scenario.staff();

    const ids = await t.run(async (ctx) => {
      const { shopId, userId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "existing-manager@example.com",
        shopName: "既存manager店舗",
      });
      const managerVersions = getLegalConsentVersions("manager");
      await ctx.db.insert("legalConsentStates", {
        subjectType: "user",
        userId,
        shopId,
        ...managerVersions,
        consentedAt: Date.now() - 1000,
        method: "manager_setup",
      });
      const managerStaffId = await seedStaff(ctx, {
        shopId,
        userId,
        name: "既存manager",
        email: "existing-manager@example.com",
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(9),
        deadline: scenarioDate(3),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "dateOnly" },
      });
      await seedSession(ctx, {
        sessionToken: "existing-manager-staff-submit-session",
        staffId: managerStaffId,
        shopId,
        recruitmentId,
      });
      return { recruitmentId };
    });

    const pageData = await staff.getOkSubmissionPageData({
      sessionToken: "existing-manager-staff-submit-session",
      recruitmentId: ids.recruitmentId,
    });

    expect(pageData.legalConsentRequired).toBe(false);
  });
});
