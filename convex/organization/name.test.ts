import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("organization.mutations.updateOrganizationName", () => {
  it("非稼働店舗を選択中でも事業者名を変更し、同じrequestIdを冪等に扱う", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "organization_name_actor",
        shopName: "変更前店舗",
        plan: "pro",
      });
      await ctx.db.patch(base.shopId, { operatingStatus: "archived" });
      return base;
    });
    const requestId = "organization-name-request";
    const call = () =>
      t
        .withIdentity({ subject: "organization_name_actor" })
        .mutation(api.organization.mutations.updateOrganizationName, {
          shopId: ids.shopId,
          name: "株式会社 変更後",
          requestId,
        });

    await expect(call()).resolves.toEqual({ changed: true });
    await expect(call()).resolves.toEqual({ changed: false });

    const requestKey = await toAuditRequestKey(requestId);
    const state = await t.run(async (ctx) => ({
      organization: await ctx.db.get(ids.organizationId),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) =>
          q.eq("correlationId", `${ids.organizationId}:organization:name:${requestKey}`),
        )
        .collect(),
    }));
    expect(state.organization?.name).toBe("株式会社 変更後");
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      action: "organization.name_changed",
      fromState: "変更前店舗事業者",
      toState: "株式会社 変更後",
    });
    expect(state.audits[0]?.correlationId).not.toContain(requestId);
  });

  it("閲覧のみ管理者と契約制限中の通常変更を拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const readOnly = await seedOrganizationManagerShop(ctx, {
        subject: "organization_name_readonly",
        plan: "pro",
      });
      await ctx.db.patch(readOnly.memberId, { status: "readOnly" });
      const restricted = await seedOrganizationManagerShop(ctx, {
        subject: "organization_name_restricted",
        plan: "pro",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", restricted.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "restricted",
          reason: "freeConditionsNotMet",
          previousPlan: "pro",
          recoveryManagerPersonIds: [restricted.personId],
          previousActiveShopIds: [restricted.shopId],
          restrictedAt: Date.now(),
        },
      });
      return { readOnly, restricted };
    });

    await expect(
      t
        .withIdentity({ subject: "organization_name_readonly" })
        .mutation(api.organization.mutations.updateOrganizationName, {
          shopId: ids.readOnly.shopId,
          name: "変更不可",
          requestId: "organization-name-readonly",
        }),
    ).rejects.toThrow("Not found");
    await expect(
      t
        .withIdentity({ subject: "organization_name_restricted" })
        .mutation(api.organization.mutations.updateOrganizationName, {
          shopId: ids.restricted.shopId,
          name: "変更不可",
          requestId: "organization-name-restricted",
        }),
    ).rejects.toThrow("契約を確認するまで");
  });
});
