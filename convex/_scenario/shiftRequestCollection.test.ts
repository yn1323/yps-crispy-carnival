import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import {
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

describe("シフト希望回収シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("募集作成から提出リンク、希望提出、再提出、催促対象まで整合する", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const staff = scenario.staff();

    // Arrange: 募集対象のスタッフを提出済み、全休み、未提出に分けて用意する。
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

    // Act: 店長が募集を作成する。
    const recruitmentId = await asManager.createRecruitment(recruitmentInput);

    // Assert: 募集作成直後の通知予約とダッシュボード集計が整合する。
    const scheduledAfterCreate = await readScheduledFunctions(t);
    expect(
      scheduledAfterCreate.some((job) => job.name === "notification/actions:sendRecruitmentNotificationEmails"),
    ).toBe(true);
    const initialRecruitments = await asManager.getDashboardRecruitments();
    expect(initialRecruitments.page[0]).toMatchObject({ _id: recruitmentId, responseCount: 0, status: "open" });

    // Act: 提出スタッフが通知リンクから提出フォームを開く。
    const { token } = await t.mutation(internal.notification.mutations.createMagicLink, {
      staffId: ids.submittedStaffId,
      shopId: ids.shopId,
      recruitmentId,
    });
    const verified = await staff.verifyMagicLink(token);
    expect(verified.status).toBe("ok");
    if (verified.status !== "ok") throw new Error("magic link verification failed");

    // Assert: 提出ページには募集作成時点の店舗情報と未提出状態が表示される。
    const submissionPage = await staff.getSubmissionPageData({
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

    // Act: 通常提出、全休み提出、再提出を行う。
    await staff.submitShiftRequests({
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
    await staff.submitShiftRequests({
      sessionToken: "scenario-all-off-session",
      recruitmentId,
      acceptedLegal: true,
      requests: [],
    });
    await staff.submitShiftRequests({
      sessionToken: verified.sessionToken,
      recruitmentId,
      requests: [{ date: recruitmentInput.periodStart, startTime: "12:00", endTime: "20:00" }],
    });

    // Assert: 提出集計、シフト表、催促対象が提出状態を正しく反映する。
    const recruitmentsAfterSubmit = await asManager.getDashboardRecruitments();
    expect(recruitmentsAfterSubmit.page[0].responseCount).toBe(2);

    const board = await asManager.getShiftBoardData(recruitmentId);
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
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const staff = scenario.staff();

    // Arrange: 募集作成後に店舗営業時間を変更するための店舗とスタッフを用意する。
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

    // Act: 募集作成後に店舗設定を変更し、スタッフの提出セッションを用意する。
    const recruitmentId = await asManager.createRecruitment(recruitmentInput);
    await asManager.updateShopSettings({
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

    // Assert: 提出ページは募集作成時点のシフト時間スナップショットを使う。
    const submissionPage = await staff.getSubmissionPageData({
      sessionToken: "scenario-snapshot-session",
      recruitmentId,
    });
    expect(submissionPage?.timeRange).toEqual({ startTime: "09:00", endTime: "22:00" });

    // Act: 変更前スナップショットの時間帯で提出する。
    await staff.submitShiftRequests({
      sessionToken: "scenario-snapshot-session",
      recruitmentId,
      acceptedLegal: true,
      requests: [{ date: recruitmentInput.periodStart, startTime: "10:00", endTime: "18:00" }],
    });

    // Assert: シフト表も募集作成時点の時間範囲を保持する。
    const board = await asManager.getShiftBoardData(recruitmentId);
    expect(board?.timeRange.editableStartMinutes).toBe(540);
    expect(board?.timeRange.editableEndMinutes).toBe(1320);
  });
});
