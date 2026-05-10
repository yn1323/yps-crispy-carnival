import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import {
  countScheduledJobs,
  firstPage,
  hasScheduledJob,
  MANAGER_SUBJECT,
  readScheduledFunctions,
  SCENARIO_NOW,
  scenarioDate,
  seedStaff,
} from "../_test/scenarioBuilders";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("LINE通知連携シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("LINE連携からfollow/unfollow復帰まで、一覧表示と通知対象データに反映される", async () => {
    const t = convexTest(schema, modules);
    const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
    const { staffId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "line-manager@example.com",
        shopName: "LINE店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "LINEスタッフ",
        email: "line-staff@example.com",
      });
      return { staffId };
    });
    await asManager.mutation(api.recruitment.mutations.createRecruitment, {
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });

    const link = await asManager.mutation(api.line.mutations.generateLinkToken, {
      staffId,
    });
    expect(link.token).toBeTypeOf("string");
    const validation = await t.mutation(internal.line.mutations.validateLinkToken, { state: link.token });
    expect(validation.status).toBe("ok");
    if (validation.status !== "ok") throw new Error("LINE token validation failed");

    await t.mutation(internal.line.mutations.finalizeLinking, {
      staffId,
      tokenDocId: validation.tokenDocId,
      lineUserId: "U_line_scenario",
      lineFollowing: true,
    });

    const staffPage = await asManager.query(api.dashboard.queries.getDashboardStaffs, firstPage());
    expect(staffPage.page.find((staff) => staff._id === staffId)).toMatchObject({
      isLineLinked: true,
      isLineFollowing: true,
    });
    const openRecruitmentData = await t.query(
      internal.notification.queries.getOpenRecruitmentNotificationDataForStaff,
      {
        staffId,
      },
    );
    expect(openRecruitmentData?.staff).toMatchObject({
      staffId,
      lineUserId: "U_line_scenario",
      lineFollowing: true,
    });

    const scheduledAfterLink = await readScheduledFunctions(t);
    expect(hasScheduledJob(scheduledAfterLink, "legal/actions:sendStaffConsentLine", { staffId })).toBe(true);
    expect(
      hasScheduledJob(scheduledAfterLink, "notification/actions:sendOpenRecruitmentNotificationLinesForStaff", {
        staffId,
      }),
    ).toBe(true);

    await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
      events: [{ type: "unfollow", userId: "U_line_scenario" }],
    });
    const staffPageAfterUnfollow = await asManager.query(api.dashboard.queries.getDashboardStaffs, firstPage());
    expect(staffPageAfterUnfollow.page.find((staff) => staff._id === staffId)).toMatchObject({
      isLineLinked: true,
      isLineFollowing: false,
    });

    await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
      events: [{ type: "follow", userId: "U_line_scenario" }],
    });
    const staffPageAfterRefollow = await asManager.query(api.dashboard.queries.getDashboardStaffs, firstPage());
    expect(staffPageAfterRefollow.page.find((staff) => staff._id === staffId)).toMatchObject({
      isLineLinked: true,
      isLineFollowing: true,
    });

    const scheduledAfterRefollow = await readScheduledFunctions(t);
    expect(
      countScheduledJobs(scheduledAfterRefollow, "notification/actions:sendOpenRecruitmentNotificationLinesForStaff", {
        staffId,
      }),
    ).toBe(2);
  });
});
