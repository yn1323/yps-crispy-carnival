import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { seedStaff } from "./scenarioBuilders";
import { seedManagerShop, seedOrganizationMembership, seedShop, seedUser } from "./seed";
import { modules, schema } from "./setup.test-helper";

describe("test seed contracts", () => {
  it("通常fixtureは店舗・管理者所属・スタッフをcanonical形式で作る", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const manager = await seedManagerShop(ctx, {
        subject: "canonical_fixture_manager",
        shopName: "管理店舗",
      });
      const standaloneShopId = await seedShop(ctx, "単独店舗");
      const secondUserId = await seedUser(ctx, "canonical_fixture_second_manager");
      const secondMemberId = await seedOrganizationMembership(ctx, {
        shopId: manager.shopId,
        userId: secondUserId,
      });
      const staffId = await seedStaff(ctx, {
        shopId: manager.shopId,
        name: "スタッフ",
        email: "STAFF@example.com",
      });
      return { ...manager, secondMemberId, staffId, standaloneShopId };
    });

    const snapshot = await t.run(async (ctx) => {
      const staff = await ctx.db.get(seeded.staffId);
      return {
        managerShop: await ctx.db.get(seeded.shopId),
        standaloneShop: await ctx.db.get(seeded.standaloneShopId),
        secondMember: await ctx.db.get(seeded.secondMemberId),
        staff,
        staffPerson: staff?.organizationPersonId ? await ctx.db.get(staff.organizationPersonId) : null,
        legacyMemberships: await ctx.db.query("shopMembers").collect(),
      };
    });

    expect(snapshot.managerShop).toMatchObject({
      organizationId: seeded.organizationId,
      isDeleted: false,
    });
    expect(snapshot.standaloneShop?.organizationId).toBeDefined();
    expect(snapshot.standaloneShop?.isDeleted).toBe(false);
    expect(snapshot.secondMember).toMatchObject({
      organizationId: seeded.organizationId,
      status: "active",
    });
    expect(snapshot.staff).toMatchObject({
      organizationId: seeded.organizationId,
      shopId: seeded.shopId,
      emailNormalized: "staff@example.com",
      excludedFromShift: false,
    });
    expect(snapshot.staff?.organizationPersonId).toBeDefined();
    expect(snapshot.staffPerson).toMatchObject({
      organizationId: seeded.organizationId,
      emailNormalized: "staff@example.com",
      status: "active",
    });
    expect(snapshot.legacyMemberships).toEqual([]);
  });
});
