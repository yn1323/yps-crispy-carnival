import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { seedManagerShop, seedOrganizationManagerShop, seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getLegalDocumentsForAudience } from "../legal/documents";

describe("staffRegistration/queries", () => {
  describe("getRegistrationPageData", () => {
    it("有効な登録tokenでは店舗名とスタッフ向け法務文書だけを返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "参加先店舗");
        await ctx.db.insert("shopRegistrationLinks", {
          shopId,
          token: "active-registration-token",
          createdAt: Date.now(),
        });
      });

      await expect(
        t.query(api.staffRegistration.queries.getRegistrationPageData, {
          token: "active-registration-token",
        }),
      ).resolves.toEqual({
        status: "ok",
        shopName: "参加先店舗",
        documents: getLegalDocumentsForAudience("staff"),
      });
    });

    it("同一tokenが異なる店舗に重複している場合は店舗情報を返さない", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        for (const index of [1, 2]) {
          const shopId = await seedShop(ctx, `重複登録token対象店舗${index}`);
          await ctx.db.insert("shopRegistrationLinks", {
            shopId,
            token: "duplicate-page-registration-token",
            createdAt: Date.now(),
          });
        }
      });

      await expect(
        t.query(api.staffRegistration.queries.getRegistrationPageData, {
          token: "duplicate-page-registration-token",
        }),
      ).resolves.toEqual({
        status: "expired",
        documents: getLegalDocumentsForAudience("staff"),
      });
    });

    it.each([
      "archived",
      "planSuspended",
      "restricted",
    ] as const)("%s状態の店舗は登録ページに店舗情報を返さない", async (blockedState) => {
      const t = convexTest(schema, modules);
      const token = `blocked-registration-page-${blockedState}`;
      await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: `blocked_registration_page_${blockedState}`,
          plan: "pro",
        });
        if (blockedState === "archived" || blockedState === "planSuspended") {
          await ctx.db.patch(seeded.shopId, { operatingStatus: blockedState });
        } else {
          const billingState = await ctx.db
            .query("organizationBillingStates")
            .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
            .unique();
          if (!billingState) throw new Error("billing state not found");
          await ctx.db.patch(billingState._id, {
            state: {
              kind: "restricted",
              reason: "freeConditionsNotMet",
              previousPlan: "pro",
              recoveryManagerPersonIds: [seeded.personId],
              previousActiveShopIds: [seeded.shopId],
              restrictedAt: Date.now(),
            },
          });
        }
        await ctx.db.insert("shopRegistrationLinks", {
          shopId: seeded.shopId,
          token,
          createdAt: Date.now(),
        });
      });

      await expect(t.query(api.staffRegistration.queries.getRegistrationPageData, { token })).resolves.toEqual({
        status: "expired",
        documents: getLegalDocumentsForAudience("staff"),
      });
    });

    it("存在しない・失効済みtokenと削除済み店舗はexpiredを返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const activeShopId = await seedShop(ctx, "有効店舗");
        const deletedShopId = await seedShop(ctx, "削除済み店舗");
        await ctx.db.patch(deletedShopId, { isDeleted: true });
        await ctx.db.insert("shopRegistrationLinks", {
          shopId: activeShopId,
          token: "revoked-registration-token",
          createdAt: Date.now(),
          revokedAt: Date.now(),
        });
        await ctx.db.insert("shopRegistrationLinks", {
          shopId: deletedShopId,
          token: "deleted-shop-registration-token",
          createdAt: Date.now(),
        });
      });

      for (const token of [
        "missing-registration-token",
        "revoked-registration-token",
        "deleted-shop-registration-token",
      ]) {
        await expect(t.query(api.staffRegistration.queries.getRegistrationPageData, { token })).resolves.toEqual({
          status: "expired",
          documents: getLegalDocumentsForAudience("staff"),
        });
      }
    });
  });

  describe("manager query", () => {
    it("自店舗の有効な登録linkだけを返し、未認証では返さない", async () => {
      const t = convexTest(schema, modules);
      const { ownShopId, otherShopId } = await t.run(async (ctx) => {
        const own = await seedManagerShop(ctx, {
          subject: "registration_manager",
          email: "registration-manager@example.com",
          shopName: "自店舗",
        });
        const other = await seedManagerShop(ctx, {
          subject: "other_registration_manager",
          email: "other-registration-manager@example.com",
          shopName: "他店舗",
        });
        await ctx.db.insert("shopRegistrationLinks", {
          shopId: own.shopId,
          token: "revoked-own-token",
          createdAt: Date.now() - 1,
          revokedAt: Date.now(),
        });
        await ctx.db.insert("shopRegistrationLinks", {
          shopId: own.shopId,
          token: "active-own-token",
          createdAt: Date.now(),
        });
        await ctx.db.insert("shopRegistrationLinks", {
          shopId: other.shopId,
          token: "active-other-token",
          createdAt: Date.now(),
        });
        return { ownShopId: own.shopId, otherShopId: other.shopId };
      });

      await expect(
        t.query(api.staffRegistration.queries.getActiveRegistrationLink, { shopId: ownShopId }),
      ).resolves.toBeNull();
      await expect(
        t
          .withIdentity({ subject: "registration_manager" })
          .query(api.staffRegistration.queries.getActiveRegistrationLink, { shopId: ownShopId }),
      ).resolves.toEqual({
        token: "active-own-token",
        registrationUrl: expect.stringContaining("/staff/register?token=active-own-token"),
      });
      await expect(
        t
          .withIdentity({ subject: "registration_manager" })
          .query(api.staffRegistration.queries.getActiveRegistrationLink, { shopId: otherShopId }),
      ).resolves.toBeNull();
    });

    it("承認待ち申請は自店舗のpendingだけを最小DTOで返す", async () => {
      const t = convexTest(schema, modules);
      const ownShopId = await t.run(async (ctx) => {
        const own = await seedManagerShop(ctx, {
          subject: "pending_request_manager",
          email: "pending-request-manager@example.com",
          shopName: "申請確認店舗",
        });
        const otherShopId = await seedShop(ctx, "別店舗");
        const base = {
          termsConsentVersion: "terms-consent",
          privacyConsentVersion: "privacy-consent",
          termsDocumentVersion: "terms-document",
          privacyDocumentVersion: "privacy-document",
          consentedAt: Date.now(),
          createdAt: Date.now(),
        };
        await ctx.db.insert("staffRegistrationRequests", {
          ...base,
          shopId: own.shopId,
          name: "承認待ちスタッフ",
          email: "pending@example.com",
          emailNormalized: "pending@example.com",
          status: "pending",
        });
        await ctx.db.insert("staffRegistrationRequests", {
          ...base,
          shopId: own.shopId,
          name: "承認済みスタッフ",
          email: "approved@example.com",
          emailNormalized: "approved@example.com",
          status: "approved",
        });
        await ctx.db.insert("staffRegistrationRequests", {
          ...base,
          shopId: otherShopId,
          name: "別店舗スタッフ",
          email: "other@example.com",
          emailNormalized: "other@example.com",
          status: "pending",
        });
        return own.shopId;
      });

      const result = await t
        .withIdentity({ subject: "pending_request_manager" })
        .query(api.staffRegistration.queries.getPendingRequests, { shopId: ownShopId });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        _id: expect.any(String),
        name: "承認待ちスタッフ",
        email: "pending@example.com",
        createdAt: expect.any(Number),
      });
    });
  });
});
