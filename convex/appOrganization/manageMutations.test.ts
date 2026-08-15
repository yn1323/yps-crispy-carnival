import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { seedOrganizationManagerShop, testAuthTokenIdentifier } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

async function manageWriteState(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => ({
    organizations: await ctx.db.query("organizations").collect(),
    shops: await ctx.db.query("shops").collect(),
    members: await ctx.db.query("organizationMembers").collect(),
    people: await ctx.db.query("organizationPeople").collect(),
    billingStates: await ctx.db.query("organizationBillingStates").collect(),
    audits: await ctx.db.query("organizationAuditEvents").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}

describe("app organization manage mutations", () => {
  beforeEach(() => vi.stubEnv("FEATURE_ORGANIZATION_CREATION", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("current orgのcanonical active所属から新しい組織を作り、organizationIdを返す", async () => {
    const t = convexTest(schema, modules);
    const actorIds = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "app_manage_create_organization",
        complimentary: true,
      }),
    );

    const result = await t
      .withIdentity({ subject: "app_manage_create_organization" })
      .mutation(api.setup.mutations.createOrganizationForApp, {
        organizationId: actorIds.organizationId,
        shopName: "新しい事業の店舗",
        regularClosedDays: ["sun"],
        submissionPattern: { kind: "dateOnly" },
        requestId: "app-create-organization",
      });

    expect(result).toMatchObject({ created: true });
    expect(result.organizationId).not.toBe(actorIds.organizationId);
    const created = await t.run(async (ctx) => ({
      organization: await ctx.db.get(result.organizationId),
      shop: await ctx.db.get(result.shopId),
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", result.organizationId))
        .unique(),
      members: await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) =>
          q.eq("userId", actorIds.userId).eq("organizationId", result.organizationId),
        )
        .collect(),
    }));
    expect(created.organization).toMatchObject({ createdByUserId: actorIds.userId, isDeleted: false });
    expect(created.shop).toMatchObject({
      organizationId: result.organizationId,
      name: "新しい事業の店舗",
      regularClosedDays: ["sun"],
    });
    expect(created.members).toHaveLength(1);
    expect(created.members[0]).toMatchObject({ status: "active" });
    expect(created.billingState).toMatchObject({
      state: { kind: "active", plan: "free" },
      freeManagerPersonId: created.members[0]?.personId,
      freeShopId: result.shopId,
    });
  });

  it("org Aのactorはorg Bの管理writeと課金contextを副作用なしで利用できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, {
        subject: "app_manage_cross_actor",
        plan: "business",
      });
      const foreign = await seedOrganizationManagerShop(ctx, {
        subject: "app_manage_cross_foreign",
        plan: "business",
      });
      return { actor, foreign };
    });
    const actor = t.withIdentity({ subject: "app_manage_cross_actor" });
    const foreignOrganization = await t.run((ctx) => ctx.db.get(ids.foreign.organizationId));
    if (!foreignOrganization) throw new Error("foreign organization not found");
    const before = await manageWriteState(t);

    await expect(
      actor.mutation(api.organization.mutations.updateOrganizationNameForOrganization, {
        organizationId: ids.foreign.organizationId,
        name: "変更後",
        requestId: "cross-name",
      }),
    ).rejects.toThrow("Not found");
    await expect(
      actor.mutation(api.organization.mutations.addShopForOrganization, {
        organizationId: ids.foreign.organizationId,
        shopName: "不正な追加店舗",
        regularClosedDays: [],
        submissionPattern: { kind: "dateOnly" },
        requestId: "cross-shop",
      }),
    ).rejects.toThrow("Not found");
    await expect(
      actor.mutation(api.organizationBilling.mutations.updateBillingEmailForOrganization, {
        organizationId: ids.foreign.organizationId,
        email: "cross-billing@example.com",
        requestId: "cross-billing",
      }),
    ).rejects.toThrow("Not found");
    await expect(
      actor.mutation(api.organization.mutations.deleteOrganizationForOrganization, {
        organizationId: ids.foreign.organizationId,
        confirmOrganizationId: ids.foreign.organizationId,
        expectedOrganizationUpdatedAt: foreignOrganization.updatedAt,
        requestId: "cross-delete",
      }),
    ).rejects.toThrow("Not found");
    await expect(
      actor.mutation(api.organization.mutations.removeManagerRoleForOrganization, {
        organizationId: ids.foreign.organizationId,
        personId: ids.foreign.personId,
        requestId: "cross-remove-manager",
      }),
    ).rejects.toThrow("Not found");
    await expect(
      actor.mutation(api.setup.mutations.createOrganizationForApp, {
        organizationId: ids.foreign.organizationId,
        shopName: "不正な新組織",
        regularClosedDays: [],
        submissionPattern: { kind: "dateOnly" },
        requestId: "cross-create-organization",
      }),
    ).rejects.toThrow("Not found");
    await expect(
      t.query(internal.organizationStripe.queries.getActionContextForOrganization, {
        tokenIdentifier: testAuthTokenIdentifier("app_manage_cross_actor"),
        organizationId: ids.foreign.organizationId,
        purpose: "price",
      }),
    ).rejects.toThrow("Not found");

    expect(await manageWriteState(t)).toEqual(before);
  });

  it("readOnly所属はManage writeを実行できず、Stripe action contextも取得できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, {
        subject: "app_manage_read_only_write",
        plan: "business",
      });
      await ctx.db.patch(actor.memberId, { status: "readOnly", updatedAt: Date.now() });
      return actor;
    });
    const actor = t.withIdentity({ subject: "app_manage_read_only_write" });
    const before = await manageWriteState(t);

    await expect(
      actor.mutation(api.organization.mutations.updateOrganizationNameForOrganization, {
        organizationId: ids.organizationId,
        name: "変更後",
        requestId: "read-only-name",
      }),
    ).rejects.toThrow("Not found");
    await expect(
      actor.mutation(api.organizationBilling.mutations.updateBillingEmailForOrganization, {
        organizationId: ids.organizationId,
        email: "read-only-billing@example.com",
        requestId: "read-only-billing",
      }),
    ).rejects.toThrow();
    await expect(
      actor.mutation(api.setup.mutations.createOrganizationForApp, {
        organizationId: ids.organizationId,
        shopName: "閲覧者の新組織",
        regularClosedDays: [],
        submissionPattern: { kind: "dateOnly" },
        requestId: "read-only-create-organization",
      }),
    ).rejects.toThrow("Not found");
    await expect(
      t.query(internal.organizationStripe.queries.getActionContextForOrganization, {
        tokenIdentifier: testAuthTokenIdentifier("app_manage_read_only_write"),
        organizationId: ids.organizationId,
        purpose: "price",
      }),
    ).resolves.toBeNull();

    expect(await manageWriteState(t)).toEqual(before);
  });

  it("removed所属はManage read/writeとStripe action contextを利用できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, {
        subject: "app_manage_removed_actor",
        plan: "business",
      });
      await ctx.db.patch(actor.memberId, { status: "removed", updatedAt: Date.now() });
      return actor;
    });
    const actor = t.withIdentity({ subject: "app_manage_removed_actor" });
    const before = await manageWriteState(t);

    await expect(
      actor.query(api.appOrganization.manageQueries.getManageOverview, {
        organizationId: ids.organizationId,
      }),
    ).rejects.toThrow("Not found");
    await expect(
      actor.mutation(api.organization.mutations.updateOrganizationNameForOrganization, {
        organizationId: ids.organizationId,
        name: "変更後",
        requestId: "removed-name",
      }),
    ).rejects.toThrow("Not found");
    await expect(
      actor.mutation(api.setup.mutations.createOrganizationForApp, {
        organizationId: ids.organizationId,
        shopName: "削除済み所属の新組織",
        regularClosedDays: [],
        submissionPattern: { kind: "dateOnly" },
        requestId: "removed-create-organization",
      }),
    ).rejects.toThrow("Not found");
    await expect(
      t.query(internal.organizationStripe.queries.getActionContextForOrganization, {
        tokenIdentifier: testAuthTokenIdentifier("app_manage_removed_actor"),
        organizationId: ids.organizationId,
        purpose: "price",
      }),
    ).rejects.toThrow("Not found");

    expect(await manageWriteState(t)).toEqual(before);
  });
});
