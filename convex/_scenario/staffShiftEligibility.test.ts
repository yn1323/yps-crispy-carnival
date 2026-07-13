import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { MANAGER_SUBJECT, SCENARIO_NOW, scenarioDate, seedStaff } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("シフト対象スタッフの状態遷移シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("対象外では下書きを保持したまま画面・link・通知から除外し、復帰後は新しいlinkで提出できる", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const staff = scenario.staff();

    const { shopId, staffId, positionId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "eligibility-manager@example.com",
        shopName: "シフト対象管理店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "対象切替スタッフ",
        email: "eligibility-staff@example.com",
      });
      const positionId = await ctx.db.insert("positions", {
        shopId,
        name: "通常勤務",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      return { shopId, staffId, positionId };
    });
    const recruitmentId = await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });
    await asManager.saveShiftAssignments({
      recruitmentId,
      assignments: [
        {
          staffId,
          date: scenarioDate(7),
          startTime: "10:00",
          endTime: "18:00",
          positionId,
        },
      ],
    });
    const { token: oldToken } = await t.mutation(internal.notification.mutations.createMagicLink, {
      staffId,
      shopId,
      recruitmentId,
      accessKind: "submit",
      expiresAt: new Date(`${scenarioDate(4)}T00:00:00.000Z`).getTime(),
    });
    const oldAuthentication = await staff.verifyMagicLink(oldToken);
    expect(oldAuthentication.status).toBe("ok");
    if (oldAuthentication.status !== "ok") throw new Error("提出linkで認証できませんでした");

    await asManager.setShiftExclusion(staffId, true);

    const boardWhileExcluded = await asManager.getShiftBoardData(recruitmentId);
    expect(boardWhileExcluded?.staffs.map((entry) => entry._id)).toEqual([]);
    expect(boardWhileExcluded?.shiftAssignments).toEqual([
      {
        staffId,
        date: scenarioDate(7),
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      },
    ]);
    await expect(
      staff.getSubmissionPageData({ sessionToken: oldAuthentication.sessionToken, recruitmentId }),
    ).resolves.toEqual({ status: "unavailable", reason: "invalid_link" });
    await expect(staff.verifyMagicLink(oldToken)).resolves.toMatchObject({ status: "expired" });

    const [recruitmentData, reminderData] = await Promise.all([
      t.query(internal.notification.queries.getRecruitmentEmailData, { recruitmentId }),
      t.query(internal.notification.reminderQueries.getReminderEmailData, { recruitmentId }),
    ]);
    expect(recruitmentData?.staffEntries).toEqual([]);
    expect(reminderData?.staffEntries).toEqual([]);

    await asManager.setShiftExclusion(staffId, false);

    const boardAfterRestore = await asManager.getShiftBoardData(recruitmentId);
    expect(boardAfterRestore?.staffs.map((entry) => entry._id)).toEqual([staffId]);
    expect(boardAfterRestore?.shiftAssignments).toEqual(boardWhileExcluded?.shiftAssignments);
    await expect(asManager.sendOpenRecruitmentNotifications(staffId)).resolves.toEqual({ scheduled: true });
    await t.action(internal.notification.actions.sendOpenRecruitmentNotificationsForStaff, { staffId });

    const restoredState = await t.run(async (ctx) => {
      const links = await ctx.db
        .query("magicLinks")
        .withIndex("by_staffId_recruitmentId_accessKind", (q) =>
          q.eq("staffId", staffId).eq("recruitmentId", recruitmentId).eq("accessKind", "submit"),
        )
        .collect();
      const outbox = (await ctx.db.query("notificationOutbox").collect()).filter((entry) => entry.staffId === staffId);
      return { links, outbox };
    });
    const activeLinks = restoredState.links.filter((link) => !link.revokedAt);
    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0].token).not.toBe(oldToken);
    expect(restoredState.outbox).toHaveLength(1);
    expect(restoredState.outbox[0]).toMatchObject({
      shopId,
      recruitmentId,
      staffId,
      payload: { kind: "email", to: "eligibility-staff@example.com" },
    });

    const restoredAuthentication = await staff.verifyMagicLink(activeLinks[0].token);
    expect(restoredAuthentication.status).toBe("ok");
    if (restoredAuthentication.status !== "ok") throw new Error("復帰後の提出linkで認証できませんでした");
    const restoredPage = await staff.getSubmissionPageData({
      sessionToken: restoredAuthentication.sessionToken,
      recruitmentId,
    });
    expect(restoredPage.status).toBe("ok");
    if (restoredPage.status !== "ok") throw new Error("復帰後の提出画面を取得できませんでした");
    expect(restoredPage.data).toMatchObject({ staffName: "対象切替スタッフ", hasSubmitted: false });

    await staff.submitShiftRequests({
      sessionToken: restoredAuthentication.sessionToken,
      recruitmentId,
      acceptedLegal: true,
      requests: [{ date: scenarioDate(7), startTime: "12:00", endTime: "20:00" }],
    });
    const boardAfterSubmission = await asManager.getShiftBoardData(recruitmentId);
    expect(boardAfterSubmission?.staffs).toEqual([expect.objectContaining({ _id: staffId, isSubmitted: true })]);
    expect(boardAfterSubmission?.requestedSlots).toEqual([
      { staffId, date: scenarioDate(7), startTime: "12:00", endTime: "20:00" },
    ]);
  });
});
