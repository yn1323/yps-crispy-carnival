import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { seedSession, seedStaff } from "../_test/scenarioBuilders";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const NOW = new Date("2026-09-06T10:00:00+09:00").getTime();

describe("募集編集から再提出までのシナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("提出と下書き保存後に縮小・再拡張しても削除データを復活させず、再提出の希望を手動割当待ちにする", async () => {
    const t = convexTest(schema, modules);
    const asManager = t.withIdentity({ subject: "edit_scenario_manager" });
    const ids = await t.run(async (ctx) => {
      const manager = await seedManagerShop(ctx, {
        subject: "edit_scenario_manager",
        email: "edit-scenario@example.com",
        shopName: "募集編集店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId: manager.shopId,
        name: "提出スタッフ",
        email: "edit-scenario-staff@example.com",
      });
      return { ...manager, staffId };
    });
    const scope = { shopId: ids.shopId, expectedOrganizationId: ids.organizationId };
    const conditions = {
      periodStart: "2026-09-10",
      periodEnd: "2026-09-16",
      deadline: "2026-09-08",
      shopClosedDates: [],
    };
    const recruitmentId = await asManager.mutation(api.recruitment.mutations.createRecruitment, {
      ...scope,
      ...conditions,
    });
    await t.run(
      async (ctx) =>
        await seedSession(ctx, {
          sessionToken: "edit-scenario-session",
          recruitmentId,
          staffId: ids.staffId,
          shopId: ids.shopId,
        }),
    );
    const staffScope = { sessionToken: "edit-scenario-session", accessKind: "submit" as const, recruitmentId };
    const requests = ["2026-09-10", "2026-09-16"].map((date) => ({ date, startTime: "09:00", endTime: "17:00" }));
    vi.setSystemTime(NOW + 1000);
    await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
      ...staffScope,
      acceptedLegal: true,
      expectedEditVersion: 0,
      submission: { kind: "time", requests },
    });
    vi.setSystemTime(NOW + 2000);
    const assignments = requests.map((request) => ({
      ...request,
      staffId: ids.staffId,
      startTime: "10:00",
      endTime: "16:00",
    }));
    await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
      ...scope,
      recruitmentId,
      expectedEditVersion: 0,
      assignments,
    });

    await asManager.mutation(api.recruitment.mutations.updateRecruitment, {
      ...scope,
      recruitmentId,
      expectedEditVersion: 0,
      ...conditions,
      periodEnd: "2026-09-15",
    });
    await asManager.mutation(api.recruitment.mutations.updateRecruitment, {
      ...scope,
      recruitmentId,
      expectedEditVersion: 1,
      ...conditions,
    });

    const afterReopen = await asManager.query(api.shiftBoard.queries.getShiftBoardData, {
      ...scope,
      recruitmentId,
      refreshDayKey: "2026-09-06",
    });
    expect(afterReopen?.recruitment).toMatchObject({ editVersion: 2, draftSavedAt: NOW + 2000 });
    expect(afterReopen?.staffs.find((staff) => staff._id === ids.staffId)).toMatchObject({
      isSubmitted: false,
      wasSubmittedAtDraft: true,
    });
    expect(afterReopen?.requestedSlots.map((entry) => entry.date)).toEqual(["2026-09-10"]);
    expect(afterReopen?.shiftAssignments.map((entry) => entry.date)).toEqual(["2026-09-10"]);
    await expect(
      asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        ...scope,
        recruitmentId,
        expectedEditVersion: 0,
        assignments,
      }),
    ).rejects.toThrow("RECRUITMENT_CHANGED");
    await expect(
      asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
        ...scope,
        recruitmentId,
        expectedEditVersion: 0,
      }),
    ).rejects.toThrow("RECRUITMENT_CHANGED");
    expect(await t.query(api.shiftSubmission.queries.getSubmissionResult, staffScope)).toEqual({
      status: "unavailable",
    });
    const page = await t.query(api.shiftSubmission.queries.getSubmissionPageData, staffScope);
    expect(page.status).toBe("ok");
    if (page.status !== "ok") throw new Error("submission page unavailable");
    expect(page.data).toMatchObject({ hasSubmitted: false, editVersion: 2, existingRequests: [requests[0]] });

    vi.setSystemTime(NOW + 3000);
    await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
      ...staffScope,
      expectedEditVersion: 2,
      submission: { kind: "time", requests },
    });
    const afterSubmit = await asManager.query(api.shiftBoard.queries.getShiftBoardData, {
      ...scope,
      recruitmentId,
      refreshDayKey: "2026-09-06",
    });
    expect(afterSubmit?.staffs.find((staff) => staff._id === ids.staffId)).toMatchObject({
      isSubmitted: true,
      wasSubmittedAtDraft: true,
    });
    expect(afterSubmit?.requestedSlots.map((entry) => entry.date).sort()).toEqual(["2026-09-10", "2026-09-16"]);
    expect(afterSubmit?.shiftAssignments.map((entry) => entry.date)).toEqual(["2026-09-10"]);
    expect(await t.query(api.shiftSubmission.queries.getSubmissionResult, staffScope)).toEqual({
      status: "submitted",
      shopName: "募集編集店舗",
    });
    const result = await t.run(async (ctx) => ({
      submissions: await ctx.db.query("shiftSubmissions").collect(),
      stats: await ctx.db.query("recruitmentStats").collect(),
    }));
    expect(result.submissions).toHaveLength(1);
    expect(result.submissions[0]).toMatchObject({ firstSubmittedAt: NOW + 1000, submittedAt: NOW + 3000 });
    expect(result.stats).toHaveLength(1);
    expect(result.stats[0]).toMatchObject({ submittedCount: 1, activeStaffCountSnapshot: 1 });
  });
});
