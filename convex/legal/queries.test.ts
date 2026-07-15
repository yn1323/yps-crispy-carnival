import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getLegalConsentVersions, getLegalDocumentsForAudience } from "./documents";

describe("legal/queries", () => {
  describe("getStaffConsentPageData", () => {
    it("有効なtokenでは必要最小限の同意画面データを返す", async () => {
      const t = convexTest(schema, modules);
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
      await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "同意対象店舗");
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "同意対象スタッフ",
          email: "consent@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("legalConsentTokens", {
          staffId,
          shopId,
          token: "valid-consent-token",
          method: "staff_email_link",
          expiresAt,
        });
      });

      const result = await t.query(api.legal.queries.getStaffConsentPageData, {
        token: "valid-consent-token",
      });

      expect(result).toEqual({
        status: "ok",
        staffName: "同意対象スタッフ",
        shopName: "同意対象店舗",
        expiresAt,
        documents: getLegalDocumentsForAudience("staff"),
      });
    });

    it("失効・期限切れ・使用済みtokenは店舗情報を返さない", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "失効確認店舗");
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "失効確認スタッフ",
          email: "expired@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("legalConsentTokens", {
          staffId,
          shopId,
          token: "revoked-consent-token",
          method: "staff_email_link",
          expiresAt: Date.now() + 1000,
          revokedAt: Date.now(),
        });
        await ctx.db.insert("legalConsentTokens", {
          staffId,
          shopId,
          token: "expired-consent-token",
          method: "staff_email_link",
          expiresAt: Date.now() - 1,
        });
        await ctx.db.insert("legalConsentTokens", {
          staffId,
          shopId,
          token: "used-consent-token",
          method: "staff_email_link",
          expiresAt: Date.now() + 1000,
          usedAt: Date.now(),
        });
      });

      for (const token of [
        "missing-consent-token",
        "revoked-consent-token",
        "expired-consent-token",
        "used-consent-token",
      ]) {
        await expect(t.query(api.legal.queries.getStaffConsentPageData, { token })).resolves.toEqual({
          status: "expired",
          documents: getLegalDocumentsForAudience("staff"),
        });
      }
    });

    it("同意済みスタッフには使用済みtokenでも同意済み状態を返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "同意済み店舗");
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "同意済みスタッフ",
          email: "accepted@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("legalConsentStates", {
          subjectType: "staff",
          staffId,
          shopId,
          ...getLegalConsentVersions("staff"),
          consentedAt: Date.now(),
          method: "staff_email_link",
        });
        await ctx.db.insert("legalConsentTokens", {
          staffId,
          shopId,
          token: "accepted-consent-token",
          method: "staff_email_link",
          expiresAt: Date.now() + 1000,
          usedAt: Date.now(),
        });
      });

      await expect(
        t.query(api.legal.queries.getStaffConsentPageData, { token: "accepted-consent-token" }),
      ).resolves.toEqual({
        status: "accepted",
        staffName: "同意済みスタッフ",
        shopName: "同意済み店舗",
        documents: getLegalDocumentsForAudience("staff"),
      });
    });

    it("tokenの店舗とスタッフ所属店舗が一致しない場合は無効として扱う", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const staffShopId = await seedShop(ctx, "スタッフ所属店舗");
        const tokenShopId = await seedShop(ctx, "token対象店舗");
        const staffId = await ctx.db.insert("staffs", {
          shopId: staffShopId,
          name: "別店舗スタッフ",
          email: "cross-shop@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("legalConsentTokens", {
          staffId,
          shopId: tokenShopId,
          token: "cross-shop-consent-token",
          method: "staff_email_link",
          expiresAt: Date.now() + 1000,
        });
      });

      await expect(
        t.query(api.legal.queries.getStaffConsentPageData, { token: "cross-shop-consent-token" }),
      ).resolves.toEqual({
        status: "expired",
        documents: getLegalDocumentsForAudience("staff"),
      });
    });
  });
});
