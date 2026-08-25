import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { seedCanonicalStaffLineRecipient, seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { SHOP_ACTIVATION_REMINDER_SUBJECT } from "../notification/templates";
import { SHOP_ACTIVATION_REMINDER_CONTEXT } from "../notificationOutbox/failureSuppress";
import { sendReminderRef } from "./refs";

async function setupReminderTarget() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const { shopId, userId, organizationId, personId } = await seedManagerShop(ctx, {
      subject: "manager",
      email: "manager@example.com",
      shopName: "通知店舗",
    });
    const managerStaffId = await ctx.db.insert("staffs", {
      shopId,
      organizationId,
      organizationPersonId: personId,
      name: "店長",
      email: "manager@example.com",
      emailNormalized: "manager@example.com",
      userId,
      isDeleted: false,
    });
    return { shopId, userId, managerStaffId };
  });
  return { t, ...ids };
}

describe("shopActivationReminder/actions", () => {
  it("対象店舗なら送信時点でemail outboxを作る", async () => {
    const { t, shopId, userId } = await setupReminderTarget();

    await t.action(sendReminderRef, { shopId });
    await t.action(sendReminderRef, { shopId });

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      channel: "email",
      status: "pending",
      shopId,
      userId,
      dedupeKey: `email:shopActivationReminder:${shopId}:${userId}`,
    });
    expect(jobs[0].payload).toMatchObject({
      kind: "email",
      to: "manager@example.com",
      subject: expect.stringContaining(SHOP_ACTIVATION_REMINDER_SUBJECT),
      context: SHOP_ACTIVATION_REMINDER_CONTEXT,
    });
    const payload = jobs[0].payload;
    if (payload.kind !== "email") throw new Error("email payload expected");
    expect(payload.html).toContain("シフトリでシフトを作成する");
  });

  it("manager staffがLINE連携済みならLINE outboxを作りemail fallbackを付ける", async () => {
    const { t, shopId, userId, managerStaffId } = await setupReminderTarget();
    await t.run(async (ctx) => {
      await seedCanonicalStaffLineRecipient(ctx, {
        staffId: managerStaffId,
        lineUserId: "U_manager",
        following: true,
      });
    });

    await t.action(sendReminderRef, { shopId });

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      channel: "line",
      status: "pending",
      shopId,
      userId,
      dedupeKey: `line:shopActivationReminder:${shopId}:${userId}`,
    });
    expect(jobs[0].payload).toMatchObject({
      kind: "line",
      toUserId: "U_manager",
      fallbackEmail: {
        dedupeKey: `email:shopActivationReminder:${shopId}:${userId}`,
        payload: {
          kind: "email",
          to: "manager@example.com",
          context: SHOP_ACTIVATION_REMINDER_CONTEXT,
        },
      },
    });
    const payload = jobs[0].payload;
    if (payload.kind !== "line") throw new Error("line payload expected");
    expect(payload.text).toContain("📅 シフト作成の続き");
    expect(payload.text).toContain("シフトリでシフトを作成する");
    expect(payload.message).toMatchObject({
      type: "flex",
      altText: expect.stringContaining("📅 シフト作成の続き"),
      contents: {
        body: {
          contents: expect.arrayContaining([expect.objectContaining({ text: "通知店舗\n📅 シフト作成の続き" })]),
        },
      },
    });
  });

  it("LINE Quota超過時はLINE連携済みでもemail outboxを作る", async () => {
    const { t, shopId, userId, managerStaffId } = await setupReminderTarget();
    await t.run(async (ctx) => {
      await seedCanonicalStaffLineRecipient(ctx, {
        staffId: managerStaffId,
        lineUserId: "U_manager",
        following: true,
      });
      await ctx.db.insert("lineQuotaStatus", {
        checkedAt: Date.now(),
        totalQuota: 200,
        consumed: 200,
        remaining: 0,
        status: "exceeded",
        plan: "communication",
      });
    });

    await t.action(sendReminderRef, { shopId });

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      channel: "email",
      shopId,
      userId,
      dedupeKey: `email:shopActivationReminder:${shopId}:${userId}`,
    });
  });

  it("本人以外のシフト対象staffがいればoutboxを作らない", async () => {
    const { t, shopId } = await setupReminderTarget();
    await t.run(async (ctx) => {
      await ctx.db.insert("staffs", {
        shopId,
        name: "田中",
        email: "tanaka@example.com",
        emailNormalized: "tanaka@example.com",
        isDeleted: false,
      });
    });

    await t.action(sendReminderRef, { shopId });

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toEqual([]);
  });
});
