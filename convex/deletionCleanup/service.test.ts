import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { seedLegacyShop, seedLegacyShopMembership, seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getActiveUserAssociationStatus, getOtherActiveUserAssociationStatus } from "./service";

describe("deletionCleanup association scan", () => {
  it("除外なしscanは有効なcanonical所属をfound、所属なしをnoneにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => ({
      associated: await seedOrganizationManagerShop(ctx, { subject: "association_found", plan: "free" }),
      noneUserId: await seedUser(ctx, "association_none"),
    }));

    await expect(t.run((ctx) => getActiveUserAssociationStatus(ctx, ids.associated.userId))).resolves.toBe("found");
    await expect(t.run((ctx) => getActiveUserAssociationStatus(ctx, ids.noneUserId))).resolves.toBe("none");
  });

  it("active member/personの親参照が欠損または不整合ならunknownにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const missingPerson = await seedOrganizationManagerShop(ctx, {
        subject: "association_missing_person",
        plan: "free",
      });
      await ctx.db.delete(missingPerson.personId);

      const orphanPersonUserId = await seedUser(ctx, "association_orphan_person");
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        name: "親欠損グループ",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationPeople", {
        organizationId,
        userId: orphanPersonUserId,
        name: "親欠損人物",
        email: "association-orphan-person@example.com",
        emailNormalized: "association-orphan-person@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.delete(organizationId);
      return { missingPersonUserId: missingPerson.userId, orphanPersonUserId };
    });

    await expect(t.run((ctx) => getActiveUserAssociationStatus(ctx, ids.missingPersonUserId))).resolves.toBe("unknown");
    await expect(t.run((ctx) => getActiveUserAssociationStatus(ctx, ids.orphanPersonUserId))).resolves.toBe("unknown");
  });

  it("nondeleted staff/shopMemberのshop・organization欠損や不整合はunknownにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const missingStaffShopUserId = await seedUser(ctx, "association_missing_staff_shop");
      const missingStaffShopId = await seedLegacyShop(ctx, "削除するstaff親店舗");
      await ctx.db.insert("staffs", {
        shopId: missingStaffShopId,
        userId: missingStaffShopUserId,
        name: "親欠損スタッフ",
        email: "missing-staff-shop@example.com",
        emailNormalized: "missing-staff-shop@example.com",
        isDeleted: false,
      });
      await ctx.db.delete(missingStaffShopId);

      const missingMemberShopUserId = await seedUser(ctx, "association_missing_member_shop");
      const missingMemberShopId = await seedLegacyShop(ctx, "削除するmember親店舗");
      await seedLegacyShopMembership(ctx, { userId: missingMemberShopUserId, shopId: missingMemberShopId });
      await ctx.db.delete(missingMemberShopId);

      const mismatchedStaffUserId = await seedUser(ctx, "association_mismatched_staff");
      const first = await seedOrganizationManagerShop(ctx, { subject: "association_staff_org_a", plan: "free" });
      const second = await seedOrganizationManagerShop(ctx, { subject: "association_staff_org_b", plan: "free" });
      await ctx.db.insert("staffs", {
        shopId: first.shopId,
        organizationId: second.organizationId,
        userId: mismatchedStaffUserId,
        name: "不整合スタッフ",
        email: "mismatched-staff@example.com",
        emailNormalized: "mismatched-staff@example.com",
        isDeleted: false,
      });
      return { missingStaffShopUserId, missingMemberShopUserId, mismatchedStaffUserId };
    });

    for (const userId of Object.values(ids)) {
      await expect(t.run((ctx) => getActiveUserAssociationStatus(ctx, userId))).resolves.toBe("unknown");
    }
  });

  it("除外scope内のlegacy重複はscan上限へ数えず、既存の組織cleanup判定を維持する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "association_excluded_legacy", plan: "free" });
      const now = Date.now();
      for (let index = 0; index < 20; index += 1) {
        await ctx.db.insert("organizationMembers", {
          organizationId: seeded.organizationId,
          personId: seeded.personId,
          userId: seeded.userId,
          status: "active",
          createdAt: now + index,
          updatedAt: now + index,
        });
      }
      return seeded;
    });

    await expect(t.run((ctx) => getActiveUserAssociationStatus(ctx, ids.userId))).resolves.toBe("unknown");
    await expect(
      t.run((ctx) => getOtherActiveUserAssociationStatus(ctx, ids.userId, ids.organizationId)),
    ).resolves.toBe("none");
  });
});
