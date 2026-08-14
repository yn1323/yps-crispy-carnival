import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { seedLegacyShop, seedLegacyShopMembership, seedShop, seedUser } from "../_test/seed";
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
    memberStatus: "active" | "readOnly" | "removed";
    operatingStatus?: "active" | "archived" | "planSuspended";
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
    operatingStatus: args.operatingStatus ?? "active",
    name: "組織店舗",
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    regularClosedDays: [],
    isDeleted: false,
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
  if (args.withLegacyMembership) {
    await seedLegacyShopMembership(ctx, { userId, shopId });
  }
  return { memberId, organizationId, personId, shopId, userId };
}

describe("organization manager access", () => {
  it.each(["active", "readOnly"] as const)("%s所属は組織店舗を参照できる", async (memberStatus) => {
    const t = convexTest(schema, modules);
    const subject = `organization_query_${memberStatus}`;
    const { shopId } = await t.run(async (ctx) => await seedOrganizationAccess(ctx, { subject, memberStatus }));

    await expect(
      t.withIdentity({ subject }).query(api.dashboard.queries.getDashboardShop, { shopId }),
    ).resolves.toMatchObject({ name: "組織店舗" });
  });

  it("active所属はshopMembersなしでactive店舗を更新できる", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_active_mutation";
    const { shopId } = await t.run(
      async (ctx) => await seedOrganizationAccess(ctx, { subject, memberStatus: "active" }),
    );

    await t.withIdentity({ subject }).mutation(api.shop.mutations.updateShopSettings, {
      ...validShopUpdate,
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

    await expect(actor.query(api.dashboard.queries.getDashboardShop, { shopId })).resolves.toBeNull();
    await expect(
      actor.mutation(api.shop.mutations.updateShopSettings, {
        ...validShopUpdate,
        shopId,
      }),
    ).rejects.toThrow("Not found");
    await expect(t.run(async (ctx) => (await ctx.db.get(shopId))?.name)).resolves.toBe("組織店舗");
  });

  it("readOnly所属は旧shopMembersが残っていてもmutationを実行できない", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_read_only_mutation";
    const { shopId } = await t.run(
      async (ctx) =>
        await seedOrganizationAccess(ctx, {
          subject,
          memberStatus: "readOnly",
          withLegacyMembership: true,
        }),
    );

    await expect(
      t.withIdentity({ subject }).mutation(api.shop.mutations.updateShopSettings, {
        ...validShopUpdate,
        shopId,
      }),
    ).rejects.toThrow("Not found");
  });

  it.each(["archived", "planSuspended"] as const)(
    "active所属でも%s店舗はmutationを実行できない",
    async (operatingStatus) => {
      const t = convexTest(schema, modules);
      const subject = `organization_inactive_shop_${operatingStatus}`;
      const { shopId } = await t.run(
        async (ctx) =>
          await seedOrganizationAccess(ctx, {
            subject,
            memberStatus: "active",
            operatingStatus,
          }),
      );

      await expect(
        t.withIdentity({ subject }).mutation(api.shop.mutations.updateShopSettings, {
          ...validShopUpdate,
          shopId,
        }),
      ).rejects.toThrow("Not found");
    },
  );

  it("m009完了後m010前は所属行が0件の場合だけ旧shopMembersで参照できる", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_widen_fallback";
    const shopId = await t.run(async (ctx) => {
      const userId = await seedUser(ctx, subject);
      const shopId = await seedLegacyShop(ctx, "移行途中店舗");
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        migrationSourceShopId: shopId,
        name: "移行途中事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(shopId, { organizationId, operatingStatus: "active" });
      await seedLegacyShopMembership(ctx, { userId, shopId });
      return shopId;
    });

    await expect(
      t.withIdentity({ subject }).query(api.dashboard.queries.getDashboardShop, { shopId }),
    ).resolves.toMatchObject({ name: "移行途中店舗" });
  });

  it("m009完了後m010前の旧shopMembersが重複する場合は参照も更新もfail-closedにする", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_duplicate_widen_membership";
    const shopId = await t.run(async (ctx) => {
      const userId = await seedUser(ctx, subject);
      const shopId = await seedLegacyShop(ctx, "重複移行途中店舗");
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        migrationSourceShopId: shopId,
        name: "重複移行途中事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(shopId, { organizationId, operatingStatus: "active" });
      await seedLegacyShopMembership(ctx, { userId, shopId });
      await seedLegacyShopMembership(ctx, { userId, shopId });
      return shopId;
    });
    const actor = t.withIdentity({ subject });

    await expect(actor.query(api.dashboard.queries.getDashboardShop, { shopId })).resolves.toBeNull();
    await expect(actor.mutation(api.shop.mutations.updateShopSettings, { ...validShopUpdate, shopId })).rejects.toThrow(
      "Not found",
    );
  });

  it("legacy店舗の旧shopMembersが重複する場合も参照をfail-closedにする", async () => {
    const t = convexTest(schema, modules);
    const subject = "legacy_duplicate_membership";
    const shopId = await t.run(async (ctx) => {
      const userId = await seedUser(ctx, subject);
      const shopId = await seedLegacyShop(ctx, "重複legacy店舗");
      await seedLegacyShopMembership(ctx, { userId, shopId });
      await seedLegacyShopMembership(ctx, { userId, shopId });
      return shopId;
    });

    await expect(
      t.withIdentity({ subject }).query(api.dashboard.queries.getDashboardShop, { shopId }),
    ).resolves.toBeNull();
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
      t.withIdentity({ subject }).query(api.dashboard.queries.getDashboardShop, { shopId }),
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
        name: "別事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(targetShopId, {
        organizationId: otherOrganizationId,
        operatingStatus: "active",
      });
      return targetShopId;
    });

    await expect(
      t.withIdentity({ subject }).query(api.dashboard.queries.getDashboardShop, { shopId: targetShopId }),
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
        operatingStatus: "active",
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
      const shopId = await seedLegacyShop(ctx, "移行途中店舗");
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        migrationSourceShopId: shopId,
        name: "移行途中事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(shopId, { organizationId, operatingStatus: "active" });
      await seedLegacyShopMembership(ctx, { userId, shopId });
      return { organizationId, shopId };
    });

    await expect(
      t.withIdentity({ subject }).query(api.dashboard.queries.getDashboardShop, {
        shopId: ids.shopId,
        expectedOrganizationId: ids.organizationId,
      }),
    ).resolves.toBeNull();
  });
});
