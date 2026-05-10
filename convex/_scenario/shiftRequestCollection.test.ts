import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import {
  firstPage,
  MANAGER_SUBJECT,
  readScheduledFunctions,
  SCENARIO_NOW,
  scenarioDate,
  seedSession,
  seedStaff,
} from "../_test/scenarioBuilders";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("シフト希望回収シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("募集作成から提出リンク、希望提出、再提出、催促対象まで整合する", async () => {
    const t = convexTest(schema, modules);
    const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "manager@example.com",
        shopName: "シナリオ店舗",
      });
      const submittedStaffId = await seedStaff(ctx, {
        shopId,
        name: "提出スタッフ",
        email: "submitted@example.com",
      });
      const allOffStaffId = await seedStaff(ctx, {
        shopId,
        name: "全休みスタッフ",
        email: "all-off@example.com",
      });
      const unsubmittedStaffId = await seedStaff(ctx, {
        shopId,
        name: "未提出スタッフ",
        email: "unsubmitted@example.com",
      });
      return { shopId, submittedStaffId, allOffStaffId, unsubmittedStaffId };
    });
    const recruitmentInput = {
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    };

    const recruitmentId = await asManager.mutation(api.recruitment.mutations.createRecruitment, recruitmentInput);

    const scheduledAfterCreate = await readScheduledFunctions(t);
    expect(
      scheduledAfterCreate.some((job) => job.name === "notification/actions:sendRecruitmentNotificationEmails"),
    ).toBe(true);
    const initialRecruitments = await asManager.query(api.dashboard.queries.getDashboardRecruitments, firstPage());
    expect(initialRecruitments.page[0]).toMatchObject({ _id: recruitmentId, responseCount: 0, status: "open" });

    const { token } = await t.mutation(internal.notification.mutations.createMagicLink, {
      staffId: ids.submittedStaffId,
      shopId: ids.shopId,
      recruitmentId,
    });
    const verified = await t.mutation(api.staffAuth.mutations.verifyToken, { token });
    expect(verified.status).toBe("ok");
    if (verified.status !== "ok") throw new Error("magic link verification failed");

    const submissionPage = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
      sessionToken: verified.sessionToken,
      recruitmentId,
    });
    expect(submissionPage).toMatchObject({
      shopName: "シナリオ店舗",
      staffName: "提出スタッフ",
      hasSubmitted: false,
      legalConsentRequired: true,
      timeRange: { startTime: "09:00", endTime: "22:00" },
    });

    await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
      sessionToken: verified.sessionToken,
      recruitmentId,
      acceptedLegal: true,
      requests: [{ date: recruitmentInput.periodStart, startTime: "10:00", endTime: "18:00" }],
    });
    await t.run(async (ctx) => {
      await seedSession(ctx, {
        sessionToken: "scenario-all-off-session",
        staffId: ids.allOffStaffId,
        shopId: ids.shopId,
        recruitmentId,
      });
    });
    await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
      sessionToken: "scenario-all-off-session",
      recruitmentId,
      acceptedLegal: true,
      requests: [],
    });
    await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
      sessionToken: verified.sessionToken,
      recruitmentId,
      requests: [{ date: recruitmentInput.periodStart, startTime: "12:00", endTime: "20:00" }],
    });

    const recruitmentsAfterSubmit = await asManager.query(api.dashboard.queries.getDashboardRecruitments, firstPage());
    expect(recruitmentsAfterSubmit.page[0].responseCount).toBe(2);

    const board = await asManager.query(api.shiftBoard.queries.getShiftBoardData, { recruitmentId });
    const staffById = new Map(board?.staffs.map((staff) => [staff._id, staff]));
    expect(staffById.get(ids.submittedStaffId)?.isSubmitted).toBe(true);
    expect(staffById.get(ids.allOffStaffId)?.isSubmitted).toBe(true);
    expect(staffById.get(ids.unsubmittedStaffId)?.isSubmitted).toBe(false);
    expect(board?.requestedSlots).toEqual([
      { staffId: ids.submittedStaffId, date: recruitmentInput.periodStart, startTime: "12:00", endTime: "20:00" },
    ]);

    const reminderData = await t.query(internal.notification.reminderQueries.getReminderEmailData, { recruitmentId });
    expect(reminderData?.staffEntries.map((staff) => staff.staffId)).toEqual([ids.unsubmittedStaffId]);
  });

  it("店舗時間変更後も、募集作成時のシフト時間スナップショットで提出できる", async () => {
    const t = convexTest(schema, modules);
    const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
    const { shopId, staffId } = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "manager-snapshot@example.com",
        shopName: "時間変更店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId: seeded.shopId,
        name: "提出スタッフ",
        email: "snapshot-staff@example.com",
      });
      return { shopId: seeded.shopId, staffId };
    });
    const recruitmentInput = {
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    };

    const recruitmentId = await asManager.mutation(api.recruitment.mutations.createRecruitment, recruitmentInput);
    await asManager.mutation(api.shop.mutations.updateShopSettings, {
      shopName: "時間変更店舗",
      shiftStartTime: "12:00",
      shiftEndTime: "20:00",
    });
    await t.run(async (ctx) => {
      await seedSession(ctx, {
        sessionToken: "scenario-snapshot-session",
        staffId,
        shopId,
        recruitmentId,
      });
    });

    const submissionPage = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
      sessionToken: "scenario-snapshot-session",
      recruitmentId,
    });
    expect(submissionPage?.timeRange).toEqual({ startTime: "09:00", endTime: "22:00" });

    await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
      sessionToken: "scenario-snapshot-session",
      recruitmentId,
      acceptedLegal: true,
      requests: [{ date: recruitmentInput.periodStart, startTime: "10:00", endTime: "18:00" }],
    });
    const board = await asManager.query(api.shiftBoard.queries.getShiftBoardData, { recruitmentId });
    expect(board?.timeRange.editableStartMinutes).toBe(540);
    expect(board?.timeRange.editableEndMinutes).toBe(1320);
  });
});
