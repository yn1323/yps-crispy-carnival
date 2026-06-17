import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("staffRegistration/actions", () => {
  it("店舗担当者digestのoutboxにuserIdを残す", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await t.run(async (ctx) => {
      return await seedManagerShop(ctx, {
        subject: "user_mgr",
        email: "owner-digest@example.com",
        shopName: "参加申請通知店舗",
      });
    });
    const asManager = t.withIdentity({ subject: "user_mgr" });
    const registrationLink = await asManager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {});
    await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: registrationLink.token,
      name: "申請スタッフ",
      email: "digest-staff@example.com",
      acceptedLegal: true,
    });

    await t.action(internal.staffRegistration.actions.sendOwnerDailyDigest, {});

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      channel: "email",
      userId,
      dedupeKey: expect.stringMatching(/^email:staffRegistrationDailyDigest:/),
      payload: expect.objectContaining({
        context: "staffRegistration.sendOwnerDailyDigest",
      }),
    });
  });
});
