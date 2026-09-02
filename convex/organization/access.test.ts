import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { getTestOrganizationId, seedLegacyShopMembership, seedShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const validShopUpdate = {
  shopName: "更新後店舗",
  regularClosedDays: [],
  submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
};

async function seedOrganizationAccess(
  ctx: MutationCtx,
  args: {
    subject: string;
    memberStatus: "active" | "removed";
    shopDeleted?: boolean;
    withLegacyMembership?: boolean;
  },
) {
  const userId = await seedUser(ctx, args.subject);
  const now = Date.now();
  const organizationId = await ctx.db.insert("organizations", {
    createdByUserId: userId,
    name: "テスト事業者",
    billingEmail: `${args.subject}@example.com`,
    billingEmailNormalized: `${args.subject}@example.com`,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  });
  const shopId = await ctx.db.insert("shops", {
    organizationId,
    name: "組織店舗",
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    regularClosedDays: [],
    isDeleted: args.shopDeleted ?? false,
  });
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId,
    userId,
    name: "管理者",
    email: `${args.subject}@example.com`,
    emailNormalized: `${args.subject}@example.com`,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const memberId = await ctx.db.insert("organizationMembers", {
    organizationId,
    personId,
    userId,
    status: args.memberStatus,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("organizationBillingStates", {
    organizationId,
    state: { kind: "complimentary", plan: "pro" },
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  if (args.withLegacyMembership) {
    await seedLegacyShopMembership(ctx, { userId, shopId });
  }
  return { memberId, organizationId, personId, shopId, userId };
}

describe("organization manager access", () => {
  it("active所属は組織店舗を参照できる", async () => {
    const t = convexTest(schema, modules);
    const memberStatus = "active" as const;
    const subject = `organization_query_${memberStatus}`;
    const { shopId } = await t.run(async (ctx) => await seedOrganizationAccess(ctx, { subject, memberStatus }));

    await expect(
      t.withIdentity({ subject }).query(api.dashboard.queries.getDashboardShop, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
      }),
    ).resolves.toMatchObject({ name: "組織店舗" });
  });

  it("active所属はshopMembersなしで未削除店舗を更新できる", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_active_mutation";
    const { shopId } = await t.run(
      async (ctx) => await seedOrganizationAccess(ctx, { subject, memberStatus: "active" }),
    );

    await t.withIdentity({ subject }).mutation(api.shop.mutations.updateShopSettings, {
      ...validShopUpdate,
      expectedOrganizationId: await getTestOrganizationId(t, shopId),
      shopId,
    });

    await expect(t.run(async (ctx) => (await ctx.db.get(shopId))?.name)).resolves.toBe("更新後店舗");
  });

  it("認証識別子に複数userが紐づく場合は照会も更新もfail-closedにする", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_duplicate_identity";
    const { shopId } = await t.run(async (ctx) => {
      const seeded = await seedOrganizationAccess(ctx, { subject, memberStatus: "active" });
      await seedUser(ctx, subject, "duplicate-identity@example.com");
      return seeded;
    });
    const actor = t.withIdentity({ subject });

    await expect(
      actor.query(api.dashboard.queries.getDashboardShop, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
      }),
    ).resolves.toBeNull();
    await expect(
      actor.mutation(api.shop.mutations.updateShopSettings, {
        ...validShopUpdate,
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
      }),
    ).rejects.toThrow("Not found");
    await expect(t.run(async (ctx) => (await ctx.db.get(shopId))?.name)).resolves.toBe("組織店舗");
  });

  it("active所属でも削除済み店舗はmutationを実行できない", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_deleted_shop";
    const { shopId } = await t.run(
      async (ctx) =>
        await seedOrganizationAccess(ctx, {
          subject,
          memberStatus: "active",
          shopDeleted: true,
        }),
    );

    await expect(
      t.withIdentity({ subject }).mutation(api.shop.mutations.updateShopSettings, {
        ...validShopUpdate,
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
      }),
    ).rejects.toThrow("Not found");
  });

  it("removed所属が存在する場合は旧shopMembersへfallbackしない", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_removed_no_fallback";
    const { shopId } = await t.run(
      async (ctx) =>
        await seedOrganizationAccess(ctx, {
          subject,
          memberStatus: "removed",
          withLegacyMembership: true,
        }),
    );

    await expect(
      t.withIdentity({ subject }).query(api.dashboard.queries.getDashboardShop, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
      }),
    ).resolves.toBeNull();
  });

  it("別事業者にだけ所属する利用者は対象店舗を参照できない", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_cross_tenant";
    const targetShopId = await t.run(async (ctx) => {
      await seedOrganizationAccess(ctx, { subject, memberStatus: "active" });
      const targetShopId = await seedShop(ctx, "別事業者店舗");
      const now = Date.now();
      const otherOrganizationId = await ctx.db.insert("organizations", {
        billingEmail: "billing@example.com",
        billingEmailNormalized: "billing@example.com",
        name: "別事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(targetShopId, {
        organizationId: otherOrganizationId,
      });
      return targetShopId;
    });

    await expect(
      t.withIdentity({ subject }).query(api.dashboard.queries.getDashboardShop, {
        expectedOrganizationId: await getTestOrganizationId(t, targetShopId),
        shopId: targetShopId,
      }),
    ).resolves.toBeNull();
  });

  it("expectedOrganizationIdと明示店舗の組織が違う場合は、両組織のactive管理者でもfail-closedにする", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_expected_scope_mismatch";
    const ids = await t.run(async (ctx) => {
      const first = await seedOrganizationAccess(ctx, { subject, memberStatus: "active" });
      const now = Date.now();
      const secondOrganizationId = await ctx.db.insert("organizations", {
        createdByUserId: first.userId,
        name: "別組織",
        billingEmail: `${subject}@example.com`,
        billingEmailNormalized: `${subject}@example.com`,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: secondOrganizationId,
        name: "別組織店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const secondPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: secondOrganizationId,
        userId: first.userId,
        name: "管理者",
        email: `${subject}@example.com`,
        emailNormalized: `${subject}@example.com`,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: secondOrganizationId,
        personId: secondPersonId,
        userId: first.userId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      return { firstOrganizationId: first.organizationId, secondPersonId, secondShopId };
    });
    const actor = t.withIdentity({ subject });

    await expect(
      actor.query(api.dashboard.queries.getDashboardShop, {
        shopId: ids.secondShopId,
        expectedOrganizationId: ids.firstOrganizationId,
      }),
    ).resolves.toBeNull();
    await expect(
      actor.mutation(api.shop.mutations.updateShopSettings, {
        ...validShopUpdate,
        shopId: ids.secondShopId,
        expectedOrganizationId: ids.firstOrganizationId,
      }),
    ).rejects.toThrow("Not found");
    await expect(
      actor.mutation(api.organization.mutations.updatePersonProfile, {
        shopId: ids.secondShopId,
        personId: ids.secondPersonId,
        name: "更新しない管理者",
        email: `${subject}@example.com`,
        requestId: "expected-scope-mismatch",
        expectedOrganizationId: ids.firstOrganizationId,
      }),
    ).rejects.toThrow("Not found");
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.secondShopId))?.name)).resolves.toBe("別組織店舗");
  });

  it("expectedOrganizationId指定時はlegacy shopMembersをcanonical組織authorityに使わない", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_expected_scope_legacy_fallback";
    const ids = await t.run(async (ctx) => {
      const userId = await seedUser(ctx, subject);
      const shopId = await seedShop(ctx, "canonical店舗");
      const shop = await ctx.db.get(shopId);
      if (!shop) throw new Error("shop not found");
      await seedLegacyShopMembership(ctx, { userId, shopId });
      return { organizationId: shop.organizationId, shopId };
    });

    await expect(
      t.withIdentity({ subject }).query(api.dashboard.queries.getDashboardShop, {
        shopId: ids.shopId,
        expectedOrganizationId: ids.organizationId,
      }),
    ).resolves.toBeNull();
  });
});
