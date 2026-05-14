import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import {
  hasScheduledJob,
  MANAGER_SUBJECT,
  readScheduledFunctions,
  SCENARIO_NOW,
  scenarioDate,
} from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("スタッフ参加QRシナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("店舗QRから参加申請し、シフト担当者承認後にスタッフ一覧・法務同意・通知予約へ反映される", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    await t.run(async (ctx) => {
      await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "qr-manager@example.com",
        shopName: "QR登録店舗",
      });
    });
    await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });

    const link = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {});
    await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "QR申請スタッフ",
      email: "qr-staff@example.com",
      acceptedLegal: true,
    });

    const pending = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .query(api.staffRegistration.queries.getPendingRequests, {});
    expect(pending).toMatchObject([{ name: "QR申請スタッフ", email: "qr-staff@example.com" }]);

    const { staffId } = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .mutation(api.staffRegistration.mutations.approveRequest, { requestId: pending[0]._id });

    const staffPage = await asManager.getDashboardStaffs();
    expect(staffPage.page.find((staff) => staff._id === staffId)).toMatchObject({
      name: "QR申請スタッフ",
      email: "qr-staff@example.com",
    });

    const consentState = await t.run(async (ctx) =>
      ctx.db
        .query("legalConsentStates")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .first(),
    );
    expect(consentState).toMatchObject({ method: "staff_registration" });

    const scheduled = await readScheduledFunctions(t);
    expect(hasScheduledJob(scheduled, "legal/actions:sendStaffConsentEmail", { staffId })).toBe(true);
    expect(hasScheduledJob(scheduled, "line/actions:sendInviteEmail", { staffId })).toBe(true);
    expect(
      hasScheduledJob(scheduled, "notification/actions:sendOpenRecruitmentNotificationEmailsForStaff", { staffId }),
    ).toBe(true);
  });
});
