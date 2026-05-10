import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { MANAGER_SUBJECT, SCENARIO_NOW, scenarioDate, seedSession, seedStaff } from "../_test/scenarioBuilders";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("法務同意シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("スタッフ同意リンクは page data から同意済み状態へ遷移し、同意済み通知対象から外れる", async () => {
    const t = convexTest(schema, modules);
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

    const pageBeforeAccept = await t.query(api.legal.queries.getStaffConsentPageData, { token });
    expect(pageBeforeAccept).toMatchObject({
      status: "ok",
      staffName: "同意スタッフ",
      shopName: "法務店舗",
    });

    await expect(
      t.mutation(api.legal.mutations.acceptStaffLegalConsent, { token, acceptedLegal: true }),
    ).resolves.toEqual({ status: "ok" });

    const pageAfterAccept = await t.query(api.legal.queries.getStaffConsentPageData, { token });
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
        status: "open",
        isDeleted: false,
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
      });
      await seedSession(ctx, {
        sessionToken: "scenario-submit-legal-session",
        staffId,
        shopId,
        recruitmentId,
      });
      return { staffId, recruitmentId };
    });

    await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
      sessionToken: "scenario-submit-legal-session",
      recruitmentId: ids.recruitmentId,
      acceptedLegal: true,
      requests: [{ date: scenarioDate(7), startTime: "10:00", endTime: "18:00" }],
    });

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
});
