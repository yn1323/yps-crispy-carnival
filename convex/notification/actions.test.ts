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
});
