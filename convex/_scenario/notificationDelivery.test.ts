import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ScenarioTest } from "../_test/scenarioBuilders";
import { MANAGER_SUBJECT, SCENARIO_NOW, scenarioDate, seedStaff } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop, seedStaffLineAccount } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

async function getOutboxJobs(t: ScenarioTest) {
  return await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
}

async function getMagicLinks(t: ScenarioTest) {
  return await t.run(async (ctx) => await ctx.db.query("magicLinks").collect());
}

describe("通知配送outboxシナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("募集作成通知actionはスタッフごとのemail/LINE outboxと提出リンクを作る", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "notification-manager@example.com",
        shopName: "通知シナリオ店舗",
      });
      const emailStaffId = await seedStaff(ctx, {
        shopId,
        name: "メールスタッフ",
        email: "email-staff@example.com",
      });
      const lineStaffId = await seedStaff(ctx, {
        shopId,
        name: "LINEスタッフ",
        email: "line-staff@example.com",
      });
      await seedStaffLineAccount(ctx, {
        shopId,
        staffId: lineStaffId,
        lineUserId: "U_recruitment_line",
        following: true,
      });
      return { shopId, emailStaffId, lineStaffId };
    });

    const recruitmentId = await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });

    await t.action(internal.notification.actions.sendRecruitmentNotificationEmails, { recruitmentId });

    const [jobs, magicLinks] = await Promise.all([getOutboxJobs(t), getMagicLinks(t)]);
    expect(jobs.map((job) => job.dedupeKey).sort()).toEqual([
      `email:recruitment:${recruitmentId}:${ids.emailStaffId}`,
      `line:recruitment:${recruitmentId}:${ids.lineStaffId}`,
    ]);
    expect(jobs.find((job) => job.staffId === ids.emailStaffId)).toMatchObject({
      channel: "email",
      status: "pending",
      payload: expect.objectContaining({
        kind: "email",
        to: "email-staff@example.com",
        context: "notification.sendRecruitmentNotificationEmails",
      }),
    });
    expect(jobs.find((job) => job.staffId === ids.lineStaffId)).toMatchObject({
      channel: "line",
      status: "pending",
      payload: expect.objectContaining({
        kind: "line",
        toUserId: "U_recruitment_line",
        fallbackEmail: expect.objectContaining({
          dedupeKey: `email:recruitment:${recruitmentId}:${ids.lineStaffId}`,
        }),
      }),
    });
    expect(
      magicLinks
        .filter((link) => link.recruitmentId === recruitmentId && link.accessKind === "submit")
        .map((link) => ({
          staffId: link.staffId,
          shopId: link.shopId,
        })),
    ).toEqual(
      expect.arrayContaining([
        { staffId: ids.emailStaffId, shopId: ids.shopId },
        { staffId: ids.lineStaffId, shopId: ids.shopId },
      ]),
    );
  });

  it("シフト確定通知actionは確定シフト閲覧用outboxとviewリンクを作る", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "confirmation-manager@example.com",
        shopName: "確定通知店舗",
      });
      const emailStaffId = await seedStaff(ctx, {
        shopId,
        name: "確定メールスタッフ",
        email: "confirmation-email@example.com",
      });
      const lineStaffId = await seedStaff(ctx, {
        shopId,
        name: "確定LINEスタッフ",
        email: "confirmation-line@example.com",
      });
      await seedStaffLineAccount(ctx, {
        shopId,
        staffId: lineStaffId,
        lineUserId: "U_confirmation_line",
        following: true,
      });
      return { emailStaffId, lineStaffId };
    });
    const recruitmentId = await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(9),
      deadline: scenarioDate(3),
    });
    await asManager.saveShiftAssignments({
      recruitmentId,
      assignments: [
        { staffId: ids.emailStaffId, date: scenarioDate(7), startTime: "10:00", endTime: "18:00" },
        { staffId: ids.lineStaffId, date: scenarioDate(8), startTime: "12:00", endTime: "20:00" },
      ],
    });
    await asManager.confirmRecruitment(recruitmentId);

    await t.action(internal.notification.actions.sendShiftConfirmationEmails, { recruitmentId, isResend: false });

    const [jobs, magicLinks] = await Promise.all([getOutboxJobs(t), getMagicLinks(t)]);
    expect(jobs.map((job) => job.dedupeKey).sort()).toEqual([
      `email:confirmation:${recruitmentId}:${ids.emailStaffId}:confirm`,
      `line:confirmation:${recruitmentId}:${ids.lineStaffId}:confirm`,
    ]);
    expect(jobs.find((job) => job.staffId === ids.emailStaffId)).toMatchObject({
      channel: "email",
      payload: expect.objectContaining({
        kind: "email",
        to: "confirmation-email@example.com",
        subject: expect.stringContaining("シフト確定のお知らせ"),
        context: "notification.sendConfirmationEmail",
      }),
    });
    expect(jobs.find((job) => job.staffId === ids.lineStaffId)).toMatchObject({
      channel: "line",
      payload: expect.objectContaining({
        kind: "line",
        toUserId: "U_confirmation_line",
        fallbackEmail: expect.objectContaining({
          dedupeKey: `email:confirmation:${recruitmentId}:${ids.lineStaffId}:confirm`,
        }),
      }),
    });
    expect(
      magicLinks
        .filter((link) => link.recruitmentId === recruitmentId && link.accessKind === "view")
        .map((link) => link.staffId),
    ).toEqual(expect.arrayContaining([ids.emailStaffId, ids.lineStaffId]));
  });

  it("スタッフ参加申請の日次digestはpending時だけowner向けoutboxを作る", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "owner-digest@example.com",
        shopName: "参加申請通知店舗",
      });
    });
    const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
    const registrationLink = await asManager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {});
    const request = await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: registrationLink.token,
      name: "申請スタッフ",
      email: "digest-staff@example.com",
      acceptedLegal: true,
    });

    await t.action(internal.staffRegistration.actions.sendOwnerDailyDigest, {});

    const jobsBeforeApproval = await getOutboxJobs(t);
    expect(jobsBeforeApproval).toHaveLength(1);
    expect(jobsBeforeApproval[0]).toMatchObject({
      channel: "email",
      status: "pending",
      dedupeKey: expect.stringMatching(/^email:staffRegistrationDailyDigest:/),
      payload: expect.objectContaining({
        kind: "email",
        to: "owner-digest@example.com",
        context: "staffRegistration.sendOwnerDailyDigest",
      }),
    });

    await asManager.mutation(api.staffRegistration.mutations.approveRequest, {
      requestId: request.requestId as Id<"staffRegistrationRequests">,
    });
    await t.action(internal.staffRegistration.actions.sendOwnerDailyDigest, {});

    const jobsAfterApproval = await getOutboxJobs(t);
    expect(jobsAfterApproval).toEqual(jobsBeforeApproval);
  });
});
