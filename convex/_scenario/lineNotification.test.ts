import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import {
  countScheduledJobs,
  MANAGER_SUBJECT,
  readScheduledFunctions,
  SCENARIO_NOW,
  type ScenarioTest,
  scenarioDate,
  seedStaff,
} from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

async function completeNextFanout(t: ScenarioTest, following: boolean) {
  const candidates = await t.run(async (ctx) =>
    ctx.db
      .query("lineFriendshipFanoutJobs")
      .withIndex("by_status_and_nextRunAt", (q) => q.eq("status", "queued"))
      .take(5),
  );
  const job = candidates
    .filter((candidate) => candidate.following === following)
    .sort((left, right) => right.stateVersion - left.stateVersion)[0];
  if (!job) throw new Error("friendship fanout job was not found");

  await t.mutation(internal.line.mutations.kickFriendshipFanoutJob, { jobId: job._id });
  const claimed = await t.run(async (ctx) => ctx.db.get(job._id));
  if (claimed?.status !== "processing" || !claimed.leaseId) {
    throw new Error("friendship fanout job was not claimed");
  }
  await expect(
    t.mutation(internal.line.mutations.processFriendshipFanoutJob, {
      jobId: job._id,
      leaseId: claimed.leaseId,
      expectedVersion: claimed.version,
    }),
  ).resolves.toEqual({ status: "completed" });
}

describe("LINE通知連携シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("LINE連携からfollow/unfollow復帰まで、一覧表示と通知対象データに反映される", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const line = scenario.line();

    // Arrange: 募集中シフトがある店舗にLINE未連携スタッフを用意する。
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
    await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });

    // Act: シフト担当者がLINE連携トークンを発行し、スタッフが連携を完了する。
    const link = await asManager.generateLineLinkToken(staffId);
    expect(link.token).toBeTypeOf("string");
    const validation = await line.validateLinkToken(link.token);
    expect(validation.status).toBe("ok");
    if (validation.status !== "ok") throw new Error("LINE token validation failed");

    await line.finalizeLinking({
      staffId,
      tokenDocId: validation.tokenDocId,
      lineUserId: "U_line_scenario",
      lineFollowing: true,
    });
    await completeNextFanout(t, true);

    // Assert: 一覧、通知対象データ、連携後通知予約にLINE連携状態が反映される。
    const staffPage = await asManager.getDashboardStaffs();
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
    expect(countScheduledJobs(scheduledAfterLink, "legal/actions:sendStaffConsentLine", { staffId })).toBe(1);
    expect(
      countScheduledJobs(scheduledAfterLink, "notification/actions:sendOpenRecruitmentNotificationLinesForStaff", {
        staffId,
      }),
    ).toBe(1);

    // Act: LINE webhookでunfollowを受け取る。
    await line.dispatchWebhookEvents([
      {
        type: "unfollow",
        userId: "U_line_scenario",
        webhookEventId: "line-scenario-unfollow",
        timestamp: Date.now(),
      },
    ]);
    await completeNextFanout(t, false);

    // Assert: 一覧表示のfollow状態が落ちる。
    const staffPageAfterUnfollow = await asManager.getDashboardStaffs();
    expect(staffPageAfterUnfollow.page.find((staff) => staff._id === staffId)).toMatchObject({
      isLineLinked: true,
      isLineFollowing: false,
    });

    // Act: 同じLINEユーザーが再followする。
    await line.dispatchWebhookEvents([
      {
        type: "follow",
        userId: "U_line_scenario",
        webhookEventId: "line-scenario-refollow",
        timestamp: Date.now() + 1,
      },
    ]);
    await completeNextFanout(t, true);

    // Assert: follow状態が復帰し、募集中通知が再度予約される。
    const staffPageAfterRefollow = await asManager.getDashboardStaffs();
    expect(staffPageAfterRefollow.page.find((staff) => staff._id === staffId)).toMatchObject({
      isLineLinked: true,
      isLineFollowing: true,
    });

    const scheduledAfterRefollow = await readScheduledFunctions(t);
    expect(countScheduledJobs(scheduledAfterRefollow, "legal/actions:sendStaffConsentLine", { staffId })).toBe(2);
    expect(
      countScheduledJobs(scheduledAfterRefollow, "notification/actions:sendOpenRecruitmentNotificationLinesForStaff", {
        staffId,
      }),
    ).toBe(2);
  });
});
