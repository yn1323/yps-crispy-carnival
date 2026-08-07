import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import { seedOrganizationManagerShop, testAuthTokenIdentifier } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("retired account email mutations", () => {
  it("旧preflightはClerk変更前に再読み込みを案内する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await seedOrganizationManagerShop(ctx, {
        subject: "retired_account_email",
        email: "before@example.com",
      });
    });

    await expect(
      t
        .withIdentity({ subject: "retired_account_email" })
        .mutation(api.accountEmail.mutations.preflight, { email: "after@example.com" }),
    ).rejects.toThrow("画面を再読み込みし、右上の「アカウント設定」をご利用ください");
  });

  it("preflight通過済みの旧clientでもusers・person・staffを変更しない", async () => {
    const t = convexTest(schema, modules);
    const seed = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, {
        subject: "retired_account_email_sync",
        email: "before@example.com",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: manager.shopId,
        organizationId: manager.organizationId,
        organizationPersonId: manager.personId,
        userId: manager.userId,
        name: "管理者",
        email: "before@example.com",
        emailNormalized: "before@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      return { ...manager, staffId };
    });

    await expect(
      t.mutation(internal.accountEmail.mutations.prepareSync, {
        authTokenIdentifier: testAuthTokenIdentifier("retired_account_email_sync"),
        requestId: "legacy-account-email-request",
      }),
    ).resolves.toEqual({ status: "conflict" });
    await expect(
      t.mutation(internal.accountEmail.mutations.syncPrimary, {
        authTokenIdentifier: testAuthTokenIdentifier("retired_account_email_sync"),
        email: "after@example.com",
        requestKey: "a".repeat(64),
      }),
    ).resolves.toEqual({ status: "conflict" });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(seed.userId),
      person: await ctx.db.get(seed.personId),
      staff: await ctx.db.get(seed.staffId),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.user).toMatchObject({ email: "before@example.com" });
    expect(state.person).toMatchObject({ email: "before@example.com" });
    expect(state.staff).toMatchObject({ email: "before@example.com" });
    expect(state.audits).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });
});
