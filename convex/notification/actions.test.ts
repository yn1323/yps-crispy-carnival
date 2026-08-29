import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedCanonicalStaffLineRecipient, seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { NOTIFICATION_FANOUT_BATCH_SIZE, NOTIFICATION_FANOUT_SCOPE_LIMIT } from "../constants";

describe("notification/actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00+09:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("Pro上限50人分の募集開始通知をoutboxにenqueueする", async () => {
    const t = convexTest(schema, modules);
    const recruitmentId = await t.run(async (ctx) => {
      const { shopId, userId } = await seedManagerShop(ctx, {
        subject: "user_mgr",
        email: "manager@notification.invalid",
        shopName: "50人店舗",
      });
      await seedStaff(ctx, {
        shopId,
        userId,
        name: "管理者",
        email: "manager@notification.invalid",
      });
      for (let i = 0; i < NOTIFICATION_FANOUT_SCOPE_LIMIT - 1; i++) {
        await seedStaff(ctx, {
          shopId,
          name: `スタッフ${i + 1}`,
          email: `staff-${i + 1}@example.com`,
          isDeleted: false,
        });
      }
      return await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
    });

    // 1 action = 1 bounded batch。通常schedulerと同じactionを繰り返し、永続cursorから再開する。
    for (let batch = 0; batch < Math.ceil(NOTIFICATION_FANOUT_SCOPE_LIMIT / NOTIFICATION_FANOUT_BATCH_SIZE); batch++) {
      await t.action(internal.notification.actions.sendRecruitmentNotificationEmails, { recruitmentId });
    }

    const state = await t.run(async (ctx) => ({
      histories: await ctx.db.query("notificationHistory").collect(),
      jobs: await ctx.db.query("notificationOutbox").collect(),
      operations: await ctx.db.query("notificationFanoutOperations").collect(),
    }));
    expect(state.jobs).toHaveLength(NOTIFICATION_FANOUT_SCOPE_LIMIT);
    expect(state.jobs.every((job) => job.channel === "email" && job.status === "pending")).toBe(true);
    expect(state.histories).toHaveLength(NOTIFICATION_FANOUT_SCOPE_LIMIT);
    expect(state.operations).toEqual([
      expect.objectContaining({
        recruitmentId,
        cursor: NOTIFICATION_FANOUT_SCOPE_LIMIT,
        status: "completed",
      }),
    ]);
    expect(
      state.histories
        .map(({ outboxId, notificationKind, displayTitle }) => ({ outboxId, notificationKind, displayTitle }))
        .sort((a, b) => a.outboxId.localeCompare(b.outboxId)),
    ).toEqual(
      state.jobs
        .map((job) => {
          if (job.payload.kind !== "email") throw new Error("募集通知がメールpayloadではありません");
          return {
            outboxId: job._id,
            notificationKind: "shift.recruitment",
            displayTitle: job.payload.subject,
          };
        })
        .sort((a, b) => a.outboxId.localeCompare(b.outboxId)),
    );
  }, 60_000);

  it("確定シフト通知はtargetStaffIdsのスタッフだけをoutboxにenqueueしてsnapshotを更新する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "user_mgr",
        email: "manager@notification.invalid",
        shopName: "差分通知店舗",
      });
      const staffId1 = await seedStaff(ctx, {
        shopId,
        name: "対象スタッフ",
        email: "target@example.com",
        isDeleted: false,
      });
      const staffId2 = await seedStaff(ctx, {
        shopId,
        name: "対象外スタッフ",
        email: "ignored@example.com",
        isDeleted: false,
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
        periodStart: "2026-07-01",
        periodEnd: "2026-07-02",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId: staffId1,
        date: "2026-07-01",
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId: staffId2,
        date: "2026-07-01",
        startTime: "12:00",
        endTime: "20:00",
        positionId,
      });
      return { recruitmentId, staffId1, staffId2, positionId };
    });

    await t.action(internal.notification.actions.sendShiftConfirmationEmails, {
      recruitmentId: ids.recruitmentId,
      isResend: true,
      targetStaffIds: [ids.staffId1],
      notificationRunId: 123,
    });

    const [jobs, histories, snapshots] = await Promise.all([
      t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect()),
      t.run(async (ctx) => await ctx.db.query("notificationHistory").collect()),
      t.run(async (ctx) => await ctx.db.query("shiftConfirmationSnapshots").collect()),
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      staffId: ids.staffId1,
      dedupeKey: `email:confirmation:${ids.recruitmentId}:${ids.staffId1}:resend:123`,
    });
    expect(histories).toHaveLength(1);
    if (jobs[0]?.payload.kind !== "email") throw new Error("確定通知がメールpayloadではありません");
    expect(jobs[0].payload.html).toContain("10:00-18:00");
    expect(jobs[0].payload.html).not.toContain("12:00-20:00");
    expect(histories[0]).toMatchObject({
      outboxId: jobs[0]._id,
      staffId: ids.staffId1,
      notificationKind: "shift.confirmation",
      displayTitle: jobs[0].payload.subject,
    });
    expect(jobs.map((job) => job.staffId)).not.toContain(ids.staffId2);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      recruitmentId: ids.recruitmentId,
      staffId: ids.staffId1,
      assignments: [
        {
          date: "2026-07-01",
          startTime: "10:00",
          endTime: "18:00",
          positionId: ids.positionId,
        },
      ],
    });
  });

  it("確定シフト通知がenqueueされなかったスタッフはsnapshotを更新しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "user_mgr",
        email: "manager@example.com",
        shopName: "空メール店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "メールなしスタッフ",
        email: "",
        isDeleted: false,
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
        periodStart: "2026-07-01",
        periodEnd: "2026-07-01",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId,
        date: "2026-07-01",
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      });
      return { recruitmentId, staffId };
    });

    await t.action(internal.notification.actions.sendShiftConfirmationEmails, {
      recruitmentId: ids.recruitmentId,
      isResend: true,
      targetStaffIds: [ids.staffId],
      notificationRunId: 456,
    });

    const [jobs, snapshots] = await Promise.all([
      t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect()),
      t.run(async (ctx) => await ctx.db.query("shiftConfirmationSnapshots").collect()),
    ]);
    expect(jobs).toHaveLength(0);
    expect(snapshots).toHaveLength(0);
  });

  it("LINEのシフト変更履歴タイトルは通知名の後ろに対象期間を付ける", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "user_mgr",
        email: "manager@notification.invalid",
        shopName: "変更通知店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "LINEスタッフ",
        email: "line-staff@notification.invalid",
        isDeleted: false,
      });
      await seedCanonicalStaffLineRecipient(ctx, {
        staffId,
        lineUserId: "U_change_history",
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
        periodStart: "2026-07-01",
        periodEnd: "2026-07-02",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId,
        date: "2026-07-01",
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      });
      return { recruitmentId, staffId };
    });

    await t.action(internal.notification.actions.sendShiftConfirmationEmails, {
      recruitmentId: ids.recruitmentId,
      isResend: true,
      targetStaffIds: [ids.staffId],
      notificationRunId: 789,
    });

    const histories = await t.run(async (ctx) => await ctx.db.query("notificationHistory").collect());
    expect(
      histories.map(({ channel, notificationKind, displayTitle }) => ({ channel, notificationKind, displayTitle })),
    ).toEqual([
      {
        channel: "line",
        notificationKind: "shift.confirmation",
        displayTitle: "シフト変更のお知らせ 7/1(水)〜7/2(木)",
      },
    ]);
  });
});
