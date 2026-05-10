import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { seedManagerShop, seedUser, testAuthTokenIdentifier } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const setupArgs = {
  shopName: "テスト店舗",
  shiftStartTime: "09:00",
  shiftEndTime: "22:00",
  ownerName: "山田 太郎",
  ownerEmail: "yamada@example.com",
  acceptedLegal: true as const,
};

describe("setup/mutations", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe("setupShopAndOwner", () => {
    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await expect(t.mutation(api.setup.mutations.setupShopAndOwner, setupArgs)).rejects.toThrow();
    });

    it("同意なしではエラー", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.withIdentity({ subject: "user_without_legal" }).mutation(api.setup.mutations.setupShopAndOwner, {
          ...setupArgs,
          acceptedLegal: false as true,
        }),
      ).rejects.toThrow();
    });

    it("店舗・ユーザー・スタッフ・同意履歴をトランザクションで作成する", async () => {
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({
        subject: "user_new",
        name: "新規ユーザー",
        email: "new@example.com",
      });

      const shopId = await asUser.mutation(api.setup.mutations.setupShopAndOwner, setupArgs);
      expect(shopId).toBeDefined();

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.name).toBe("テスト店舗");

      const user = await t.run(async (ctx) =>
        ctx.db
          .query("users")
          .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", testAuthTokenIdentifier("user_new")))
          .first(),
      );
      expect(user).not.toBeNull();
      if (!user) throw new Error("user not found");
      expect(user?.name).toBe("山田 太郎");
      expect(user?.email).toBe("yamada@example.com");
      expect(user?.role).toBe("manager");
      const consentState = await t.run(async (ctx) =>
        ctx.db
          .query("legalConsentStates")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .first(),
      );
      expect(consentState?.termsConsentVersion).toBe("manager-terms-consent-2026-05-09");
      expect(consentState?.privacyConsentVersion).toBe("manager-privacy-consent-2026-05-09");
      expect(consentState?.termsDocumentVersion).toBe("manager-terms-doc-2026-05-09");
      expect(consentState?.privacyDocumentVersion).toBe("manager-privacy-doc-2026-05-09");
      expect(consentState?.method).toBe("manager_setup");

      const staffs = await t.run(async (ctx) =>
        ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .collect(),
      );
      expect(staffs).toHaveLength(1);
      expect(staffs[0].name).toBe("山田 太郎");
      expect(staffs[0].email).toBe("yamada@example.com");
      expect(staffs[0].userId).toBe(user?._id);

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some((job) => job.name === "line/actions:sendInviteEmail" && job.args[0]?.staffId === staffs[0]._id),
      ).toBe(true);

      const consentEvents = await t.run(async (ctx) =>
        ctx.db
          .query("legalConsentEvents")
          .withIndex("by_userId", (q) => q.eq("userId", user?._id))
          .collect(),
      );
      expect(consentEvents).toHaveLength(1);
      expect(consentEvents[0].method).toBe("manager_setup");
    });

    it("既に店舗がある場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await seedManagerShop(ctx, {
          subject: "user_existing",
          email: "ex@example.com",
          shopName: "既存店舗",
        });
      });

      await expect(
        t.withIdentity({ subject: "user_existing" }).mutation(api.setup.mutations.setupShopAndOwner, setupArgs),
      ).rejects.toThrow(ConvexError);
    });

    it("既存ユーザーレコードがある場合は名前・メールと同意を更新する", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await seedUser(ctx, "user_has_record", "old@example.com");
      });

      await t.withIdentity({ subject: "user_has_record" }).mutation(api.setup.mutations.setupShopAndOwner, setupArgs);

      const user = await t.run(async (ctx) =>
        ctx.db
          .query("users")
          .withIndex("by_authTokenIdentifier", (q) =>
            q.eq("authTokenIdentifier", testAuthTokenIdentifier("user_has_record")),
          )
          .first(),
      );
      if (!user) throw new Error("user not found");
      expect(user?.name).toBe("山田 太郎");
      expect(user?.email).toBe("yamada@example.com");
      const consentState = await t.run(async (ctx) =>
        ctx.db
          .query("legalConsentStates")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .first(),
      );
      expect(consentState?.method).toBe("manager_setup");
    });
  });
});
