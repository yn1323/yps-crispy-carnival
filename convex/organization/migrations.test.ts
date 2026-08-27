import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import { createConvexTestWithMigrations } from "../_test/migrations.test-helper";
import { seedLegacyManagerShop, seedLegacyShopMembership } from "../_test/seed";

function createOrganizationTest() {
  return createConvexTestWithMigrations();
}

async function runOrganizationMigrations(t: ReturnType<typeof createOrganizationTest>) {
  const args = { batchSize: 100, cursor: null, dryRun: false };
  await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
  await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
  await t.mutation(internal.migrations.m011_staffs_to_organization_people.migration, args);
}

describe("organization migrations", () => {
  it("店舗・管理者・スタッフを再実行可能に移行し、旧課金プランは変換しない", async () => {
    const t = createOrganizationTest();
    const { managerStaffId, mismatchedStaffId, samePersonStaffIds, shopId, userId } = await t.run(async (ctx) => {
      const { shopId, userId } = await seedLegacyManagerShop(ctx, {
        subject: "organization_migration_manager",
        email: "manager@example.com",
        shopName: "移行対象店舗",
      });
      const managerStaffId = await ctx.db.insert("staffs", {
        shopId,
        userId,
        name: "管理者",
        email: "manager@example.com",
        emailNormalized: "manager@example.com",
        isDeleted: false,
      });
      const firstSamePersonStaffId = await ctx.db.insert("staffs", {
        shopId,
        name: " 山田  太郎 ",
        email: "SHARED@example.com",
        isDeleted: false,
      });
      const secondSamePersonStaffId = await ctx.db.insert("staffs", {
        shopId,
        name: "山田 太郎",
        email: "shared@example.com",
        emailNormalized: "shared@example.com",
        isDeleted: false,
      });
      const mismatchedStaffId = await ctx.db.insert("staffs", {
        shopId,
        name: "別の人物",
        email: "shared@example.com",
        emailNormalized: "shared@example.com",
        isDeleted: false,
      });
      await ctx.db.insert("shopBillingStates", {
        shopId,
        planKey: "premium",
        source: "manual",
        createdAt: 100,
        updatedAt: 200,
      });
      return {
        managerStaffId,
        mismatchedStaffId,
        samePersonStaffIds: [firstSamePersonStaffId, secondSamePersonStaffId],
        shopId,
        userId,
      };
    });

    await runOrganizationMigrations(t);
    await runOrganizationMigrations(t);

    const result = await t.run(async (ctx) => {
      const organizations = await ctx.db
        .query("organizations")
        .withIndex("by_migrationSourceShopId", (q) => q.eq("migrationSourceShopId", shopId))
        .collect();
      const organization = organizations[0];
      const people = organization
        ? await ctx.db
            .query("organizationPeople")
            .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", organization._id))
            .collect()
        : [];
      const members = organization
        ? await ctx.db
            .query("organizationMembers")
            .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organization._id))
            .collect()
        : [];
      return {
        conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
        managerStaff: await ctx.db.get(managerStaffId),
        members,
        mismatchedStaff: await ctx.db.get(mismatchedStaffId),
        organizationBillingStates: await ctx.db.query("organizationBillingStates").collect(),
        organizations,
        people,
        samePersonStaffs: await Promise.all(samePersonStaffIds.map(async (id) => await ctx.db.get(id))),
        shop: await ctx.db.get(shopId),
      };
    });

    expect(result.organizations).toHaveLength(1);
    expect(result.organizations[0]).toMatchObject({
      createdByUserId: userId,
      migrationSourceShopId: shopId,
      name: "移行対象店舗グループ",
    });
    expect(result.organizations[0].billingEmail).toBeUndefined();
    expect(result.shop).toMatchObject({
      organizationId: result.organizations[0]._id,
      operatingStatus: "active",
    });
    expect(result.members).toHaveLength(1);
    expect(result.members[0]).toMatchObject({ status: "active", userId });
    expect(result.managerStaff?.organizationPersonId).toBe(result.members[0].personId);
    expect(result.samePersonStaffs[0]?.organizationPersonId).toBe(result.samePersonStaffs[1]?.organizationPersonId);
    expect(result.mismatchedStaff?.organizationId).toBeUndefined();
    expect(result.mismatchedStaff?.organizationPersonId).toBeUndefined();
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      code: "email_name_mismatch",
      sourceId: mismatchedStaffId,
      sourceType: "staff",
    });
    expect(result.conflicts[0].resolvedAt).toBeUndefined();
    expect(result.people).toHaveLength(2);
    expect(result.organizationBillingStates).toEqual([]);
  });

  it("m009はdangling organizationを修復しても既存店舗状態を保全し、conflictを解消する", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) => {
      const manager = await seedLegacyManagerShop(ctx, {
        subject: "organization_shop_conflict_migration",
        shopName: "店舗衝突修復",
      });
      const now = Date.now();
      const danglingOrganizationId = await ctx.db.insert("organizations", {
        name: "削除済み事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(manager.shopId, {
        organizationId: danglingOrganizationId,
        operatingStatus: "archived",
      });
      await ctx.db.delete(danglingOrganizationId);
      return manager;
    });
    const args = { batchSize: 100, cursor: null, dryRun: false };
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const first = await t.run(async (ctx) => ({
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "shop").eq("sourceId", seeded.shopId).eq("code", "dangling_organization_id"),
        )
        .collect(),
      shop: await ctx.db.get(seeded.shopId),
    }));
    expect(first.shop?.organizationId).toBeDefined();
    expect(first.shop?.operatingStatus).toBe("archived");
    expect(first.conflicts).toHaveLength(1);
    expect(first.conflicts[0].resolvedAt).toEqual(expect.any(Number));

    const resolvedAt = first.conflicts[0].resolvedAt;
    const organizationId = first.shop?.organizationId;
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const rerun = await t.run(async (ctx) => ({
      conflict: await ctx.db.get(first.conflicts[0]._id),
      shop: await ctx.db.get(seeded.shopId),
    }));
    expect(rerun.shop).toMatchObject({ organizationId, operatingStatus: "archived" });
    expect(rerun.conflict?.resolvedAt).toBe(resolvedAt);
  });

  it("m009は同じ移行元店舗の事業者が複数ある間は店舗を変更せず、修復後に既存事業者へ紐付ける", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) => {
      const manager = await seedLegacyManagerShop(ctx, {
        subject: "organization_duplicate_migration_source",
        shopName: "重複移行元店舗",
      });
      const now = Date.now();
      const organizationIds = [
        await ctx.db.insert("organizations", {
          migrationSourceShopId: manager.shopId,
          name: "移行先事業者A",
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        }),
        await ctx.db.insert("organizations", {
          migrationSourceShopId: manager.shopId,
          name: "移行先事業者B",
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        }),
      ];
      return { ...manager, organizationIds };
    });
    const args = { batchSize: 100, cursor: null, dryRun: false };

    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const blocked = await t.run(async (ctx) => ({
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q
            .eq("sourceType", "shop")
            .eq("sourceId", seeded.shopId)
            .eq("code", "ambiguous_migration_source_organization"),
        )
        .collect(),
      shop: await ctx.db.get(seeded.shopId),
    }));
    expect(blocked.shop?.organizationId).toBeUndefined();
    expect(blocked.shop?.operatingStatus).toBeUndefined();
    expect(blocked.conflicts).toHaveLength(1);
    expect(blocked.conflicts[0]?.resolvedAt).toBeUndefined();

    await t.run(async (ctx) => await ctx.db.delete(seeded.organizationIds[1]));
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const resolved = await t.run(async (ctx) => ({
      conflict: await ctx.db.get(blocked.conflicts[0]._id),
      organizations: await ctx.db
        .query("organizations")
        .withIndex("by_migrationSourceShopId", (q) => q.eq("migrationSourceShopId", seeded.shopId))
        .collect(),
      shop: await ctx.db.get(seeded.shopId),
    }));
    expect(resolved.organizations.map((organization) => organization._id)).toEqual([seeded.organizationIds[0]]);
    expect(resolved.shop).toMatchObject({
      organizationId: seeded.organizationIds[0],
      operatingStatus: "active",
    });
    expect(resolved.conflict?.resolvedAt).toEqual(expect.any(Number));
  });

  it("m009は紐付け済み店舗の再実行でも後発の移行元重複を見逃さず、修復まで店舗状態を保全する", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) =>
      seedLegacyManagerShop(ctx, {
        subject: "organization_linked_duplicate_migration_source",
        shopName: "紐付け後の重複移行元店舗",
      }),
    );
    const args = { batchSize: 100, cursor: null, dryRun: false };
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const prepared = await t.run(async (ctx) => {
      const shop = await ctx.db.get(seeded.shopId);
      if (!shop?.organizationId) throw new Error("organization migration failed");
      await ctx.db.patch(shop._id, { operatingStatus: "archived" });
      const now = Date.now();
      const duplicateOrganizationId = await ctx.db.insert("organizations", {
        migrationSourceShopId: shop._id,
        name: "後発の重複事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      return { canonicalOrganizationId: shop.organizationId, duplicateOrganizationId };
    });

    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const blocked = await t.run(async (ctx) => ({
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q
            .eq("sourceType", "shop")
            .eq("sourceId", seeded.shopId)
            .eq("code", "ambiguous_migration_source_organization"),
        )
        .collect(),
      shop: await ctx.db.get(seeded.shopId),
    }));
    expect(blocked.shop).toMatchObject({
      organizationId: prepared.canonicalOrganizationId,
      operatingStatus: "archived",
    });
    expect(blocked.conflicts).toHaveLength(1);
    expect(blocked.conflicts[0]).toMatchObject({
      organizationId: prepared.canonicalOrganizationId,
    });
    expect(blocked.conflicts[0]?.resolvedAt).toBeUndefined();

    await t.run(async (ctx) => await ctx.db.delete(prepared.duplicateOrganizationId));
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const resolved = await t.run(async (ctx) => ({
      conflict: await ctx.db.get(blocked.conflicts[0]._id),
      shop: await ctx.db.get(seeded.shopId),
    }));
    expect(resolved.shop).toMatchObject({
      organizationId: prepared.canonicalOrganizationId,
      operatingStatus: "archived",
    });
    expect(resolved.conflict?.resolvedAt).toEqual(expect.any(Number));
  });

  it("m010は曖昧な人物を安全側で止め、修復後もcanonical statusを保全してconflictを解消する", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) =>
      seedLegacyManagerShop(ctx, {
        subject: "organization_member_conflict_migration",
        email: "member-conflict@example.com",
        shopName: "管理者衝突修復",
      }),
    );
    const args = { batchSize: 100, cursor: null, dryRun: false };
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const prepared = await t.run(async (ctx) => {
      const shop = await ctx.db.get(seeded.shopId);
      if (!shop?.organizationId) throw new Error("organization migration failed");
      const now = Date.now();
      const personInput = {
        organizationId: shop.organizationId,
        userId: seeded.userId,
        name: "管理者",
        email: "member-conflict@example.com",
        emailNormalized: "member-conflict@example.com",
        status: "removed" as const,
        createdAt: now,
        updatedAt: now,
      };
      const personIds = [
        await ctx.db.insert("organizationPeople", personInput),
        await ctx.db.insert("organizationPeople", personInput),
      ];
      const shopMember = await ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_shopId", (q) => q.eq("userId", seeded.userId).eq("shopId", seeded.shopId))
        .unique();
      if (!shopMember) throw new Error("shop member not found");
      return { organizationId: shop.organizationId, personIds, shopMemberId: shopMember._id };
    });
    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    const conflict = await t.run(async (ctx) => {
      const conflicts = await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "shopMember").eq("sourceId", prepared.shopMemberId).eq("code", "ambiguous_user_person"),
        )
        .collect();
      if (conflicts.length !== 1) throw new Error("migration conflict not found");
      return conflicts[0];
    });
    expect(conflict.resolvedAt).toBeUndefined();

    await t.run(async (ctx) => await ctx.db.delete(prepared.personIds[1]));
    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    const resolved = await t.run(async (ctx) => ({
      conflict: await ctx.db.get(conflict._id),
      members: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", prepared.organizationId).eq("personId", prepared.personIds[0]),
        )
        .collect(),
      person: await ctx.db.get(prepared.personIds[0]),
    }));
    expect(resolved.person?.status).toBe("removed");
    expect(resolved.members).toHaveLength(1);
    expect(resolved.members[0].status).toBe("removed");
    expect(resolved.conflict?.resolvedAt).toEqual(expect.any(Number));
  });

  it("m010はactive旧所属が重複する間は推測統合せず、修復後に一意なcanonical所属へ移行する", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) =>
      seedLegacyManagerShop(ctx, {
        subject: "organization_duplicate_legacy_shop_membership",
        email: "duplicate-legacy-membership@example.com",
        shopName: "旧所属重複識別",
      }),
    );
    const args = { batchSize: 100, cursor: null, dryRun: false };
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const prepared = await t.run(async (ctx) => {
      const shop = await ctx.db.get(seeded.shopId);
      if (!shop?.organizationId) throw new Error("organization migration failed");
      const originalMembership = await ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_shopId", (q) => q.eq("userId", seeded.userId).eq("shopId", seeded.shopId))
        .unique();
      if (!originalMembership) throw new Error("shop member not found");
      const duplicateMembershipId = await seedLegacyShopMembership(ctx, {
        userId: seeded.userId,
        shopId: seeded.shopId,
      });
      return {
        duplicateMembershipId,
        organizationId: shop.organizationId,
        sourceIds: [originalMembership._id, duplicateMembershipId],
      };
    });

    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    const blocked = await t.run(async (ctx) => ({
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .filter((q) => q.eq(q.field("code"), "ambiguous_legacy_shop_membership"))
        .collect(),
      members: await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) =>
          q.eq("userId", seeded.userId).eq("organizationId", prepared.organizationId),
        )
        .collect(),
      people: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_userId", (q) =>
          q.eq("organizationId", prepared.organizationId).eq("userId", seeded.userId),
        )
        .collect(),
    }));
    expect(blocked.conflicts).toHaveLength(2);
    expect(blocked.conflicts.map((conflict) => conflict.sourceId).sort()).toEqual([...prepared.sourceIds].sort());
    expect(blocked.conflicts.every((conflict) => conflict.resolvedAt === undefined)).toBe(true);
    expect(blocked.people).toEqual([]);
    expect(blocked.members).toEqual([]);

    await t.run(async (ctx) => await ctx.db.patch(prepared.duplicateMembershipId, { isDeleted: true }));
    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    const resolved = await t.run(async (ctx) => ({
      conflicts: await Promise.all(blocked.conflicts.map(async (conflict) => await ctx.db.get(conflict._id))),
      members: await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) =>
          q.eq("userId", seeded.userId).eq("organizationId", prepared.organizationId),
        )
        .collect(),
      people: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_userId", (q) =>
          q.eq("organizationId", prepared.organizationId).eq("userId", seeded.userId),
        )
        .collect(),
    }));
    expect(resolved.conflicts.every((conflict) => conflict?.resolvedAt !== undefined)).toBe(true);
    expect(resolved.people).toHaveLength(1);
    expect(resolved.members).toHaveLength(1);
    expect(resolved.members[0]?.personId).toBe(resolved.people[0]?._id);
  });

  it("m010は同一emailの複数人物・別user人物を統合せず、一意な未紐付人物へだけuserIdを付与する", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) =>
      seedLegacyManagerShop(ctx, {
        subject: "organization_member_email_identity",
        email: "manager-email-identity@example.com",
        shopName: "管理者email識別",
      }),
    );
    const args = { batchSize: 100, cursor: null, dryRun: false };
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const prepared = await t.run(async (ctx) => {
      const shop = await ctx.db.get(seeded.shopId);
      if (!shop?.organizationId) throw new Error("organization migration failed");
      const now = Date.now();
      const foreignUserId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|foreign_email_identity",
        name: "別利用者",
        email: "foreign-user@example.com",
        emailNormalized: "foreign-user@example.com",
        role: "manager",
        isDeleted: false,
      });
      const personInput = {
        organizationId: shop.organizationId,
        name: "管理者",
        email: "manager-email-identity@example.com",
        emailNormalized: "manager-email-identity@example.com",
        status: "active" as const,
        createdAt: now,
        updatedAt: now,
      };
      const foreignPersonId = await ctx.db.insert("organizationPeople", {
        ...personInput,
        userId: foreignUserId,
      });
      const unlinkedPersonId = await ctx.db.insert("organizationPeople", personInput);
      const shopMember = await ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_shopId", (q) => q.eq("userId", seeded.userId).eq("shopId", seeded.shopId))
        .unique();
      if (!shopMember) throw new Error("shop member not found");
      return {
        foreignPersonId,
        organizationId: shop.organizationId,
        shopMemberId: shopMember._id,
        unlinkedPersonId,
      };
    });

    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    const ambiguous = await t.run(async (ctx) => ({
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "shopMember").eq("sourceId", prepared.shopMemberId),
        )
        .collect(),
      managerPeople: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_userId", (q) =>
          q.eq("organizationId", prepared.organizationId).eq("userId", seeded.userId),
        )
        .collect(),
      members: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", prepared.organizationId))
        .collect(),
    }));
    expect(ambiguous.conflicts).toHaveLength(1);
    expect(ambiguous.conflicts[0]).toMatchObject({ code: "ambiguous_email_person" });
    expect(ambiguous.conflicts[0]?.resolvedAt).toBeUndefined();
    expect(ambiguous.managerPeople).toEqual([]);
    expect(ambiguous.members).toEqual([]);

    await t.run(async (ctx) => await ctx.db.delete(prepared.unlinkedPersonId));
    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    const mismatched = await t.run(async (ctx) =>
      ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "shopMember").eq("sourceId", prepared.shopMemberId),
        )
        .collect(),
    );
    expect(mismatched.map((conflict) => conflict.code)).toEqual(
      expect.arrayContaining(["ambiguous_email_person", "email_person_user_mismatch"]),
    );
    expect(mismatched.every((conflict) => conflict.resolvedAt === undefined)).toBe(true);

    await t.run(async (ctx) => await ctx.db.patch(prepared.foreignPersonId, { userId: undefined }));
    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    const resolved = await t.run(async (ctx) => ({
      conflicts: await Promise.all(mismatched.map(async (conflict) => await ctx.db.get(conflict._id))),
      managerPeople: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_userId", (q) =>
          q.eq("organizationId", prepared.organizationId).eq("userId", seeded.userId),
        )
        .collect(),
      members: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", prepared.organizationId).eq("personId", prepared.foreignPersonId),
        )
        .collect(),
    }));
    expect(resolved.managerPeople.map((person) => person._id)).toEqual([prepared.foreignPersonId]);
    expect(resolved.members).toHaveLength(1);
    expect(resolved.conflicts.every((conflict) => conflict?.resolvedAt !== undefined)).toBe(true);
  });

  it("m010はmember競合を解消するまで未紐付人物へuserIdを部分書込しない", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) =>
      seedLegacyManagerShop(ctx, {
        subject: "organization_member_partial_write",
        email: "member-partial-write@example.com",
        shopName: "管理者部分移行防止",
      }),
    );
    const args = { batchSize: 100, cursor: null, dryRun: false };
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const prepared = await t.run(async (ctx) => {
      const shop = await ctx.db.get(seeded.shopId);
      if (!shop?.organizationId) throw new Error("organization migration failed");
      const foreignUserId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|member_partial_write_foreign",
        name: "別利用者",
        email: "member-partial-write-foreign@example.com",
        role: "manager",
        isDeleted: false,
      });
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: shop.organizationId,
        name: "管理者",
        email: "member-partial-write@example.com",
        emailNormalized: "member-partial-write@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const memberInput = {
        organizationId: shop.organizationId,
        personId,
        userId: foreignUserId,
        status: "active" as const,
        createdAt: now,
        updatedAt: now,
      };
      const memberIds = [
        await ctx.db.insert("organizationMembers", memberInput),
        await ctx.db.insert("organizationMembers", memberInput),
      ];
      const shopMember = await ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_shopId", (q) => q.eq("userId", seeded.userId).eq("shopId", seeded.shopId))
        .unique();
      if (!shopMember) throw new Error("shop member not found");
      return { memberIds, organizationId: shop.organizationId, personId, shopMemberId: shopMember._id };
    });

    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    const ambiguous = await t.run(async (ctx) => ({
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "shopMember").eq("sourceId", prepared.shopMemberId),
        )
        .collect(),
      person: await ctx.db.get(prepared.personId),
    }));
    expect(ambiguous.person?.userId).toBeUndefined();
    expect(ambiguous.conflicts).toEqual([expect.objectContaining({ code: "ambiguous_organization_member" })]);
    expect(ambiguous.conflicts[0]?.resolvedAt).toBeUndefined();

    await t.run(async (ctx) => await ctx.db.delete(prepared.memberIds[1]));
    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    const mismatched = await t.run(async (ctx) => ({
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "shopMember").eq("sourceId", prepared.shopMemberId),
        )
        .collect(),
      person: await ctx.db.get(prepared.personId),
    }));
    expect(mismatched.person?.userId).toBeUndefined();
    expect(mismatched.conflicts.map((conflict) => conflict.code)).toEqual(
      expect.arrayContaining(["ambiguous_organization_member", "member_user_mismatch"]),
    );
    expect(mismatched.conflicts.every((conflict) => conflict.resolvedAt === undefined)).toBe(true);

    await t.run(async (ctx) => await ctx.db.patch(prepared.memberIds[0], { userId: seeded.userId }));
    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    const resolved = await t.run(async (ctx) => ({
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "shopMember").eq("sourceId", prepared.shopMemberId),
        )
        .collect(),
      members: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", prepared.organizationId).eq("personId", prepared.personId),
        )
        .collect(),
      person: await ctx.db.get(prepared.personId),
    }));
    expect(resolved.person?.userId).toBe(seeded.userId);
    expect(resolved.members).toHaveLength(1);
    expect(resolved.members[0]?.userId).toBe(seeded.userId);
    expect(resolved.conflicts.every((conflict) => conflict.resolvedAt !== undefined)).toBe(true);
  });

  it("m010は同一事業者・利用者の既存memberが複数ある間は部分移行せず、修復後に既存人物とmemberを再利用する", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) =>
      seedLegacyManagerShop(ctx, {
        subject: "organization_duplicate_user_member",
        email: "duplicate-user-member@example.com",
        shopName: "既存管理者所属再利用",
      }),
    );
    const args = { batchSize: 100, cursor: null, dryRun: false };
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const prepared = await t.run(async (ctx) => {
      const shop = await ctx.db.get(seeded.shopId);
      if (!shop?.organizationId) throw new Error("organization migration failed");
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: shop.organizationId,
        name: "管理者",
        email: "duplicate-user-member@example.com",
        emailNormalized: "duplicate-user-member@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const memberInput = {
        organizationId: shop.organizationId,
        personId,
        userId: seeded.userId,
        status: "active" as const,
        createdAt: now,
        updatedAt: now,
      };
      const memberIds = [
        await ctx.db.insert("organizationMembers", memberInput),
        await ctx.db.insert("organizationMembers", memberInput),
      ];
      const shopMember = await ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_shopId", (q) => q.eq("userId", seeded.userId).eq("shopId", seeded.shopId))
        .unique();
      if (!shopMember) throw new Error("shop member not found");
      return { memberIds, organizationId: shop.organizationId, personId, shopMemberId: shopMember._id };
    });

    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    const blocked = await t.run(async (ctx) => ({
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "shopMember").eq("sourceId", prepared.shopMemberId),
        )
        .collect(),
      members: await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) =>
          q.eq("userId", seeded.userId).eq("organizationId", prepared.organizationId),
        )
        .collect(),
      people: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) =>
          q.eq("organizationId", prepared.organizationId).eq("emailNormalized", "duplicate-user-member@example.com"),
        )
        .collect(),
    }));
    expect(blocked.conflicts).toEqual([expect.objectContaining({ code: "ambiguous_user_organization_member" })]);
    expect(blocked.conflicts[0]?.resolvedAt).toBeUndefined();
    expect(blocked.members.map((member) => member._id).sort()).toEqual([...prepared.memberIds].sort());
    expect(blocked.people).toHaveLength(1);
    expect(blocked.people[0]._id).toBe(prepared.personId);
    expect(blocked.people[0].userId).toBeUndefined();

    await t.run(async (ctx) => await ctx.db.delete(prepared.memberIds[1]));
    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    const resolved = await t.run(async (ctx) => ({
      conflict: await ctx.db.get(blocked.conflicts[0]._id),
      members: await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) =>
          q.eq("userId", seeded.userId).eq("organizationId", prepared.organizationId),
        )
        .collect(),
      people: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_userId", (q) =>
          q.eq("organizationId", prepared.organizationId).eq("userId", seeded.userId),
        )
        .collect(),
    }));
    expect(resolved.people.map((person) => person._id)).toEqual([prepared.personId]);
    expect(resolved.members.map((member) => member._id)).toEqual([prepared.memberIds[0]]);
    expect(resolved.members[0]?.personId).toBe(prepared.personId);
    expect(resolved.conflict?.resolvedAt).toEqual(expect.any(Number));
  });

  it("userId一致人物がいても同一emailの別人物が残る間はm010とm011を解決扱いにしない", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) => {
      const manager = await seedLegacyManagerShop(ctx, {
        subject: "organization_duplicate_email_identity",
        email: "duplicate-identity@example.com",
        shopName: "重複email識別",
      });
      const managerStaffId = await ctx.db.insert("staffs", {
        shopId: manager.shopId,
        userId: manager.userId,
        name: "管理者",
        email: "duplicate-identity@example.com",
        emailNormalized: "duplicate-identity@example.com",
        isDeleted: false,
      });
      return { ...manager, managerStaffId };
    });
    const args = { batchSize: 100, cursor: null, dryRun: false };
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const prepared = await t.run(async (ctx) => {
      const shop = await ctx.db.get(seeded.shopId);
      if (!shop?.organizationId) throw new Error("organization migration failed");
      const now = Date.now();
      const personInput = {
        organizationId: shop.organizationId,
        name: "管理者",
        email: "duplicate-identity@example.com",
        emailNormalized: "duplicate-identity@example.com",
        status: "active" as const,
        createdAt: now,
        updatedAt: now,
      };
      const userPersonId = await ctx.db.insert("organizationPeople", {
        ...personInput,
        userId: seeded.userId,
      });
      const duplicatePersonId = await ctx.db.insert("organizationPeople", personInput);
      await ctx.db.patch(seeded.managerStaffId, {
        organizationId: shop.organizationId,
        organizationPersonId: userPersonId,
      });
      const shopMember = await ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_shopId", (q) => q.eq("userId", seeded.userId).eq("shopId", seeded.shopId))
        .unique();
      if (!shopMember) throw new Error("shop member not found");
      return {
        duplicatePersonId,
        organizationId: shop.organizationId,
        shopMemberId: shopMember._id,
        userPersonId,
      };
    });

    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    await t.mutation(internal.migrations.m011_staffs_to_organization_people.migration, args);
    const blocked = await t.run(async (ctx) => ({
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
      managerStaff: await ctx.db.get(seeded.managerStaffId),
      members: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", prepared.organizationId).eq("personId", prepared.userPersonId),
        )
        .collect(),
    }));
    expect(blocked.members).toEqual([]);
    expect(blocked.managerStaff?.organizationId).toBeUndefined();
    expect(blocked.managerStaff?.organizationPersonId).toBeUndefined();
    expect(blocked.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "shopMember",
          sourceId: prepared.shopMemberId,
          code: "ambiguous_email_person",
        }),
        expect.objectContaining({
          sourceType: "staff",
          sourceId: seeded.managerStaffId,
          code: "ambiguous_email_person",
        }),
      ]),
    );
    expect(blocked.conflicts.every((conflict) => conflict.resolvedAt === undefined)).toBe(true);

    await t.run(async (ctx) => await ctx.db.delete(prepared.duplicatePersonId));
    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    await t.mutation(internal.migrations.m011_staffs_to_organization_people.migration, args);
    await t.mutation(internal.migrations.m010_shop_members_to_organization_members.migration, args);
    await t.mutation(internal.migrations.m011_staffs_to_organization_people.migration, args);
    const resolved = await t.run(async (ctx) => ({
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
      managerStaff: await ctx.db.get(seeded.managerStaffId),
      members: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", prepared.organizationId).eq("personId", prepared.userPersonId),
        )
        .collect(),
    }));
    expect(resolved.members).toHaveLength(1);
    expect(resolved.managerStaff).toMatchObject({
      organizationId: prepared.organizationId,
      organizationPersonId: prepared.userPersonId,
    });
    expect(resolved.conflicts.every((conflict) => conflict.resolvedAt !== undefined)).toBe(true);
  });

  it("canonical lifecycle変更後に全migrationを再実行しても店舗・人物・管理者状態を上書きしない", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) => {
      const manager = await seedLegacyManagerShop(ctx, {
        subject: "organization_lifecycle_migration",
        email: "lifecycle-manager@example.com",
        shopName: "ライフサイクル店舗",
      });
      const managerStaffId = await ctx.db.insert("staffs", {
        shopId: manager.shopId,
        userId: manager.userId,
        name: "管理者",
        email: "lifecycle-manager@example.com",
        emailNormalized: "lifecycle-manager@example.com",
        isDeleted: false,
      });
      return { ...manager, managerStaffId };
    });
    await runOrganizationMigrations(t);

    const canonical = await t.run(async (ctx) => {
      const shop = await ctx.db.get(seeded.shopId);
      if (!shop?.organizationId) throw new Error("organization migration failed");
      const organizationId = shop.organizationId;
      const people = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_userId", (q) =>
          q.eq("organizationId", organizationId).eq("userId", seeded.userId),
        )
        .collect();
      if (people.length !== 1) throw new Error("person migration failed");
      const members = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", organizationId).eq("personId", people[0]._id),
        )
        .collect();
      if (members.length !== 1) throw new Error("member migration failed");
      return { organizationId, personId: people[0]._id, memberId: members[0]._id };
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.shopId, { operatingStatus: "archived" });
    });
    await runOrganizationMigrations(t);
    await runOrganizationMigrations(t);
    const archivedState = await t.run(async (ctx) => ({
      member: await ctx.db.get(canonical.memberId),
      person: await ctx.db.get(canonical.personId),
      shop: await ctx.db.get(seeded.shopId),
      staff: await ctx.db.get(seeded.managerStaffId),
    }));
    expect(archivedState.shop?.operatingStatus).toBe("archived");
    expect(archivedState.person?.status).toBe("active");
    expect(archivedState.member?.status).toBe("active");
    expect(archivedState.staff).toMatchObject({
      organizationId: canonical.organizationId,
      organizationPersonId: canonical.personId,
    });

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.patch(seeded.shopId, { operatingStatus: "active" });
      await ctx.db.patch(canonical.personId, { status: "removed", updatedAt: now });
      await ctx.db.patch(canonical.memberId, { status: "removed", updatedAt: now });
    });
    await runOrganizationMigrations(t);
    await runOrganizationMigrations(t);
    const removedState = await t.run(async (ctx) => ({
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
      member: await ctx.db.get(canonical.memberId),
      person: await ctx.db.get(canonical.personId),
      shop: await ctx.db.get(seeded.shopId),
      staff: await ctx.db.get(seeded.managerStaffId),
    }));
    expect(removedState.shop?.operatingStatus).toBe("active");
    expect(removedState.person?.status).toBe("removed");
    expect(removedState.member?.status).toBe("removed");
    expect(removedState.staff).toMatchObject({
      organizationId: canonical.organizationId,
      organizationPersonId: canonical.personId,
    });
    expect(removedState.conflicts).toEqual([]);
  });

  it("人物を一意に解決できないstaffは部分移行せず、既存session導線を維持する", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) => {
      const { shopId } = await seedLegacyManagerShop(ctx, {
        subject: "organization_staff_conflict_migration",
        email: "migration-owner@example.com",
        shopName: "衝突移行店舗",
      });
      const missingEmailStaffId = await ctx.db.insert("staffs", {
        shopId,
        name: "メール未設定スタッフ",
        email: "   ",
        isDeleted: false,
      });
      const ambiguousStaffId = await ctx.db.insert("staffs", {
        shopId,
        name: "同姓同名スタッフ",
        email: "ambiguous@example.com",
        emailNormalized: "ambiguous@example.com",
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2099-01-01",
        periodEnd: "2099-01-07",
        deadline: "2098-12-31",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const expiresAt = Date.now() + 86_400_000;
      await ctx.db.insert("sessions", {
        sessionToken: "missing-email-migration-session",
        staffId: missingEmailStaffId,
        shopId,
        recruitmentId,
        accessKind: "submit",
        expiresAt,
      });
      await ctx.db.insert("sessions", {
        sessionToken: "ambiguous-migration-session",
        staffId: ambiguousStaffId,
        shopId,
        recruitmentId,
        accessKind: "submit",
        expiresAt,
      });
      return { ambiguousStaffId, missingEmailStaffId, recruitmentId, shopId };
    });
    const migrationArgs = { batchSize: 100, cursor: null, dryRun: false };
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, migrationArgs);
    const organizationId = await t.run(async (ctx) => {
      const shop = await ctx.db.get(seeded.shopId);
      if (!shop?.organizationId) throw new Error("organization migration failed");
      const now = Date.now();
      await ctx.db.insert("organizationPeople", {
        organizationId: shop.organizationId,
        name: "同姓同名スタッフ",
        email: "ambiguous@example.com",
        emailNormalized: "ambiguous@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationPeople", {
        organizationId: shop.organizationId,
        name: "別のスタッフ",
        email: "ambiguous@example.com",
        emailNormalized: "ambiguous@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      // 旧実装が作ったorganizationIdだけの部分移行状態も、再実行でfallback可能なshapeへ戻す。
      await ctx.db.patch(seeded.ambiguousStaffId, { organizationId: shop.organizationId });
      return shop.organizationId;
    });

    await t.mutation(internal.migrations.m011_staffs_to_organization_people.migration, migrationArgs);
    await t.mutation(internal.migrations.m011_staffs_to_organization_people.migration, migrationArgs);

    const [missingEmailPage, ambiguousPage, state] = await Promise.all([
      t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken: "missing-email-migration-session",
        accessKind: "submit",
        recruitmentId: seeded.recruitmentId,
      }),
      t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken: "ambiguous-migration-session",
        accessKind: "submit",
        recruitmentId: seeded.recruitmentId,
      }),
      t.run(async (ctx) => ({
        ambiguousStaff: await ctx.db.get(seeded.ambiguousStaffId),
        conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
        missingEmailStaff: await ctx.db.get(seeded.missingEmailStaffId),
      })),
    ]);

    expect(missingEmailPage.status).toBe("ok");
    expect(ambiguousPage.status).toBe("ok");
    expect(state.missingEmailStaff?.organizationId).toBeUndefined();
    expect(state.missingEmailStaff?.organizationPersonId).toBeUndefined();
    expect(state.ambiguousStaff?.organizationId).toBeUndefined();
    expect(state.ambiguousStaff?.organizationPersonId).toBeUndefined();
    expect(state.conflicts).toHaveLength(2);
    expect(state.conflicts.every((conflict) => conflict.resolvedAt === undefined)).toBe(true);
    expect(state.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId,
          sourceId: seeded.missingEmailStaffId,
          code: "missing_email",
        }),
        expect.objectContaining({
          organizationId,
          sourceId: seeded.ambiguousStaffId,
          code: "ambiguous_email_person",
        }),
      ]),
    );
  });

  it("m011は別userの同一email人物とmissing userを結び付けず、修復後だけ明示的に人物を確定する", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) => {
      const manager = await seedLegacyManagerShop(ctx, {
        subject: "organization_staff_user_identity",
        email: "staff-user-identity@example.com",
        shopName: "スタッフuser識別",
      });
      const foreignUserId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|foreign_staff_identity",
        name: "別利用者",
        email: "foreign-staff-user@example.com",
        emailNormalized: "foreign-staff-user@example.com",
        role: "manager",
        isDeleted: false,
      });
      const danglingUserId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|missing_staff_identity",
        name: "削除済み利用者",
        email: "missing-staff-user@example.com",
        emailNormalized: "missing-staff-user@example.com",
        role: "manager",
        isDeleted: false,
      });
      const foreignEmailStaffId = await ctx.db.insert("staffs", {
        shopId: manager.shopId,
        userId: manager.userId,
        name: "管理者",
        email: "staff-user-identity@example.com",
        emailNormalized: "staff-user-identity@example.com",
        isDeleted: false,
      });
      const missingUserStaffId = await ctx.db.insert("staffs", {
        shopId: manager.shopId,
        userId: danglingUserId,
        name: "user不明スタッフ",
        email: "missing-staff-user@example.com",
        emailNormalized: "missing-staff-user@example.com",
        isDeleted: false,
      });
      await ctx.db.delete(danglingUserId);
      return { ...manager, foreignEmailStaffId, foreignUserId, missingUserStaffId };
    });
    const args = { batchSize: 100, cursor: null, dryRun: false };
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const prepared = await t.run(async (ctx) => {
      const shop = await ctx.db.get(seeded.shopId);
      if (!shop?.organizationId) throw new Error("organization migration failed");
      const now = Date.now();
      const foreignPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: shop.organizationId,
        userId: seeded.foreignUserId,
        name: "管理者",
        email: "staff-user-identity@example.com",
        emailNormalized: "staff-user-identity@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const missingPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: shop.organizationId,
        name: "user不明スタッフ",
        email: "missing-staff-user@example.com",
        emailNormalized: "missing-staff-user@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(seeded.foreignEmailStaffId, {
        organizationId: shop.organizationId,
        organizationPersonId: foreignPersonId,
      });
      await ctx.db.patch(seeded.missingUserStaffId, {
        organizationId: shop.organizationId,
        organizationPersonId: missingPersonId,
      });
      return { foreignPersonId, missingPersonId };
    });

    await t.mutation(internal.migrations.m011_staffs_to_organization_people.migration, args);
    const blocked = await t.run(async (ctx) => ({
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
      foreignPerson: await ctx.db.get(prepared.foreignPersonId),
      foreignStaff: await ctx.db.get(seeded.foreignEmailStaffId),
      missingStaff: await ctx.db.get(seeded.missingUserStaffId),
    }));
    expect(blocked.foreignPerson?.userId).toBe(seeded.foreignUserId);
    expect(blocked.foreignStaff?.organizationId).toBeUndefined();
    expect(blocked.foreignStaff?.organizationPersonId).toBeUndefined();
    expect(blocked.missingStaff?.organizationId).toBeUndefined();
    expect(blocked.missingStaff?.organizationPersonId).toBeUndefined();
    expect(blocked.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: seeded.foreignEmailStaffId,
          code: "linked_person_user_mismatch",
        }),
        expect.objectContaining({ sourceId: seeded.missingUserStaffId, code: "missing_user" }),
      ]),
    );
    expect(blocked.conflicts.every((conflict) => conflict.resolvedAt === undefined)).toBe(true);

    await t.run(async (ctx) => {
      await ctx.db.patch(prepared.foreignPersonId, { userId: undefined });
      await ctx.db.patch(seeded.missingUserStaffId, { userId: undefined });
    });
    await t.mutation(internal.migrations.m011_staffs_to_organization_people.migration, args);
    await t.mutation(internal.migrations.m011_staffs_to_organization_people.migration, args);
    const resolved = await t.run(async (ctx) => {
      const foreignStaff = await ctx.db.get(seeded.foreignEmailStaffId);
      const missingStaff = await ctx.db.get(seeded.missingUserStaffId);
      return {
        conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
        foreignPerson: await ctx.db.get(prepared.foreignPersonId),
        foreignStaff,
        missingPerson: missingStaff?.organizationPersonId ? await ctx.db.get(missingStaff.organizationPersonId) : null,
        missingStaff,
      };
    });
    expect(resolved.foreignPerson?.userId).toBe(seeded.userId);
    expect(resolved.foreignStaff).toMatchObject({ organizationPersonId: prepared.foreignPersonId });
    expect(resolved.missingStaff).toMatchObject({ organizationPersonId: prepared.missingPersonId });
    expect(resolved.missingPerson?.userId).toBeUndefined();
    expect(resolved.conflicts.every((conflict) => conflict.resolvedAt !== undefined)).toBe(true);
  });

  it("衝突原因を修復してcanonical linkを作れた再実行だけresolvedAtを記録する", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) => {
      const manager = await seedLegacyManagerShop(ctx, {
        subject: "organization_conflict_resolution_migration",
        shopName: "衝突修復店舗",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: manager.shopId,
        name: "修復対象スタッフ",
        email: "   ",
        isDeleted: false,
      });
      return { ...manager, staffId };
    });
    await runOrganizationMigrations(t);

    const unresolved = await t.run(async (ctx) => {
      const conflicts = await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "staff").eq("sourceId", seeded.staffId).eq("code", "missing_email"),
        )
        .collect();
      if (conflicts.length !== 1) throw new Error("migration conflict not found");
      return conflicts[0];
    });
    expect(unresolved.resolvedAt).toBeUndefined();

    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.staffId, {
        email: "repaired-staff@example.com",
        emailNormalized: "repaired-staff@example.com",
      });
    });
    const args = { batchSize: 100, cursor: null, dryRun: false };
    await t.mutation(internal.migrations.m011_staffs_to_organization_people.migration, args);
    const resolved = await t.run(async (ctx) => ({
      conflict: await ctx.db.get(unresolved._id),
      staff: await ctx.db.get(seeded.staffId),
    }));
    expect(resolved.staff?.organizationId).toBeDefined();
    expect(resolved.staff?.organizationPersonId).toBeDefined();
    expect(resolved.conflict?.resolvedAt).toEqual(expect.any(Number));

    const resolvedAt = resolved.conflict?.resolvedAt;
    await t.mutation(internal.migrations.m011_staffs_to_organization_people.migration, args);
    expect(await t.run(async (ctx) => (await ctx.db.get(unresolved._id))?.resolvedAt)).toBe(resolvedAt);
  });

  it("同じ管理者でも異なる既存店舗を同一事業者へ自動統合しない", async () => {
    const t = createOrganizationTest();
    const { firstShopId, secondShopId } = await t.run(async (ctx) => {
      const { shopId: firstShopId, userId } = await seedLegacyManagerShop(ctx, {
        subject: "organization_multi_shop_migration",
        shopName: "既存店舗A",
      });
      const secondShopId = await ctx.db.insert("shops", {
        name: "既存店舗B",
        regularClosedDays: [],
        submissionPattern: { kind: "dateOnly" },
        isDeleted: false,
      });
      await ctx.db.insert("shopMembers", {
        shopId: secondShopId,
        userId,
        role: "manager",
        isDeleted: false,
      });
      return { firstShopId, secondShopId };
    });

    await runOrganizationMigrations(t);

    const shops = await t.run(async (ctx) => ({
      first: await ctx.db.get(firstShopId),
      second: await ctx.db.get(secondShopId),
      organizations: await ctx.db.query("organizations").collect(),
    }));

    expect(shops.organizations).toHaveLength(2);
    expect(shops.first?.organizationId).toBeDefined();
    expect(shops.second?.organizationId).toBeDefined();
    expect(shops.first?.organizationId).not.toBe(shops.second?.organizationId);
  });
});

describe("m012 complimentary business migration", () => {
  const args = { batchSize: 100, cursor: null, dryRun: false };

  it("削除済みを含む移行元markerがある事業者だけに課金状態と監査を一件作成し、再実行しても重複しない", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) => {
      const migrated = await seedLegacyManagerShop(ctx, {
        subject: "complimentary_business_migration",
        shopName: "無償Business移行店舗",
      });
      const now = Date.now();
      const newOrganizationId = await ctx.db.insert("organizations", {
        name: "新規事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      return { ...migrated, newOrganizationId };
    });
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const organizationId = await t.run(async (ctx) => {
      const organizations = await ctx.db
        .query("organizations")
        .withIndex("by_migrationSourceShopId", (q) => q.eq("migrationSourceShopId", seeded.shopId))
        .collect();
      if (organizations.length !== 1) throw new Error("organization migration failed");
      return organizations[0]._id;
    });
    await t.run(async (ctx) => await ctx.db.patch(organizationId, { isDeleted: true, updatedAt: Date.now() }));

    await t.mutation(internal.migrations.m012_organizations_add_complimentary_business.migration, args);
    await t.mutation(internal.migrations.m012_organizations_add_complimentary_business.migration, args);

    const result = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) =>
          q.eq("correlationId", `${organizationId}:migration:m012:complimentary-business`),
        )
        .collect(),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
      migratedBillingStates: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .collect(),
      newOrganizationBillingStates: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.newOrganizationId))
        .collect(),
    }));

    expect(result.migratedBillingStates).toHaveLength(1);
    expect(result.migratedBillingStates[0]).toMatchObject({
      organizationId,
      state: { kind: "complimentary", plan: "business" },
      version: 1,
    });
    expect(result.migratedBillingStates[0].createdAt).toBe(result.migratedBillingStates[0].updatedAt);
    expect(result.audits).toEqual([
      expect.objectContaining({
        organizationId,
        action: "organization.billing_state_changed",
        targetKind: "billing",
        targetId: result.migratedBillingStates[0]._id,
        toState: "complimentary.business",
        correlationId: `${organizationId}:migration:m012:complimentary-business`,
      }),
    ]);
    expect(result.newOrganizationBillingStates).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("既存課金状態を上書きせず、修復後はm012所有のconflictだけを解消する", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) =>
      seedLegacyManagerShop(ctx, {
        subject: "complimentary_business_existing_billing",
        shopName: "既存課金状態店舗",
      }),
    );
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const prepared = await t.run(async (ctx) => {
      const organizations = await ctx.db
        .query("organizations")
        .withIndex("by_migrationSourceShopId", (q) => q.eq("migrationSourceShopId", seeded.shopId))
        .collect();
      if (organizations.length !== 1) throw new Error("organization migration failed");
      const organizationId = organizations[0]._id;
      const now = Date.now();
      const billingStateId = await ctx.db.insert("organizationBillingStates", {
        organizationId,
        state: { kind: "active", plan: "business" },
        version: 7,
        createdAt: now - 100,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMigrationConflicts", {
        organizationId,
        sourceType: "shop",
        sourceId: seeded.shopId,
        code: "unrelated_existing_conflict",
        createdAt: now,
      });
      return { billingStateId, organizationId };
    });

    await t.mutation(internal.migrations.m012_organizations_add_complimentary_business.migration, args);
    await t.mutation(internal.migrations.m012_organizations_add_complimentary_business.migration, args);

    const blocked = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", prepared.organizationId))
        .collect(),
      billingStates: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", prepared.organizationId))
        .collect(),
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "shop").eq("sourceId", seeded.shopId),
        )
        .collect(),
    }));
    expect(blocked.billingStates.map((state) => state._id)).toEqual([prepared.billingStateId]);
    expect(blocked.billingStates[0]).toMatchObject({ state: { kind: "active", plan: "business" }, version: 7 });
    expect(blocked.audits).toEqual([]);
    expect(
      blocked.conflicts
        .map(({ code, resolvedAt }) => ({ code, resolvedAt }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    ).toEqual([
      { code: "complimentary_business_existing_billing_state", resolvedAt: undefined },
      { code: "unrelated_existing_conflict", resolvedAt: undefined },
    ]);

    await t.run(async (ctx) => await ctx.db.delete(prepared.billingStateId));
    await t.mutation(internal.migrations.m012_organizations_add_complimentary_business.migration, args);
    await t.mutation(internal.migrations.m012_organizations_add_complimentary_business.migration, args);

    const repaired = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", prepared.organizationId))
        .collect(),
      billingStates: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", prepared.organizationId))
        .collect(),
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "shop").eq("sourceId", seeded.shopId),
        )
        .collect(),
    }));
    expect(repaired.billingStates).toHaveLength(1);
    expect(repaired.billingStates[0]).toMatchObject({
      state: { kind: "complimentary", plan: "business" },
      version: 1,
    });
    expect(repaired.audits).toHaveLength(1);
    expect(
      repaired.conflicts
        .map(({ code, resolvedAt }) => ({
          code,
          resolved: resolvedAt !== undefined,
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    ).toEqual([
      { code: "complimentary_business_existing_billing_state", resolved: true },
      { code: "unrelated_existing_conflict", resolved: false },
    ]);
  });

  it("重複課金状態を任意に採用せず、一件のconflictとして再実行可能に停止する", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) =>
      seedLegacyManagerShop(ctx, {
        subject: "complimentary_business_duplicate_billing",
        shopName: "課金状態重複店舗",
      }),
    );
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const prepared = await t.run(async (ctx) => {
      const organizations = await ctx.db
        .query("organizations")
        .withIndex("by_migrationSourceShopId", (q) => q.eq("migrationSourceShopId", seeded.shopId))
        .collect();
      if (organizations.length !== 1) throw new Error("organization migration failed");
      const organizationId = organizations[0]._id;
      const now = Date.now();
      const billingStateIds = [
        await ctx.db.insert("organizationBillingStates", {
          organizationId,
          state: { kind: "trial", trialEndsAt: now + 1_000 },
          version: 1,
          createdAt: now,
          updatedAt: now,
        }),
        await ctx.db.insert("organizationBillingStates", {
          organizationId,
          state: { kind: "active", plan: "pro" },
          version: 2,
          createdAt: now,
          updatedAt: now,
        }),
      ];
      return { billingStateIds, organizationId };
    });

    await t.mutation(internal.migrations.m012_organizations_add_complimentary_business.migration, args);
    await t.mutation(internal.migrations.m012_organizations_add_complimentary_business.migration, args);

    const result = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", prepared.organizationId))
        .collect(),
      billingStates: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", prepared.organizationId))
        .collect(),
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q
            .eq("sourceType", "shop")
            .eq("sourceId", seeded.shopId)
            .eq("code", "complimentary_business_ambiguous_billing_states"),
        )
        .collect(),
    }));
    expect(result.billingStates.map((state) => state._id)).toEqual(prepared.billingStateIds);
    expect(result.audits).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].resolvedAt).toBeUndefined();
  });

  it("移行元店舗の欠損・相互リンク不一致・marker重複をcode別conflictにして付与を止める", async () => {
    const t = createOrganizationTest();
    const seeded = await t.run(async (ctx) => {
      const missing = await seedLegacyManagerShop(ctx, {
        subject: "complimentary_business_missing_source",
        shopName: "移行元欠損店舗",
      });
      const mismatch = await seedLegacyManagerShop(ctx, {
        subject: "complimentary_business_link_mismatch",
        shopName: "相互リンク不一致店舗",
      });
      const duplicate = await seedLegacyManagerShop(ctx, {
        subject: "complimentary_business_duplicate_marker",
        shopName: "移行元marker重複店舗",
      });
      return { duplicate, mismatch, missing };
    });
    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, args);
    const prepared = await t.run(async (ctx) => {
      const getOrganizationId = async (shopId: typeof seeded.missing.shopId) => {
        const organizations = await ctx.db
          .query("organizations")
          .withIndex("by_migrationSourceShopId", (q) => q.eq("migrationSourceShopId", shopId))
          .collect();
        if (organizations.length !== 1) throw new Error("organization migration failed");
        return organizations[0]._id;
      };
      await getOrganizationId(seeded.missing.shopId);
      await getOrganizationId(seeded.mismatch.shopId);
      const duplicateOrganizationId = await getOrganizationId(seeded.duplicate.shopId);
      const now = Date.now();
      const duplicateMarkerOrganizationId = await ctx.db.insert("organizations", {
        migrationSourceShopId: seeded.duplicate.shopId,
        name: "重複marker事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMigrationConflicts", {
        organizationId: duplicateOrganizationId,
        sourceType: "shop",
        sourceId: seeded.duplicate.shopId,
        code: "unrelated_duplicate_marker_conflict",
        createdAt: now,
      });
      await ctx.db.delete(seeded.missing.shopId);
      await ctx.db.patch(seeded.mismatch.shopId, { organizationId: duplicateOrganizationId });
      return {
        duplicateMarkerOrganizationId,
        duplicateOrganizationId,
      };
    });

    await t.mutation(internal.migrations.m012_organizations_add_complimentary_business.migration, args);
    await t.mutation(internal.migrations.m012_organizations_add_complimentary_business.migration, args);

    const blocked = await t.run(async (ctx) => ({
      audits: await ctx.db.query("organizationAuditEvents").collect(),
      billingStates: await ctx.db.query("organizationBillingStates").collect(),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
    }));
    expect(blocked.audits).toEqual([]);
    expect(blocked.billingStates).toEqual([]);
    expect(
      blocked.conflicts
        .map(({ sourceId, code, resolvedAt }) => ({ sourceId, code, resolvedAt }))
        .sort((a, b) => `${a.sourceId}:${a.code}`.localeCompare(`${b.sourceId}:${b.code}`)),
    ).toEqual(
      [
        {
          sourceId: seeded.missing.shopId,
          code: "complimentary_business_missing_source_shop",
          resolvedAt: undefined,
        },
        {
          sourceId: seeded.mismatch.shopId,
          code: "complimentary_business_source_shop_organization_mismatch",
          resolvedAt: undefined,
        },
        {
          sourceId: seeded.duplicate.shopId,
          code: "complimentary_business_ambiguous_source_organization",
          resolvedAt: undefined,
        },
        {
          sourceId: seeded.duplicate.shopId,
          code: "complimentary_business_source_shop_organization_mismatch",
          resolvedAt: undefined,
        },
        {
          sourceId: seeded.duplicate.shopId,
          code: "unrelated_duplicate_marker_conflict",
          resolvedAt: undefined,
        },
      ].sort((a, b) => `${a.sourceId}:${a.code}`.localeCompare(`${b.sourceId}:${b.code}`)),
    );

    await t.run(async (ctx) => await ctx.db.delete(prepared.duplicateMarkerOrganizationId));
    await t.mutation(internal.migrations.m012_organizations_add_complimentary_business.migration, args);
    await t.mutation(internal.migrations.m012_organizations_add_complimentary_business.migration, args);

    const repaired = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", prepared.duplicateOrganizationId))
        .collect(),
      billingStates: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", prepared.duplicateOrganizationId))
        .collect(),
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "shop").eq("sourceId", seeded.duplicate.shopId),
        )
        .collect(),
    }));
    expect(repaired.audits).toHaveLength(1);
    expect(repaired.billingStates).toHaveLength(1);
    expect(repaired.billingStates[0].state).toEqual({ kind: "complimentary", plan: "business" });
    expect(
      repaired.conflicts
        .map(({ code, resolvedAt }) => ({ code, resolved: resolvedAt !== undefined }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    ).toEqual([
      { code: "complimentary_business_ambiguous_source_organization", resolved: true },
      { code: "complimentary_business_source_shop_organization_mismatch", resolved: true },
      { code: "unrelated_duplicate_marker_conflict", resolved: false },
    ]);
  });
});
