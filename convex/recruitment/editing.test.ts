import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { getManagerConfirmationReminderAt, getReminderScheduledAt } from "../_lib/dateFormat";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { SHIFT_BOARD_STAFF_LIMIT } from "../constants";

const originalDates = {
  periodStart: "2026-09-10",
  periodEnd: "2026-09-16",
  deadline: "2026-09-08",
  shopClosedDates: ["2026-09-12"],
};

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const manager = await seedManagerShop(ctx, {
      subject: "recruitment_editor",
      email: "editor@example.com",
      shopName: "編集店舗",
    });
    const staffId = await seedStaff(ctx, { shopId: manager.shopId, name: "提出者", email: "staff@example.com" });
    const pendingStaffId = await seedStaff(ctx, {
      shopId: manager.shopId,
      name: "未提出者",
      email: "pending@example.com",
    });
    const excludedStaffId = await seedStaff(ctx, {
      shopId: manager.shopId,
      name: "対象外",
      email: "excluded@example.com",
      excludedFromShift: true,
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId: manager.shopId,
      ...originalDates,
      status: "open",
      isDeleted: false,
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      draftSavedAt: Date.now() - 1000,
      lastReminderSentAt: Date.now() - 2000,
    });
    const positionId = await ctx.db.insert("positions", {
      shopId: manager.shopId,
      name: "通常",
      color: "#000000",
      sortOrder: 0,
      isDefault: true,
      isDeleted: false,
    });
    const firstSubmittedAt = Date.now() - 3000;
    const submissionId = await ctx.db.insert("shiftSubmissions", {
      recruitmentId,
      staffId,
      firstSubmittedAt,
      submittedAt: firstSubmittedAt,
    });
    for (const date of ["2026-09-10", "2026-09-16"]) {
      await ctx.db.insert("shiftSubmissionSlots", {
        recruitmentId,
        staffId,
        submissionId,
        date,
        startTime: "09:00",
        endTime: "17:00",
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId,
        date,
        positionId,
        startTime: "10:00",
        endTime: "16:00",
      });
    }
    await ctx.db.insert("recruitmentStats", {
      recruitmentId,
      shopId: manager.shopId,
      submittedCount: 1,
      activeStaffCountSnapshot: 2,
      updatedAt: Date.now(),
    });
    return {
      ...manager,
      recruitmentId,
      staffId,
      pendingStaffId,
      excludedStaffId,
      submissionId,
      firstSubmittedAt,
      positionId,
    };
  });
  const asManager = t.withIdentity({ subject: "recruitment_editor" });
  const args = {
    recruitmentId: ids.recruitmentId,
    shopId: ids.shopId,
    expectedOrganizationId: ids.organizationId,
    expectedEditVersion: 0,
    ...originalDates,
  };
  return { t, ids, asManager, args };
}

async function state(t: Awaited<ReturnType<typeof setup>>["t"]) {
  return await t.run(async (ctx) => ({
    recruitments: await ctx.db.query("recruitments").collect(),
    submissions: await ctx.db.query("shiftSubmissions").collect(),
    slots: await ctx.db.query("shiftSubmissionSlots").collect(),
    dates: await ctx.db.query("shiftSubmissionDates").collect(),
    assignments: await ctx.db.query("shiftAssignments").collect(),
    stats: await ctx.db.query("recruitmentStats").collect(),
    operations: await ctx.db.query("notificationFanoutOperations").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}

describe("recruitment/updateRecruitment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T10:00:00+09:00"));
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    { label: "期間拡張", change: { periodEnd: "2026-09-17" }, reset: true },
    { label: "定休日削除", change: { shopClosedDates: [] }, reset: true },
    { label: "期間縮小と定休日削除", change: { periodEnd: "2026-09-15", shopClosedDates: [] }, reset: true },
    { label: "締切のみ", change: { deadline: "2026-09-09" }, reset: false },
    { label: "期間縮小", change: { periodEnd: "2026-09-15" }, reset: false },
    { label: "定休日追加", change: { shopClosedDates: ["2026-09-12", "2026-09-13"] }, reset: false },
    {
      label: "拡張した日が定休日",
      change: { periodEnd: "2026-09-17", shopClosedDates: ["2026-09-12", "2026-09-17"] },
      reset: false,
    },
  ])("$label は新しい勤務対象日の有無で未提出化を決める", async ({ change, reset }) => {
    const { t, ids, asManager, args } = await setup();
    await expect(
      asManager.mutation(api.recruitment.mutations.updateRecruitment, { ...args, ...change }),
    ).resolves.toEqual({ changed: true, requiresResubmission: reset });
    const result = await state(t);
    expect(result.submissions).toHaveLength(1);
    expect(result.submissions[0]).toMatchObject({
      firstSubmittedAt: ids.firstSubmittedAt,
      submittedAt: ids.firstSubmittedAt,
    });
    expect(result.submissions[0].needsResubmission === true).toBe(reset);
    expect(result.stats[0]).toMatchObject({ submittedCount: reset ? 0 : 1, activeStaffCountSnapshot: 2 });
    expect(result.recruitments[0]).toMatchObject({
      editVersion: 1,
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      draftSavedAt: Date.now() - 1000,
    });
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      purpose: "recruitment_update",
      recruitmentUpdate: { before: originalDates, after: { ...originalDates, ...change } },
    });
    expect(new Set(result.operations[0].targetStaffIds)).toEqual(new Set([ids.staffId, ids.pendingStaffId]));
  });

  it("対象外の希望と割当を削除し、残る日の内容は保持する", async () => {
    const { t, asManager, args } = await setup();
    await asManager.mutation(api.recruitment.mutations.updateRecruitment, { ...args, periodEnd: "2026-09-15" });
    const result = await state(t);
    expect(result.slots.map((entry) => entry.date)).toEqual(["2026-09-10"]);
    expect(
      result.assignments.map((entry) => ({
        date: entry.date,
        startTime: "startTime" in entry ? entry.startTime : null,
      })),
    ).toEqual([{ date: "2026-09-10", startTime: "10:00" }]);
  });

  it("日ごとの希望と割当も定休日に変えた日は削除する", async () => {
    const { t, ids, asManager, args } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.recruitmentId, { submissionPattern: { kind: "dateOnly" } });
      for (const entry of await ctx.db.query("shiftSubmissionSlots").collect()) await ctx.db.delete(entry._id);
      for (const entry of await ctx.db.query("shiftAssignments").collect()) await ctx.db.delete(entry._id);
      for (const date of ["2026-09-10", "2026-09-16"]) {
        await ctx.db.insert("shiftSubmissionDates", {
          recruitmentId: ids.recruitmentId,
          staffId: ids.staffId,
          submissionId: ids.submissionId,
          date,
        });
        await ctx.db.insert("shiftAssignments", {
          recruitmentId: ids.recruitmentId,
          staffId: ids.staffId,
          date,
          positionId: ids.positionId,
          startTime: "09:00",
          endTime: "22:00",
        });
      }
    });
    await asManager.mutation(api.recruitment.mutations.updateRecruitment, {
      ...args,
      shopClosedDates: ["2026-09-12", "2026-09-16"],
    });
    const result = await state(t);
    expect(result.dates.map((entry) => entry.date)).toEqual(["2026-09-10"]);
    expect(result.assignments.map((entry) => entry.date)).toEqual(["2026-09-10"]);
  });

  it("正規化後に変更がなければ状態・通知・催促を更新しない", async () => {
    const { t, asManager, args } = await setup();
    const before = await state(t);
    await expect(
      asManager.mutation(api.recruitment.mutations.updateRecruitment, {
        ...args,
        shopClosedDates: ["2026-09-12", "2026-09-12"],
      }),
    ).resolves.toEqual({ changed: false, requiresResubmission: false });
    expect(await state(t)).toEqual(before);
  });

  it("重なる募集があっても編集でき、別保存の通知を両方残す", async () => {
    const { t, asManager, args } = await setup();
    await asManager.mutation(api.recruitment.mutations.createRecruitment, {
      shopId: args.shopId,
      expectedOrganizationId: args.expectedOrganizationId,
      ...originalDates,
      deadline: "2026-09-09",
    });
    await asManager.mutation(api.recruitment.mutations.updateRecruitment, { ...args, deadline: "2026-09-09" });
    await asManager.mutation(api.recruitment.mutations.updateRecruitment, {
      ...args,
      expectedEditVersion: 1,
      periodEnd: "2026-09-17",
    });
    const result = await state(t);
    const operations = result.operations.filter((entry) => entry.purpose === "recruitment_update");
    expect(operations).toHaveLength(2);
    expect(operations.every((entry) => entry.status === "pending")).toBe(true);
    expect(new Set(operations.map((entry) => entry.operationKey)).size).toBe(2);
    expect(
      operations
        .sort((left, right) => left.operationKey.localeCompare(right.operationKey))
        .map((entry) => entry.recruitmentUpdate),
    ).toEqual([
      { before: originalDates, after: { ...originalDates, deadline: "2026-09-09" } },
      {
        before: { ...originalDates, deadline: "2026-09-09" },
        after: { ...originalDates, periodEnd: "2026-09-17" },
      },
    ]);
  });

  it("未来の催促を新しい版と締切で予約し直す", async () => {
    const { t, asManager, args } = await setup();
    await asManager.mutation(api.recruitment.mutations.updateRecruitment, { ...args, deadline: "2026-09-09" });
    const result = await state(t);
    expect(result.recruitments[0]).toMatchObject({ reminderScheduledAt: getReminderScheduledAt("2026-09-09") });
    expect(result.recruitments[0].lastReminderSentAt).toBeUndefined();
    expect(
      result.scheduled
        .filter((job) => job.name.includes("Reminder"))
        .map((job) => ({ time: job.scheduledTime, version: job.args[0]?.recruitmentVersionAtOrigin })),
    ).toEqual([
      { time: getReminderScheduledAt("2026-09-09"), version: 1 },
      { time: getManagerConfirmationReminderAt("2026-09-09"), version: 1 },
    ]);
  });

  it.each(["2026-09-07T17:00:00+09:00", "2026-09-08T23:50:00+09:00"])(
    "催促予定が同時刻か過去なら変更通知だけを予約する: %s",
    async (now) => {
      const { t, asManager, args } = await setup();
      vi.setSystemTime(new Date(now));
      await asManager.mutation(api.recruitment.mutations.updateRecruitment, { ...args, periodEnd: "2026-09-17" });
      const result = await state(t);
      expect(result.recruitments[0].reminderScheduledAt).toBeUndefined();
      expect(result.scheduled.filter((job) => job.name === "notification/reminderActions:sendReminderEmails")).toEqual(
        [],
      );
      expect(result.operations).toHaveLength(1);
    },
  );

  it.each([
    { label: "確定済み", patch: { status: "confirmed", confirmedAt: Date.now() } },
    { label: "削除済み", patch: { isDeleted: true } },
    { label: "開始済み", patch: { periodStart: "2026-09-06" } },
    { label: "締切経過", patch: { deadline: "2026-09-05" } },
  ] satisfies Array<{ label: string; patch: Partial<Doc<"recruitments">> }>)(
    "$label は変更後の日付にかかわらず編集できない",
    async ({ patch }) => {
      const { t, ids, asManager, args } = await setup();
      await t.run(async (ctx) => await ctx.db.patch(ids.recruitmentId, patch));
      const before = await state(t);
      await expect(
        asManager.mutation(api.recruitment.mutations.updateRecruitment, { ...args, deadline: "2026-09-09" }),
      ).rejects.toThrow();
      expect(await state(t)).toEqual(before);
    },
  );

  it("未認証・他店舗・古い版の編集を副作用なしで拒否する", async () => {
    const { t, asManager, args } = await setup();
    const other = await t.run(
      async (ctx) =>
        await seedManagerShop(ctx, { subject: "other_editor", email: "other@example.com", shopName: "別店舗" }),
    );
    const before = await state(t);
    await expect(
      t.mutation(api.recruitment.mutations.updateRecruitment, { ...args, deadline: "2026-09-09" }),
    ).rejects.toThrow();
    await expect(
      t.withIdentity({ subject: "other_editor" }).mutation(api.recruitment.mutations.updateRecruitment, {
        ...args,
        shopId: other.shopId,
        expectedOrganizationId: other.organizationId,
        deadline: "2026-09-09",
      }),
    ).rejects.toThrow("Not found");
    await expect(
      asManager.mutation(api.recruitment.mutations.updateRecruitment, {
        ...args,
        expectedEditVersion: 1,
        deadline: "2026-09-09",
      }),
    ).rejects.toThrow("RECRUITMENT_CHANGED");
    expect(await state(t)).toEqual(before);
  });

  it.each([
    { periodStart: "2026-09-06" },
    { deadline: "2026-09-05" },
    { deadline: "2026-09-10" },
    { periodEnd: "2026-09-09" },
    { periodEnd: "2026-10-11" },
    { periodEnd: "2026-09-31" },
    { shopClosedDates: ["2026-09-09"] },
    { periodEnd: "2026-09-10", shopClosedDates: ["2026-09-10"] },
  ])("不正な日付を保存せず、関連データも変えない: %j", async (change) => {
    const { t, asManager, args } = await setup();
    const before = await state(t);
    await expect(
      asManager.mutation(api.recruitment.mutations.updateRecruitment, { ...args, ...change }),
    ).rejects.toThrow();
    expect(await state(t)).toEqual(before);
  });

  it("読取上限の超過は途中削除せず保存全体を拒否する", async () => {
    const { t, ids, asManager, args } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < SHIFT_BOARD_STAFF_LIMIT; i++)
        await ctx.db.insert("shiftSubmissions", {
          recruitmentId: ids.recruitmentId,
          staffId: ids.staffId,
          firstSubmittedAt: Date.now(),
          submittedAt: Date.now(),
        });
    });
    const before = await state(t);
    await expect(
      asManager.mutation(api.recruitment.mutations.updateRecruitment, { ...args, periodEnd: "2026-09-15" }),
    ).rejects.toThrow("上限");
    expect(await state(t)).toEqual(before);
  });
});
