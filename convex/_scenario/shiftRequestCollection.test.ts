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

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

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

    // Act: シフト担当者が募集を作成する。
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
      accessKind: "submit",
    });
    const verified = await staff.verifyMagicLink(token);
    expect(verified.status).toBe("ok");
    if (verified.status !== "ok") throw new Error("magic link verification failed");

    // Assert: 提出ページには募集作成時点の店舗情報と未提出状態が表示される。
    const submissionPage = await staff.getOkSubmissionPageData({
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
      submissionPattern: { kind: "time", startTime: "12:00", endTime: "20:00" },
      regularClosedDays: [],
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
    const submissionPage = await staff.getOkSubmissionPageData({
      sessionToken: "scenario-snapshot-session",
      recruitmentId,
    });
    expect(submissionPage.timeRange).toEqual({ startTime: "09:00", endTime: "22:00" });

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

  it("日ごと提出は定休日を拒否し、再提出で日付明細だけを全置換する", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const staff = scenario.staff();

    const { shopId, staffId } = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "manager-date-only@example.com",
        shopName: "日ごと提出店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId: seeded.shopId,
        name: "日ごと提出スタッフ",
        email: "date-only-staff@example.com",
      });
      return { shopId: seeded.shopId, staffId };
    });
    await asManager.updateShopSettings({
      shopName: "日ごと提出店舗",
      regularClosedDays: [],
      submissionPattern: { kind: "dateOnly" },
    });
    const recruitmentInput = {
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    };
    const shopClosedDate = addDays(recruitmentInput.periodStart, 1);
    const firstWorkingDate = recruitmentInput.periodStart;
    const secondWorkingDate = addDays(recruitmentInput.periodStart, 2);
    const resubmittedWorkingDate = addDays(recruitmentInput.periodStart, 3);
    const recruitmentId = await asManager.createRecruitment({
      ...recruitmentInput,
      shopClosedDates: [shopClosedDate],
    });
    await t.run(async (ctx) => {
      await seedSession(ctx, {
        sessionToken: "scenario-date-only-session",
        staffId,
        shopId,
        recruitmentId,
      });
    });

    const submissionPage = await staff.getOkSubmissionPageData({
      sessionToken: "scenario-date-only-session",
      recruitmentId,
    });
    expect(submissionPage.submissionPattern).toEqual({ kind: "dateOnly" });
    expect(submissionPage.shopClosedDates).toEqual([shopClosedDate]);

    await expect(
      staff.submitShiftRequests({
        sessionToken: "scenario-date-only-session",
        recruitmentId,
        acceptedLegal: true,
        submission: {
          kind: "dateOnly",
          workingDates: [firstWorkingDate, shopClosedDate],
        },
      }),
    ).rejects.toThrow("定休日には希望シフトを提出できません");

    await staff.submitShiftRequests({
      sessionToken: "scenario-date-only-session",
      recruitmentId,
      acceptedLegal: true,
      submission: {
        kind: "dateOnly",
        workingDates: [firstWorkingDate, secondWorkingDate],
      },
    });
    await staff.submitShiftRequests({
      sessionToken: "scenario-date-only-session",
      recruitmentId,
      submission: {
        kind: "dateOnly",
        workingDates: [resubmittedWorkingDate],
      },
    });

    const [recruitmentsAfterSubmit, board, storage] = await Promise.all([
      asManager.getDashboardRecruitments(),
      asManager.getShiftBoardData(recruitmentId),
      t.run(async (ctx) => {
        const slots = await ctx.db
          .query("shiftSubmissionSlots")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .collect();
        const dates = await ctx.db
          .query("shiftSubmissionDates")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .collect();
        return { slots, dates };
      }),
    ]);

    expect(recruitmentsAfterSubmit.page[0].responseCount).toBe(1);
    expect(storage.slots).toHaveLength(0);
    expect(storage.dates.map((entry) => entry.date)).toEqual([resubmittedWorkingDate]);
    expect(board?.requestedSlots).toEqual([]);
    expect(board?.requestedDates).toEqual([{ staffId, date: resubmittedWorkingDate }]);
  });

  it("募集作成時の提出方法スナップショットで勤務区分提出を時間枠化できる", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const staff = scenario.staff();

    // Arrange: 勤務区分の店舗設定で募集を作成し、その後に店舗側の勤務区分を別IDへ変える。
    const { shopId, staffId } = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "manager-pattern-snapshot@example.com",
        shopName: "提出方法スナップショット店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId: seeded.shopId,
        name: "区分提出スタッフ",
        email: "pattern-staff@example.com",
      });
      return { shopId: seeded.shopId, staffId };
    });
    await asManager.updateShopSettings({
      shopName: "提出方法スナップショット店舗",
      regularClosedDays: [],
      submissionPattern: {
        kind: "shiftType",
        options: [
          { id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
          { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
        ],
      },
    });
    const recruitmentInput = {
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    };
    const recruitmentId = await asManager.createRecruitment(recruitmentInput);
    await asManager.updateShopSettings({
      shopName: "提出方法スナップショット店舗",
      regularClosedDays: [],
      submissionPattern: {
        kind: "shiftType",
        options: [{ id: "new-late", name: "新遅番", startTime: "16:00", endTime: "23:00", sortOrder: 0 }],
      },
    });
    await t.run(async (ctx) => {
      await seedSession(ctx, {
        sessionToken: "scenario-pattern-snapshot-session",
        staffId,
        shopId,
        recruitmentId,
      });
    });

    // Assert: 提出ページは募集作成時点の勤務区分設定を保持する。
    const submissionPage = await staff.getOkSubmissionPageData({
      sessionToken: "scenario-pattern-snapshot-session",
      recruitmentId,
    });
    expect(submissionPage.submissionPattern).toEqual({
      kind: "shiftType",
      options: [
        { id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
        { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
      ],
    });

    // Act: 変更後の店舗設定にしか存在しない勤務区分IDは拒否され、募集作成時点のIDでは提出できる。
    await expect(
      staff.submitShiftRequests({
        sessionToken: "scenario-pattern-snapshot-session",
        recruitmentId,
        acceptedLegal: true,
        submission: { kind: "shiftType", selections: [{ date: recruitmentInput.periodStart, optionId: "new-late" }] },
      }),
    ).rejects.toThrow("勤務区分が見つかりません");
    await staff.submitShiftRequests({
      sessionToken: "scenario-pattern-snapshot-session",
      recruitmentId,
      acceptedLegal: true,
      submission: { kind: "shiftType", selections: [{ date: recruitmentInput.periodStart, optionId: "late" }] },
    });

    // Assert: シフト表では勤務区分が時間枠として扱われる。
    const [recruitmentsAfterSubmit, board] = await Promise.all([
      asManager.getDashboardRecruitments(),
      asManager.getShiftBoardData(recruitmentId),
    ]);
    expect(recruitmentsAfterSubmit.page[0].responseCount).toBe(1);
    expect(board?.requestedSlots).toEqual([
      { staffId, date: recruitmentInput.periodStart, startTime: "15:00", endTime: "22:00", optionId: "late" },
    ]);
  });

  it("提出リンクは締切後も開始日前なら閲覧でき、未提出は初回提出だけできる", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const staff = scenario.staff();

    const { shopId, submittedStaffId, unsubmittedStaffId } = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "manager-multi-browser@example.com",
        shopName: "複数ブラウザ店舗",
      });
      const submittedStaffId = await seedStaff(ctx, {
        shopId: seeded.shopId,
        name: "複数ブラウザスタッフ",
        email: "multi-browser@example.com",
      });
      const unsubmittedStaffId = await seedStaff(ctx, {
        shopId: seeded.shopId,
        name: "締切後未提出スタッフ",
        email: "deadline-unsubmitted@example.com",
      });
      return { shopId: seeded.shopId, submittedStaffId, unsubmittedStaffId };
    });
    const recruitmentInput = {
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    };
    const recruitmentId = await asManager.createRecruitment(recruitmentInput);
    const { token } = await t.mutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
      staffId: submittedStaffId,
      shopId,
      recruitmentId,
      expiresAt: new Date(`${addDays(recruitmentInput.deadline, 1)}T00:00:00.000Z`).getTime(),
    });

    const firstBrowser = await staff.verifyMagicLink(token);
    const secondBrowser = await staff.verifyMagicLink(token);
    expect(firstBrowser.status).toBe("ok");
    expect(secondBrowser.status).toBe("ok");
    if (firstBrowser.status !== "ok" || secondBrowser.status !== "ok") {
      throw new Error("submit link should be reusable before deadline");
    }
    expect(firstBrowser.sessionToken).not.toBe(secondBrowser.sessionToken);

    await expect(
      staff.getOkSubmissionPageData({ sessionToken: firstBrowser.sessionToken, recruitmentId }),
    ).resolves.toMatchObject({ staffName: "複数ブラウザスタッフ", hasSubmitted: false });
    await expect(
      staff.getOkSubmissionPageData({ sessionToken: secondBrowser.sessionToken, recruitmentId }),
    ).resolves.toMatchObject({ staffName: "複数ブラウザスタッフ", hasSubmitted: false });

    await staff.submitShiftRequests({
      sessionToken: firstBrowser.sessionToken,
      recruitmentId,
      acceptedLegal: true,
      requests: [{ date: recruitmentInput.periodStart, startTime: "10:00", endTime: "18:00" }],
    });
    await staff.submitShiftRequests({
      sessionToken: secondBrowser.sessionToken,
      recruitmentId,
      requests: [{ date: recruitmentInput.periodStart, startTime: "12:00", endTime: "20:00" }],
    });

    const board = await asManager.getShiftBoardData(recruitmentId);
    expect(board?.requestedSlots).toEqual([
      { staffId: submittedStaffId, date: recruitmentInput.periodStart, startTime: "12:00", endTime: "20:00" },
    ]);

    const { token: unsubmittedToken } = await t.mutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
      staffId: unsubmittedStaffId,
      shopId,
      recruitmentId,
      expiresAt: new Date(`${addDays(recruitmentInput.deadline, 1)}T00:00:00.000Z`).getTime(),
    });

    vi.setSystemTime(new Date(`${addDays(recruitmentInput.deadline, 1)}T00:00:00.000Z`));
    await expect(staff.verifyMagicLink(token)).resolves.toMatchObject({ status: "ok", recruitmentId });
    await expect(
      staff.getOkSubmissionPageData({ sessionToken: secondBrowser.sessionToken, recruitmentId }),
    ).resolves.toMatchObject({
      isBeforeDeadline: false,
      hasSubmitted: true,
      existingRequests: [{ date: recruitmentInput.periodStart, startTime: "12:00", endTime: "20:00" }],
    });
    await expect(
      staff.submitShiftRequests({
        sessionToken: secondBrowser.sessionToken,
        recruitmentId,
        requests: [{ date: recruitmentInput.periodStart, startTime: "14:00", endTime: "21:00" }],
      }),
    ).rejects.toThrow("Deadline passed");

    const unsubmittedAfterDeadline = await staff.verifyMagicLink(unsubmittedToken);
    expect(unsubmittedAfterDeadline.status).toBe("ok");
    if (unsubmittedAfterDeadline.status !== "ok") {
      throw new Error("submit link should remain readable until confirmation");
    }
    await expect(
      staff.getOkSubmissionPageData({ sessionToken: unsubmittedAfterDeadline.sessionToken, recruitmentId }),
    ).resolves.toMatchObject({ isBeforeDeadline: false, hasSubmitted: false, existingRequests: [] });
    await staff.submitShiftRequests({
      sessionToken: unsubmittedAfterDeadline.sessionToken,
      recruitmentId,
      acceptedLegal: true,
      requests: [{ date: recruitmentInput.periodStart, startTime: "09:00", endTime: "17:00" }],
    });
    await expect(
      staff.getOkSubmissionPageData({ sessionToken: unsubmittedAfterDeadline.sessionToken, recruitmentId }),
    ).resolves.toMatchObject({
      isBeforeDeadline: false,
      hasSubmitted: true,
      existingRequests: [{ date: recruitmentInput.periodStart, startTime: "09:00", endTime: "17:00" }],
    });
    await expect(
      staff.submitShiftRequests({
        sessionToken: unsubmittedAfterDeadline.sessionToken,
        recruitmentId,
        requests: [{ date: recruitmentInput.periodStart, startTime: "10:00", endTime: "18:00" }],
      }),
    ).rejects.toThrow("Deadline passed");

    await asManager.confirmRecruitment(recruitmentId);
    await expect(staff.verifyMagicLink(token)).resolves.toMatchObject({
      status: "expired",
      reason: "submission_closed",
      recruitmentId,
    });
    await expect(
      staff.getSubmissionPageData({ sessionToken: secondBrowser.sessionToken, recruitmentId }),
    ).resolves.toEqual({ status: "unavailable", reason: "submission_closed" });
  });

  it("過去のシフトあり週を次回募集の前回パターンとして再利用できる", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const staff = scenario.staff();

    // Arrange: シフトあり週、全休み週、2週間募集の順に同じスタッフの提出セッションを用意する。
    const { shopId, staffId } = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "manager-reuse@example.com",
        shopName: "履歴再利用店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId: seeded.shopId,
        name: "履歴再利用スタッフ",
        email: "reuse-staff@example.com",
      });
      return { shopId: seeded.shopId, staffId };
    });
    const workedWeekInput = {
      periodStart: scenarioDate(8),
      periodEnd: scenarioDate(14),
      deadline: scenarioDate(7),
    };
    const allOffWeekInput = {
      periodStart: scenarioDate(15),
      periodEnd: scenarioDate(21),
      deadline: scenarioDate(14),
    };
    const currentInput = {
      periodStart: scenarioDate(22),
      periodEnd: scenarioDate(35),
      deadline: scenarioDate(21),
    };

    const workedRecruitmentId = await asManager.createRecruitment(workedWeekInput);
    const allOffRecruitmentId = await asManager.createRecruitment(allOffWeekInput);
    const currentRecruitmentId = await asManager.createRecruitment(currentInput);
    await t.run(async (ctx) => {
      await seedSession(ctx, {
        sessionToken: "scenario-reuse-worked-session",
        staffId,
        shopId,
        recruitmentId: workedRecruitmentId,
      });
      await seedSession(ctx, {
        sessionToken: "scenario-reuse-all-off-session",
        staffId,
        shopId,
        recruitmentId: allOffRecruitmentId,
      });
      await seedSession(ctx, {
        sessionToken: "scenario-reuse-current-session",
        staffId,
        shopId,
        recruitmentId: currentRecruitmentId,
      });
    });

    // Act: 前々回はシフトあり、前回は全休みで提出する。
    await staff.submitShiftRequests({
      sessionToken: "scenario-reuse-worked-session",
      recruitmentId: workedRecruitmentId,
      acceptedLegal: true,
      requests: [
        { date: workedWeekInput.periodStart, startTime: "10:00", endTime: "18:00" },
        { date: addDays(workedWeekInput.periodStart, 2), startTime: "12:00", endTime: "20:00" },
      ],
    });
    await staff.submitShiftRequests({
      sessionToken: "scenario-reuse-all-off-session",
      recruitmentId: allOffRecruitmentId,
      requests: [],
    });

    // Assert: 次の募集では全休み週を飛ばし、シフトあり週の曜日パターンが返る。
    const currentPage = await staff.getOkSubmissionPageData({
      sessionToken: "scenario-reuse-current-session",
      recruitmentId: currentRecruitmentId,
    });
    expect(currentPage.previousWeeklyPattern).toEqual({
      sourceWeekStart: workedWeekInput.periodStart,
      days: [
        { weekday: 1, startTime: "10:00", endTime: "18:00" },
        { weekday: 3, startTime: "12:00", endTime: "20:00" },
      ],
    });

    // Act: 返されたパターンを2週間分に反映した想定で提出する。
    const repeatedRequests = [
      { date: currentInput.periodStart, startTime: "10:00", endTime: "18:00" },
      { date: addDays(currentInput.periodStart, 2), startTime: "12:00", endTime: "20:00" },
      { date: addDays(currentInput.periodStart, 7), startTime: "10:00", endTime: "18:00" },
      { date: addDays(currentInput.periodStart, 9), startTime: "12:00", endTime: "20:00" },
    ];
    await staff.submitShiftRequests({
      sessionToken: "scenario-reuse-current-session",
      recruitmentId: currentRecruitmentId,
      requests: repeatedRequests,
    });

    // Assert: 提出集計とシフト表の希望スロットも、再利用後の提出内容として整合する。
    const recruitmentsAfterSubmit = await asManager.getDashboardRecruitments();
    expect(
      recruitmentsAfterSubmit.page.find((recruitment) => recruitment._id === currentRecruitmentId)?.responseCount,
    ).toBe(1);
    const board = await asManager.getShiftBoardData(currentRecruitmentId);
    expect(board?.requestedSlots).toEqual(repeatedRequests.map((request) => ({ staffId, ...request })));
  });
});
