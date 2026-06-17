import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("notification/actions", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("100人分の募集開始通知をoutboxにenqueueする", async () => {
    const t = convexTest(schema, modules);
    const recruitmentId = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "user_mgr",
        email: "manager@example.com",
        shopName: "100人店舗",
      });
      for (let i = 0; i < 100; i++) {
        await ctx.db.insert("staffs", {
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
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
      });
    });

    await t.action(internal.notification.actions.sendRecruitmentNotificationEmails, { recruitmentId });

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(100);
    expect(jobs.every((job) => job.channel === "email" && job.status === "pending")).toBe(true);
  });

  it("確定シフト通知はtargetStaffIdsのスタッフだけをoutboxにenqueueしてsnapshotを更新する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "user_mgr",
        email: "manager@example.com",
        shopName: "差分通知店舗",
      });
      const staffId1 = await ctx.db.insert("staffs", {
        shopId,
        name: "対象スタッフ",
        email: "target@example.com",
        isDeleted: false,
      });
      const staffId2 = await ctx.db.insert("staffs", {
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

    const [jobs, snapshots] = await Promise.all([
      t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect()),
      t.run(async (ctx) => await ctx.db.query("shiftConfirmationSnapshots").collect()),
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      staffId: ids.staffId1,
      dedupeKey: `email:confirmation:${ids.recruitmentId}:${ids.staffId1}:resend:123`,
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
      const staffId = await ctx.db.insert("staffs", {
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
});
