import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { MANAGER_SUBJECT, SCENARIO_NOW, scenarioDate, seedStaff } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("確定後スタッフ追加シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("確定後に追加したスタッフだけへ再確定通知と閲覧リンクを発行する", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const staff = scenario.staff();

    // Arrange: 既存スタッフだけを割り当てたシフトを確定し、初回通知を完了させる。
    const { existingStaffId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "confirmed-addition-manager@example.com",
        shopName: "確定後追加店舗",
      });
      const existingStaffId = await seedStaff(ctx, {
        shopId,
        name: "既存スタッフ",
        email: "confirmed-existing@example.com",
      });
      return { existingStaffId };
    });
    const periodStart = scenarioDate(7);
    const recruitmentId = await asManager.createRecruitment({
      periodStart,
      periodEnd: scenarioDate(9),
      deadline: scenarioDate(3),
    });
    await asManager.saveShiftAssignments({
      recruitmentId,
      assignments: [{ staffId: existingStaffId, date: periodStart, startTime: "10:00", endTime: "18:00" }],
    });
    await asManager.confirmRecruitment(recruitmentId);
    await t.action(internal.notification.actions.sendShiftConfirmationEmails, {
      recruitmentId,
      isResend: false,
    });

    const initialState = await t.run(async (ctx) => {
      const outbox = (await ctx.db.query("notificationOutbox").collect()).filter(
        (job) => job.recruitmentId === recruitmentId && job.dedupeKey.startsWith("email:confirmation:"),
      );
      const viewLinks = (await ctx.db.query("magicLinks").collect()).filter(
        (link) => link.recruitmentId === recruitmentId && link.accessKind === "view",
      );
      return { outbox, viewLinks };
    });
    expect(initialState.outbox.map((job) => job.dedupeKey)).toEqual([
      `email:confirmation:${recruitmentId}:${existingStaffId}:confirm`,
    ]);
    expect(initialState.viewLinks).toHaveLength(1);
    expect(initialState.viewLinks[0].staffId).toBe(existingStaffId);

    // Act: 確定後に追加したスタッフを割当に加え、変更対象への再通知を予約する。
    const [addedStaffId] = await asManager.addStaffs([
      { name: "確定後追加スタッフ", email: "confirmed-added@example.com" },
    ]);
    const boardAfterAddition = await asManager.getShiftBoardData(recruitmentId);
    expect(boardAfterAddition?.staffs.map((entry) => entry._id).sort()).toEqual([existingStaffId, addedStaffId].sort());
    expect(boardAfterAddition?.shiftAssignments).toHaveLength(1);
    expect(boardAfterAddition?.shiftAssignments[0]).toMatchObject({
      staffId: existingStaffId,
      date: periodStart,
      startTime: "10:00",
      endTime: "18:00",
    });

    await asManager.saveShiftAssignments({
      recruitmentId,
      assignments: [
        { staffId: existingStaffId, date: periodStart, startTime: "10:00", endTime: "18:00" },
        { staffId: addedStaffId, date: periodStart, startTime: "11:00", endTime: "17:00" },
      ],
    });
    vi.setSystemTime(SCENARIO_NOW + 1_000);
    const resendResult = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .mutation(api.shiftBoard.mutations.confirmRecruitment, {
        recruitmentId,
        intent: "resend",
      });
    expect(resendResult).toEqual({ status: "scheduled", notifiedStaffCount: 1 });

    const resendJobs = await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query("_scheduled_functions").collect();
      return jobs.filter(
        (job) =>
          job.name === "notification/actions:sendShiftConfirmationEmails" &&
          job.args[0]?.recruitmentId === recruitmentId &&
          job.args[0]?.isResend === true,
      );
    });
    expect(resendJobs).toHaveLength(1);
    const [resendJob] = resendJobs;
    expect(resendJob?.args[0]?.targetStaffIds).toEqual([addedStaffId]);
    expect(resendJob?.args[0]?.notificationRunId).toBe(SCENARIO_NOW + 1_000);

    await t.action(internal.notification.actions.sendShiftConfirmationEmails, {
      recruitmentId,
      isResend: true,
      targetStaffIds: [addedStaffId],
      notificationRunId: SCENARIO_NOW + 1_000,
    });

    // Assert: 既存スタッフには重複発行せず、新規スタッフの閲覧導線だけが増える。
    const finalState = await t.run(async (ctx) => {
      const outbox = (await ctx.db.query("notificationOutbox").collect()).filter(
        (job) => job.recruitmentId === recruitmentId && job.dedupeKey.startsWith("email:confirmation:"),
      );
      const viewLinks = (await ctx.db.query("magicLinks").collect()).filter(
        (link) => link.recruitmentId === recruitmentId && link.accessKind === "view",
      );
      const snapshots = (await ctx.db.query("shiftConfirmationSnapshots").collect()).filter(
        (snapshot) => snapshot.recruitmentId === recruitmentId,
      );
      return { outbox, viewLinks, snapshots };
    });
    expect(finalState.outbox.map((job) => job.dedupeKey).sort()).toEqual(
      [
        `email:confirmation:${recruitmentId}:${existingStaffId}:confirm`,
        `email:confirmation:${recruitmentId}:${addedStaffId}:resend:${SCENARIO_NOW + 1_000}`,
      ].sort(),
    );
    expect(finalState.outbox.filter((job) => job.staffId === existingStaffId)).toHaveLength(1);
    expect(finalState.outbox.filter((job) => job.staffId === addedStaffId)).toHaveLength(1);
    expect(finalState.viewLinks.filter((link) => link.staffId === existingStaffId)).toEqual(initialState.viewLinks);
    expect(finalState.viewLinks.filter((link) => link.staffId === addedStaffId)).toHaveLength(1);
    expect(finalState.snapshots.map((snapshot) => snapshot.staffId).sort()).toEqual(
      [existingStaffId, addedStaffId].sort(),
    );

    const addedViewLink = finalState.viewLinks.find((link) => link.staffId === addedStaffId);
    if (!addedViewLink) throw new Error("追加スタッフの閲覧リンクが見つかりません");
    const verification = await staff.verifyMagicLink(addedViewLink.token, "view");
    expect(verification.status).toBe("ok");
    if (verification.status !== "ok") throw new Error("追加スタッフの閲覧リンクを検証できません");

    const view = await staff.getShiftViewData({
      sessionToken: verification.sessionToken,
      recruitmentId,
    });
    expect(
      view?.assignments
        .map(({ staffId, date, startTime, endTime }) => ({ staffId, date, startTime, endTime }))
        .sort((a, b) => a.staffId.localeCompare(b.staffId)),
    ).toEqual(
      [
        {
          staffId: existingStaffId,
          date: periodStart,
          startTime: "10:00",
          endTime: "18:00",
        },
        {
          staffId: addedStaffId,
          date: periodStart,
          startTime: "11:00",
          endTime: "17:00",
        },
      ].sort((a, b) => a.staffId.localeCompare(b.staffId)),
    );
  });
});
