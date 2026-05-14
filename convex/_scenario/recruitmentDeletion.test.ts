import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { MANAGER_SUBJECT, SCENARIO_NOW, scenarioDate, seedStaff } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("シフト募集削除シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("提出・下書き・確定済みの募集を削除すると管理画面とスタッフ導線から失効する", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const staff = scenario.staff();

    // Arrange: 店舗、スタッフ、募集を作り、提出用リンクからスタッフセッションを発行する。
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "delete-flow-manager@example.com",
        shopName: "募集削除店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "削除確認スタッフ",
        email: "delete-flow-staff@example.com",
      });
      return { shopId, staffId };
    });
    const recruitmentInput = {
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(9),
      deadline: scenarioDate(3),
    };
    const recruitmentId = await asManager.createRecruitment(recruitmentInput);
    const { token: submitToken } = await t.mutation(internal.notification.mutations.createMagicLink, {
      staffId: ids.staffId,
      shopId: ids.shopId,
      recruitmentId,
      accessKind: "submit",
    });
    const submitAuth = await staff.verifyMagicLink(submitToken);
    expect(submitAuth.status).toBe("ok");
    if (submitAuth.status !== "ok") throw new Error("submit link should authenticate before deletion");

    // Act: 希望提出、下書き保存、確定、閲覧用リンクの発行まで進める。
    await staff.submitShiftRequests({
      sessionToken: submitAuth.sessionToken,
      recruitmentId,
      acceptedLegal: true,
      requests: [{ date: recruitmentInput.periodStart, startTime: "10:00", endTime: "18:00" }],
    });
    await asManager.saveShiftAssignments({
      recruitmentId,
      assignments: [{ staffId: ids.staffId, date: recruitmentInput.periodStart, startTime: "11:00", endTime: "17:00" }],
    });
    await asManager.confirmRecruitment(recruitmentId);
    const { token: viewToken } = await t.mutation(internal.notification.mutations.createMagicLink, {
      staffId: ids.staffId,
      shopId: ids.shopId,
      recruitmentId,
      accessKind: "view",
    });
    const viewAuth = await staff.verifyMagicLink(viewToken, "view");
    expect(viewAuth.status).toBe("ok");
    if (viewAuth.status !== "ok") throw new Error("view link should authenticate before deletion");

    // Assert: 削除前は管理画面・スタッフ閲覧・通知データから募集が見える。
    expect((await asManager.getDashboardRecruitments()).page.map((r) => r._id)).toContain(recruitmentId);
    expect(await asManager.getShiftBoardData(recruitmentId)).not.toBeNull();
    expect(await staff.getShiftViewData({ sessionToken: viewAuth.sessionToken, recruitmentId })).not.toBeNull();
    expect(await t.query(internal.notification.queries.getConfirmationEmailData, { recruitmentId })).not.toBeNull();

    // Act: シフト担当者が募集を削除する。
    await asManager.deleteRecruitment(recruitmentId);

    // Assert: 管理画面とスタッフ向け導線では削除済み募集として扱われる。
    expect((await asManager.getDashboardRecruitments()).page.map((r) => r._id)).not.toContain(recruitmentId);
    expect(await asManager.getShiftBoardData(recruitmentId)).toBeNull();
    expect(await staff.getRecruitmentInfo(recruitmentId)).toBeNull();
    expect(await staff.getSubmissionPageData({ sessionToken: submitAuth.sessionToken, recruitmentId })).toBeNull();
    expect(await staff.getShiftViewData({ sessionToken: viewAuth.sessionToken, recruitmentId })).toBeNull();
    await expect(
      staff.submitShiftRequests({
        sessionToken: submitAuth.sessionToken,
        recruitmentId,
        requests: [{ date: recruitmentInput.periodStart, startTime: "12:00", endTime: "19:00" }],
      }),
    ).rejects.toThrow("Not found");
    expect(await staff.verifyMagicLink(submitToken)).toMatchObject({ status: "expired", recruitmentId });
    expect(await staff.verifyMagicLink(viewToken, "view")).toMatchObject({ status: "expired", recruitmentId });

    // Assert: 未実行通知 action や再発行導線が参照する internal query も送信対象を返さない。
    expect(await t.query(internal.notification.queries.getRecruitmentEmailData, { recruitmentId })).toBeNull();
    expect(await t.query(internal.notification.queries.getConfirmationEmailData, { recruitmentId })).toBeNull();
    expect(await t.query(internal.notification.reminderQueries.getReminderEmailData, { recruitmentId })).toBeNull();
    expect(
      await t.query(internal.notification.queries.getReissueEmailData, { staffId: ids.staffId, recruitmentId }),
    ).toBeNull();
  });
});
