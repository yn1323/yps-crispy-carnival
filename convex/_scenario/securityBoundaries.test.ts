import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { selectChannel } from "../_lib/notification";
import {
  countScheduledJobs,
  hasScheduledJob,
  MANAGER_SUBJECT,
  readScheduledFunctions,
  SCENARIO_NOW,
  scenarioDate,
  seedSession,
  seedStaff,
} from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop, seedShop, seedStaffLineAccount } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("セキュリティ境界シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("シフト確定通知は対象店舗の有効スタッフだけをメール/LINE/magic link対象にする", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "security-manager@example.com",
        shopName: "通知対象店舗",
      });
      const { shopId: otherShopId } = await seedManagerShop(ctx, {
        subject: "security_other_manager",
        email: "security-other-manager@example.com",
        shopName: "別店舗",
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
      const unfollowStaffId = await seedStaff(ctx, {
        shopId,
        name: "未followスタッフ",
        email: "unfollow-staff@example.com",
      });
      const deletedStaffId = await seedStaff(ctx, {
        shopId,
        name: "削除済みスタッフ",
        email: "deleted-staff@example.com",
        isDeleted: true,
      });
      const otherShopStaffId = await seedStaff(ctx, {
        shopId: otherShopId,
        name: "別店舗スタッフ",
        email: "other-shop-staff@example.com",
      });
      await seedStaffLineAccount(ctx, { staffId: lineStaffId, shopId, lineUserId: "U_confirm_line", following: true });
      await seedStaffLineAccount(ctx, {
        staffId: unfollowStaffId,
        shopId,
        lineUserId: "U_confirm_unfollow",
        following: false,
      });
      await seedStaffLineAccount(ctx, {
        staffId: otherShopStaffId,
        shopId: otherShopId,
        lineUserId: "U_confirm_other_shop",
        following: true,
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
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId: emailStaffId,
        date: scenarioDate(7),
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId: lineStaffId,
        date: scenarioDate(7),
        startTime: "11:00",
        endTime: "19:00",
        positionId,
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId: otherShopStaffId,
        date: scenarioDate(7),
        startTime: "12:00",
        endTime: "20:00",
        positionId,
      });

      return { shopId, recruitmentId, emailStaffId, lineStaffId, unfollowStaffId, deletedStaffId, otherShopStaffId };
    });

    await asManager.confirmRecruitment(ids.recruitmentId);
    const scheduledAfterConfirm = await readScheduledFunctions(t);
    expect(
      hasScheduledJob(scheduledAfterConfirm, "notification/actions:sendShiftConfirmationEmails", {
        recruitmentId: ids.recruitmentId,
      }),
    ).toBe(true);

    const confirmationData = await t.query(internal.notification.queries.getConfirmationEmailData, {
      recruitmentId: ids.recruitmentId,
    });
    expect(confirmationData?.shopId).toBe(ids.shopId);
    expect(confirmationData?.staffEntries.map((staff) => staff.staffId)).toEqual(
      expect.arrayContaining([ids.emailStaffId, ids.lineStaffId, ids.unfollowStaffId]),
    );
    expect(confirmationData?.staffEntries.map((staff) => staff.staffId)).not.toEqual(
      expect.arrayContaining([ids.deletedStaffId, ids.otherShopStaffId]),
    );

    const lineEntry = confirmationData?.staffEntries.find((staff) => staff.staffId === ids.lineStaffId);
    const unfollowEntry = confirmationData?.staffEntries.find((staff) => staff.staffId === ids.unfollowStaffId);
    const emailEntry = confirmationData?.staffEntries.find((staff) => staff.staffId === ids.emailStaffId);
    expect(selectChannel({ lineUserId: lineEntry?.lineUserId, lineFollowing: lineEntry?.lineFollowing }, null)).toBe(
      "line",
    );
    expect(
      selectChannel({ lineUserId: unfollowEntry?.lineUserId, lineFollowing: unfollowEntry?.lineFollowing }, null),
    ).toBe("email");
    expect(selectChannel({ lineUserId: emailEntry?.lineUserId, lineFollowing: emailEntry?.lineFollowing }, null)).toBe(
      "email",
    );

    if (!confirmationData) throw new Error("confirmation data was not found");
    for (const staff of confirmationData.staffEntries) {
      await t.mutation(internal.notification.mutations.createMagicLink, {
        staffId: staff.staffId,
        shopId: confirmationData.shopId,
        recruitmentId: ids.recruitmentId,
        accessKind: "view",
      });
    }

    const magicLinks = await t.run(async (ctx) => ctx.db.query("magicLinks").collect());
    expect(magicLinks.map((link) => link.staffId)).toEqual(
      expect.arrayContaining([ids.emailStaffId, ids.lineStaffId, ids.unfollowStaffId]),
    );
    expect(magicLinks.map((link) => link.staffId)).not.toEqual(
      expect.arrayContaining([ids.deletedStaffId, ids.otherShopStaffId]),
    );
    expect(magicLinks.every((link) => link.shopId === ids.shopId && link.recruitmentId === ids.recruitmentId)).toBe(
      true,
    );
  });

  it("募集開始通知と未提出催促も対象店舗の有効スタッフだけを対象にする", async () => {
    const t = convexTest(schema, modules);

    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "募集通知店舗");
      const otherShopId = await seedShop(ctx, "別店舗");
      const unsubmittedStaffId = await seedStaff(ctx, {
        shopId,
        name: "未提出スタッフ",
        email: "unsubmitted@example.com",
      });
      const submittedStaffId = await seedStaff(ctx, {
        shopId,
        name: "提出済みスタッフ",
        email: "submitted@example.com",
      });
      const lineStaffId = await seedStaff(ctx, {
        shopId,
        name: "LINE未提出スタッフ",
        email: "line-unsubmitted@example.com",
      });
      const deletedStaffId = await seedStaff(ctx, {
        shopId,
        name: "削除済みスタッフ",
        email: "deleted@example.com",
        isDeleted: true,
      });
      const otherShopStaffId = await seedStaff(ctx, {
        shopId: otherShopId,
        name: "別店舗スタッフ",
        email: "other@example.com",
      });
      await seedStaffLineAccount(ctx, { staffId: lineStaffId, shopId, lineUserId: "U_open_line", following: true });

      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(13),
        deadline: scenarioDate(3),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId: submittedStaffId,
        firstSubmittedAt: Date.now(),
        submittedAt: Date.now(),
      });
      return { recruitmentId, unsubmittedStaffId, submittedStaffId, lineStaffId, deletedStaffId, otherShopStaffId };
    });

    const recruitmentData = await t.query(internal.notification.queries.getRecruitmentEmailData, {
      recruitmentId: ids.recruitmentId,
    });
    expect(recruitmentData?.staffEntries.map((staff) => staff.staffId)).toEqual(
      expect.arrayContaining([ids.unsubmittedStaffId, ids.submittedStaffId, ids.lineStaffId]),
    );
    expect(recruitmentData?.staffEntries.map((staff) => staff.staffId)).not.toEqual(
      expect.arrayContaining([ids.deletedStaffId, ids.otherShopStaffId]),
    );

    const reminderData = await t.query(internal.notification.reminderQueries.getReminderEmailData, {
      recruitmentId: ids.recruitmentId,
    });
    expect(reminderData?.staffEntries.map((staff) => staff.staffId)).toEqual(
      expect.arrayContaining([ids.unsubmittedStaffId, ids.lineStaffId]),
    );
    expect(reminderData?.staffEntries.map((staff) => staff.staffId)).not.toEqual(
      expect.arrayContaining([ids.submittedStaffId, ids.deletedStaffId, ids.otherShopStaffId]),
    );
  });

  it("シフト下書き保存では別店舗・削除済みのスタッフ/positionを混ぜられない", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "draft-security-manager@example.com",
        shopName: "下書き店舗",
      });
      const otherShopId = await seedShop(ctx, "別店舗");
      const targetStaffId = await seedStaff(ctx, { shopId, name: "対象スタッフ", email: "target@example.com" });
      const otherShopStaffId = await seedStaff(ctx, {
        shopId: otherShopId,
        name: "別店舗スタッフ",
        email: "other@example.com",
      });
      const deletedStaffId = await seedStaff(ctx, {
        shopId,
        name: "削除済みスタッフ",
        email: "deleted@example.com",
        isDeleted: true,
      });
      const targetPositionId = await ctx.db.insert("positions", {
        shopId,
        name: "シフト",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const otherShopPositionId = await ctx.db.insert("positions", {
        shopId: otherShopId,
        name: "別店舗ポジション",
        color: "#ef4444",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const deletedPositionId = await ctx.db.insert("positions", {
        shopId,
        name: "削除済みポジション",
        color: "#64748b",
        sortOrder: 1,
        isDeleted: true,
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
      return {
        recruitmentId,
        targetStaffId,
        otherShopStaffId,
        deletedStaffId,
        targetPositionId,
        otherShopPositionId,
        deletedPositionId,
      };
    });

    await expect(
      asManager.saveShiftAssignments({
        recruitmentId: ids.recruitmentId,
        assignments: [{ staffId: ids.otherShopStaffId, date: scenarioDate(7), startTime: "10:00", endTime: "18:00" }],
      }),
    ).rejects.toThrow("Not found");
    await expect(
      asManager.saveShiftAssignments({
        recruitmentId: ids.recruitmentId,
        assignments: [{ staffId: ids.deletedStaffId, date: scenarioDate(7), startTime: "10:00", endTime: "18:00" }],
      }),
    ).rejects.toThrow("Not found");
    await expect(
      asManager.saveShiftAssignments({
        recruitmentId: ids.recruitmentId,
        assignments: [
          {
            staffId: ids.targetStaffId,
            date: scenarioDate(7),
            startTime: "10:00",
            endTime: "18:00",
            positionId: ids.otherShopPositionId,
          },
        ],
      }),
    ).rejects.toThrow("Not found");
    await expect(
      asManager.saveShiftAssignments({
        recruitmentId: ids.recruitmentId,
        assignments: [
          {
            staffId: ids.targetStaffId,
            date: scenarioDate(7),
            startTime: "10:00",
            endTime: "18:00",
            positionId: ids.deletedPositionId,
          },
        ],
      }),
    ).rejects.toThrow("Not found");

    await asManager.saveShiftAssignments({
      recruitmentId: ids.recruitmentId,
      assignments: [
        {
          staffId: ids.targetStaffId,
          date: scenarioDate(7),
          startTime: "10:00",
          endTime: "18:00",
          positionId: ids.targetPositionId,
        },
      ],
    });
    const assignments = await t.run(async (ctx) =>
      ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", ids.recruitmentId))
        .collect(),
    );
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({ staffId: ids.targetStaffId, positionId: ids.targetPositionId });
  });

  it("確定シフト閲覧はsession・スタッフ・店舗・募集の境界を越えない", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const staff = scenario.staff();

    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "閲覧境界店舗");
      const otherShopId = await seedShop(ctx, "別店舗");
      const staffId = await seedStaff(ctx, { shopId, name: "閲覧スタッフ", email: "view@example.com" });
      const deletedStaffId = await seedStaff(ctx, {
        shopId,
        name: "削除済み閲覧スタッフ",
        email: "deleted-view@example.com",
        isDeleted: true,
      });
      const otherShopStaffId = await seedStaff(ctx, {
        shopId: otherShopId,
        name: "別店舗閲覧スタッフ",
        email: "other-view@example.com",
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
      const otherRecruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(14),
        periodEnd: scenarioDate(16),
        deadline: scenarioDate(10),
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const deletedRecruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(21),
        periodEnd: scenarioDate(23),
        deadline: scenarioDate(17),
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: true,
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
        sessionToken: "valid-view-session",
        staffId,
        shopId,
        recruitmentId,
        accessKind: "view",
      });
      await seedSession(ctx, {
        sessionToken: "other-recruitment-session",
        staffId,
        shopId,
        recruitmentId: otherRecruitmentId,
        accessKind: "view",
      });
      await seedSession(ctx, {
        sessionToken: "other-shop-session",
        staffId: otherShopStaffId,
        shopId: otherShopId,
        recruitmentId,
        accessKind: "view",
      });
      await seedSession(ctx, {
        sessionToken: "deleted-staff-session",
        staffId: deletedStaffId,
        shopId,
        recruitmentId,
        accessKind: "view",
      });
      await seedSession(ctx, {
        sessionToken: "deleted-recruitment-session",
        staffId,
        shopId,
        recruitmentId: deletedRecruitmentId,
        accessKind: "view",
      });
      await ctx.db.insert("sessions", {
        sessionToken: "expired-view-session",
        staffId,
        shopId,
        recruitmentId,
        accessKind: "view",
        expiresAt: Date.now() - 1,
      });
      return { recruitmentId, deletedRecruitmentId };
    });

    const validView = await staff.getShiftViewData({
      sessionToken: "valid-view-session",
      recruitmentId: ids.recruitmentId,
    });
    expect(validView?.assignments).toHaveLength(1);
    await expect(
      staff.getShiftViewData({ sessionToken: "other-recruitment-session", recruitmentId: ids.recruitmentId }),
    ).resolves.toBeNull();
    await expect(
      staff.getShiftViewData({ sessionToken: "other-shop-session", recruitmentId: ids.recruitmentId }),
    ).resolves.toBeNull();
    await expect(
      staff.getShiftViewData({ sessionToken: "deleted-staff-session", recruitmentId: ids.recruitmentId }),
    ).resolves.toBeNull();
    await expect(
      staff.getShiftViewData({ sessionToken: "expired-view-session", recruitmentId: ids.recruitmentId }),
    ).resolves.toBeNull();
    await expect(
      staff.getShiftViewData({
        sessionToken: "deleted-recruitment-session",
        recruitmentId: ids.deletedRecruitmentId,
      }),
    ).resolves.toBeNull();
  });

  it("提出用と閲覧用のリンク・sessionは相互に流用できない", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const staff = scenario.staff();

    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "用途境界店舗");
      const staffId = await seedStaff(ctx, { shopId, name: "用途境界スタッフ", email: "access-kind@example.com" });
      const positionId = await ctx.db.insert("positions", {
        shopId,
        name: "シフト",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const openRecruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(9),
        deadline: scenarioDate(3),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const confirmedRecruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(14),
        periodEnd: scenarioDate(16),
        deadline: scenarioDate(10),
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId: confirmedRecruitmentId,
        staffId,
        date: scenarioDate(14),
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      });
      await seedSession(ctx, {
        sessionToken: "access-kind-submit-session",
        staffId,
        shopId,
        recruitmentId: confirmedRecruitmentId,
        accessKind: "submit",
      });
      return { shopId, staffId, openRecruitmentId, confirmedRecruitmentId };
    });

    const { token: viewToken } = await t.mutation(internal.notification.mutations.createMagicLink, {
      staffId: ids.staffId,
      shopId: ids.shopId,
      recruitmentId: ids.confirmedRecruitmentId,
      accessKind: "view",
    });
    const { token: submitToken } = await t.mutation(internal.notification.mutations.createMagicLink, {
      staffId: ids.staffId,
      shopId: ids.shopId,
      recruitmentId: ids.openRecruitmentId,
      accessKind: "submit",
      expiresAt: new Date(`${scenarioDate(4)}T00:00:00.000Z`).getTime(),
    });

    await expect(staff.verifyMagicLink(viewToken, "submit")).resolves.toMatchObject({
      status: "expired",
      recruitmentId: ids.confirmedRecruitmentId,
    });
    await expect(staff.verifyMagicLink(submitToken, "view")).resolves.toMatchObject({
      status: "expired",
      recruitmentId: ids.openRecruitmentId,
    });

    const firstView = await staff.verifyMagicLink(viewToken, "view");
    expect(firstView.status).toBe("ok");
    if (firstView.status !== "ok") throw new Error("view link should authenticate once");
    await expect(staff.verifyMagicLink(viewToken, "view")).resolves.toMatchObject({
      status: "expired",
      recruitmentId: ids.confirmedRecruitmentId,
    });

    await expect(
      t.query(api.shiftView.queries.getShiftViewData, {
        sessionToken: "access-kind-submit-session",
        accessKind: "view",
        recruitmentId: ids.confirmedRecruitmentId,
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken: firstView.sessionToken,
        accessKind: "submit",
        recruitmentId: ids.openRecruitmentId,
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "invalid_link" });
  });

  it("再発行通知は対象募集の店舗スタッフだけに予約され、内部通知データも店舗不一致を返さない", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const staff = scenario.staff();

    const ids = await t.run(async (ctx) => {
      const targetShopId = await seedShop(ctx, "再発行対象店舗");
      const otherShopId = await seedShop(ctx, "別店舗");
      const targetStaffId = await seedStaff(ctx, {
        shopId: targetShopId,
        name: "対象スタッフ",
        email: "shared@example.com",
      });
      const otherShopStaffId = await seedStaff(ctx, {
        shopId: otherShopId,
        name: "別店舗スタッフ",
        email: "shared@example.com",
      });
      const deletedStaffId = await seedStaff(ctx, {
        shopId: targetShopId,
        name: "削除済みスタッフ",
        email: "deleted-reissue@example.com",
        isDeleted: true,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: targetShopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(9),
        deadline: scenarioDate(3),
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const deletedRecruitmentId = await ctx.db.insert("recruitments", {
        shopId: targetShopId,
        periodStart: scenarioDate(14),
        periodEnd: scenarioDate(16),
        deadline: scenarioDate(10),
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: true,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const openRecruitmentId = await ctx.db.insert("recruitments", {
        shopId: targetShopId,
        periodStart: scenarioDate(21),
        periodEnd: scenarioDate(23),
        deadline: scenarioDate(17),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return {
        recruitmentId,
        deletedRecruitmentId,
        openRecruitmentId,
        targetStaffId,
        otherShopStaffId,
        deletedStaffId,
      };
    });

    await staff.requestReissue({ email: "shared@example.com", recruitmentId: ids.recruitmentId });
    const scheduled = await readScheduledFunctions(t);
    expect(
      hasScheduledJob(scheduled, "notification/actions:sendReissueEmail", {
        staffId: ids.targetStaffId,
        recruitmentId: ids.recruitmentId,
      }),
    ).toBe(true);
    expect(
      hasScheduledJob(scheduled, "notification/actions:sendReissueEmail", {
        staffId: ids.otherShopStaffId,
        recruitmentId: ids.recruitmentId,
      }),
    ).toBe(false);

    await expect(
      t.query(internal.notification.queries.getReissueEmailData, {
        staffId: ids.targetStaffId,
        recruitmentId: ids.recruitmentId,
      }),
    ).resolves.toMatchObject({ staffName: "対象スタッフ", staffEmail: "shared@example.com" });
    await expect(
      t.query(internal.notification.queries.getReissueEmailData, {
        staffId: ids.otherShopStaffId,
        recruitmentId: ids.recruitmentId,
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.notification.queries.getReissueEmailData, {
        staffId: ids.deletedStaffId,
        recruitmentId: ids.recruitmentId,
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.notification.queries.getReissueEmailData, {
        staffId: ids.targetStaffId,
        recruitmentId: ids.deletedRecruitmentId,
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.notification.queries.getReissueEmailData, {
        staffId: ids.targetStaffId,
        recruitmentId: ids.openRecruitmentId,
      }),
    ).resolves.toBeNull();
  });

  it("スタッフ削除後は既存リンク・session・LINE連携から提出/閲覧/通知に進めない", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const staff = scenario.staff();

    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "delete-security-manager@example.com",
        shopName: "削除境界店舗",
      });
      const staffId = await seedStaff(ctx, { shopId, name: "削除対象スタッフ", email: "delete-target@example.com" });
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
      await seedSession(ctx, { sessionToken: "deleted-target-session", staffId, shopId, recruitmentId });
      await seedStaffLineAccount(ctx, { staffId, shopId, lineUserId: "U_deleted_target", following: true });
      return { shopId, staffId, recruitmentId };
    });
    const { token: magicToken } = await t.mutation(internal.notification.mutations.createMagicLink, {
      staffId: ids.staffId,
      shopId: ids.shopId,
      recruitmentId: ids.recruitmentId,
      accessKind: "submit",
    });
    await t.mutation(internal.line.mutations.createLinkTokenInternal, { staffId: ids.staffId, shopId: ids.shopId });

    await asManager.deleteStaff(ids.staffId);

    await expect(staff.verifyMagicLink(magicToken)).resolves.toMatchObject({
      status: "expired",
      reason: "invalid_link",
    });
    await expect(
      staff.getSubmissionPageData({ sessionToken: "deleted-target-session", recruitmentId: ids.recruitmentId }),
    ).resolves.toEqual({ status: "unavailable", reason: "invalid_link" });
    await expect(
      staff.submitShiftRequests({
        sessionToken: "deleted-target-session",
        recruitmentId: ids.recruitmentId,
        acceptedLegal: true,
        requests: [{ date: scenarioDate(7), startTime: "10:00", endTime: "18:00" }],
      }),
    ).rejects.toThrow("Session expired");
    await expect(
      t.query(internal.notification.queries.getOpenRecruitmentNotificationDataForStaff, { staffId: ids.staffId }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.legal.queries.getStaffConsentNotificationDataInternal, { staffId: ids.staffId }),
    ).resolves.toBeNull();
  });

  it("同じLINE userIdを再連携したら古いスタッフにはLINE通知対象が残らない", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const line = scenario.line();

    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "line-relink-manager@example.com",
        shopName: "LINE再連携店舗",
      });
      const oldStaffId = await seedStaff(ctx, { shopId, name: "旧スタッフ", email: "old-line@example.com" });
      const newStaffId = await seedStaff(ctx, { shopId, name: "新スタッフ", email: "new-line@example.com" });
      await seedStaffLineAccount(ctx, { staffId: oldStaffId, shopId, lineUserId: "U_relink_shared", following: true });
      return { oldStaffId, newStaffId };
    });
    await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });

    const link = await asManager.generateLineLinkToken(ids.newStaffId);
    const validation = await line.validateLinkToken(link.token);
    expect(validation.status).toBe("ok");
    if (validation.status !== "ok") throw new Error("LINE token validation failed");

    await line.finalizeLinking({
      staffId: ids.newStaffId,
      tokenDocId: validation.tokenDocId,
      lineUserId: "U_relink_shared",
      lineFollowing: true,
    });

    const accounts = await t.run(async (ctx) => {
      const oldAccount = await ctx.db
        .query("staffLineAccounts")
        .withIndex("by_staffId", (q) => q.eq("staffId", ids.oldStaffId))
        .first();
      const newAccount = await ctx.db
        .query("staffLineAccounts")
        .withIndex("by_staffId", (q) => q.eq("staffId", ids.newStaffId))
        .first();
      return { oldAccount, newAccount };
    });
    expect(accounts.oldAccount).toMatchObject({ isDeleted: true, following: false });
    expect(accounts.newAccount).toMatchObject({
      isDeleted: false,
      following: true,
      lineUserId: "U_relink_shared",
    });

    const scheduled = await readScheduledFunctions(t);
    expect(
      countScheduledJobs(scheduled, "notification/actions:sendOpenRecruitmentNotificationLinesForStaff", {
        staffId: ids.oldStaffId,
      }),
    ).toBe(0);
    expect(
      countScheduledJobs(scheduled, "notification/actions:sendOpenRecruitmentNotificationLinesForStaff", {
        staffId: ids.newStaffId,
      }),
    ).toBe(1);
  });
});
