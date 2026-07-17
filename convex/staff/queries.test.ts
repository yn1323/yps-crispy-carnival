import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("staff/queries", () => {
  describe("listOrganizationPeopleAvailableForShop", () => {
    it("未認証では候補を返さない", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(
        async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "candidate_manager" }),
      );

      await expect(t.query(api.staff.queries.listOrganizationPeopleAvailableForShop, { shopId })).resolves.toEqual([]);
    });

    it("同じグループの有効人物から対象店舗に未所属の人物だけを返す", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "candidate_manager",
          email: "manager@example.com",
          shopName: "本店",
          plan: "pro",
        });
        const otherShopId = await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          operatingStatus: "active",
          name: "2号店",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        const now = Date.now();
        const otherShopPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "他店舗スタッフ",
          email: "Other@Example.com",
          emailNormalized: "other@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          shopId: otherShopId,
          organizationId: base.organizationId,
          organizationPersonId: otherShopPersonId,
          name: "他店舗表示名",
          email: "other@example.com",
          emailNormalized: "other@example.com",
          isDeleted: false,
        });
        const deletedShopId = await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          operatingStatus: "active",
          name: "削除済み店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: true,
        });
        await ctx.db.insert("staffs", {
          shopId: deletedShopId,
          organizationId: base.organizationId,
          organizationPersonId: otherShopPersonId,
          name: "削除待ち表示名",
          email: "other@example.com",
          emailNormalized: "other@example.com",
          isDeleted: false,
        });
        const currentPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "本店スタッフ",
          email: "current@example.com",
          emailNormalized: "current@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: currentPersonId,
          name: "本店スタッフ",
          email: "current@example.com",
          emailNormalized: "current@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "削除済み人物",
          email: "removed@example.com",
          emailNormalized: "removed@example.com",
          status: "removed",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "参加申請待ち",
          email: "pending@example.com",
          emailNormalized: "pending@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffRegistrationRequests", {
          shopId: base.shopId,
          name: "参加申請待ち",
          email: "pending@example.com",
          emailNormalized: "pending@example.com",
          status: "pending",
          termsConsentVersion: "terms-v1",
          privacyConsentVersion: "privacy-v1",
          termsDocumentVersion: "terms-doc-v1",
          privacyDocumentVersion: "privacy-doc-v1",
          consentedAt: now,
          createdAt: now,
        });
        await seedOrganizationManagerShop(ctx, {
          subject: "foreign_candidate_manager",
          email: "foreign@example.com",
          shopName: "別グループ店舗",
        });
        return { ...base, otherShopPersonId };
      });

      const result = await t
        .withIdentity({ subject: "candidate_manager" })
        .query(api.staff.queries.listOrganizationPeopleAvailableForShop, { shopId: seeded.shopId });

      expect(result).toEqual([
        {
          personId: seeded.personId,
          name: "管理者",
          email: "manager@example.com",
          shopNames: [],
          isManager: true,
        },
        {
          personId: seeded.otherShopPersonId,
          name: "他店舗スタッフ",
          email: "Other@Example.com",
          shopNames: ["2号店"],
          isManager: false,
        },
      ]);
    });

    it("対象店舗に人物ID未移行の同一メールスタッフがいる場合も候補から除外する", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "legacy_candidate_manager",
          plan: "pro",
        });
        const now = Date.now();
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "移行前スタッフ",
          email: "Legacy@Example.com",
          emailNormalized: "legacy@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          shopId: base.shopId,
          name: "移行前スタッフ",
          email: "legacy@example.com",
          isDeleted: false,
        });
        return { ...base, legacyPersonId: personId };
      });

      const result = await t
        .withIdentity({ subject: "legacy_candidate_manager" })
        .query(api.staff.queries.listOrganizationPeopleAvailableForShop, { shopId: seeded.shopId });

      expect(result).toEqual([
        {
          personId: seeded.personId,
          name: "管理者",
          email: "legacy_candidate_manager@example.com",
          shopNames: [],
          isManager: true,
        },
      ]);
    });

    it("閲覧専用の管理者には追加候補を返さない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "readonly_candidate_manager",
          plan: "pro",
        });
        await ctx.db.patch(base.memberId, { status: "readOnly" });
        const now = Date.now();
        await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "追加候補",
          email: "readonly-candidate@example.com",
          emailNormalized: "readonly-candidate@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        return base;
      });

      await expect(
        t
          .withIdentity({ subject: "readonly_candidate_manager" })
          .query(api.staff.queries.listOrganizationPeopleAvailableForShop, { shopId: seeded.shopId }),
      ).resolves.toEqual([]);
    });

    it("人物のメール正規化が不整合な場合は不完全な候補一覧を返さない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "invalid_candidate_manager",
          plan: "pro",
        });
        const now = Date.now();
        await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "不整合候補",
          email: "invalid-candidate@example.com",
          emailNormalized: "different@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        return base;
      });

      await expect(
        t
          .withIdentity({ subject: "invalid_candidate_manager" })
          .query(api.staff.queries.listOrganizationPeopleAvailableForShop, { shopId: seeded.shopId }),
      ).resolves.toBeNull();
    });

    it("候補上限を超える場合は一部だけを返さない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "many_candidate_manager",
          plan: "business",
        });
        const now = Date.now();
        for (let index = 0; index < 100; index += 1) {
          const email = `candidate-${index}@example.com`;
          await ctx.db.insert("organizationPeople", {
            organizationId: base.organizationId,
            name: `候補${index}`,
            email,
            emailNormalized: email,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
        }
        return base;
      });

      await expect(
        t
          .withIdentity({ subject: "many_candidate_manager" })
          .query(api.staff.queries.listOrganizationPeopleAvailableForShop, { shopId: seeded.shopId }),
      ).resolves.toBeNull();
    });
  });
});
