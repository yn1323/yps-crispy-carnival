import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import { getTestOrganizationId, seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("staffRegistration/actions", () => {
  it("店舗担当者digestのoutboxにuserIdを残す", async () => {
    const t = convexTest(schema, modules);
    const { shopId, userId } = await t.run(async (ctx) => {
      const manager = await seedManagerShop(ctx, {
        subject: "user_mgr",
        email: "owner-digest@example.com",
        shopName: "参加申請通知店舗",
      });
      await ctx.db.insert("staffs", {
        excludedFromShift: false,
        shopId: manager.shopId,
        organizationId: manager.organizationId,
        organizationPersonId: manager.personId,
        userId: manager.userId,
        name: "管理スタッフ",
        email: "owner-digest@example.com",
        emailNormalized: "owner-digest@example.com",
        isDeleted: false,
      });
      return manager;
    });
    const asManager = t.withIdentity({ subject: "user_mgr" });
    const registrationLink = await asManager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
      expectedOrganizationId: await getTestOrganizationId(t, shopId),
      shopId,
    });
    await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
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
