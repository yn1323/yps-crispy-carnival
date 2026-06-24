import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { seedManagerShop, seedShop, seedShopMembership, seedUser, testAuthTokenIdentifier } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { PERSON_NAME_MAX_LENGTH, SHOP_NAME_MAX_LENGTH } from "../constants";

const setupArgs = {
  shopName: "テスト店舗",
  submissionPattern: { kind: "dateOnly" as const },
  managerName: "山田 太郎",
  managerEmail: "yamada@example.com",
  acceptedLegal: true as const,
};

describe("setup/mutations", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe("setupShopAndManager", () => {
    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await expect(t.mutation(api.setup.mutations.setupShopAndManager, setupArgs)).rejects.toThrow();
    });

    it("同意なしではエラー", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.withIdentity({ subject: "user_without_legal" }).mutation(api.setup.mutations.setupShopAndManager, {
          ...setupArgs,
          acceptedLegal: false as true,
        }),
      ).rejects.toThrow();
    });

    it("店舗名・管理者名・管理者メールをサーバー側でも検証する", async () => {
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({ subject: "user_invalid_setup" });

      await expect(
        asUser.mutation(api.setup.mutations.setupShopAndManager, {
          ...setupArgs,
          shopName: "あ".repeat(SHOP_NAME_MAX_LENGTH + 1),
        }),
      ).rejects.toThrow("店舗名は80文字以内で入力してください");
      await expect(
        asUser.mutation(api.setup.mutations.setupShopAndManager, {
          ...setupArgs,
          managerName: "山田\n太郎",
        }),
      ).rejects.toThrow("名前に使用できない文字が含まれています");
      await expect(
        asUser.mutation(api.setup.mutations.setupShopAndManager, {
          ...setupArgs,
          managerName: "あ".repeat(PERSON_NAME_MAX_LENGTH + 1),
        }),
      ).rejects.toThrow("名前は80文字以内で入力してください");
      await expect(
        asUser.mutation(api.setup.mutations.setupShopAndManager, {
          ...setupArgs,
          managerEmail: "not-email",
        }),
      ).rejects.toThrow("メールアドレスの形式で入力してください");
    });

    it("店舗・ユーザー・スタッフ・同意履歴をトランザクションで作成する", async () => {
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({
        subject: "user_new",
        name: "新規ユーザー",
        email: "new@example.com",
      });

      const shopId = await asUser.mutation(api.setup.mutations.setupShopAndManager, setupArgs);
      expect(shopId).toBeDefined();

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.name).toBe("テスト店舗");
      expect(shop?.regularClosedDays).toEqual([]);
      expect(shop?.submissionPattern).toEqual({ kind: "dateOnly" });
      const billingState = await t.run(async (ctx) =>
        ctx.db
          .query("shopBillingStates")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .unique(),
      );
      expect(billingState).toMatchObject({
        shopId,
        planKey: "free",
        source: "system",
      });

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
      const staffConsentState = await t.run(async (ctx) =>
        ctx.db
          .query("legalConsentStates")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffs[0]._id))
          .first(),
      );
      expect(staffConsentState?.termsConsentVersion).toBe("staff-terms-consent-2026-05-09");
      expect(staffConsentState?.privacyConsentVersion).toBe("staff-privacy-consent-2026-05-09");
      expect(staffConsentState?.termsDocumentVersion).toBe("staff-terms-doc-2026-05-09");
      expect(staffConsentState?.privacyDocumentVersion).toBe("staff-privacy-doc-2026-05-09");
      expect(staffConsentState?.method).toBe("manager_setup");

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
      const staffConsentEvents = await t.run(async (ctx) =>
        ctx.db
          .query("legalConsentEvents")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffs[0]._id))
          .collect(),
      );
      expect(staffConsentEvents).toHaveLength(1);
      expect(staffConsentEvents[0]).toMatchObject({ subjectType: "staff", method: "manager_setup" });
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
        t.withIdentity({ subject: "user_existing" }).mutation(api.setup.mutations.setupShopAndManager, setupArgs),
      ).rejects.toThrow(ConvexError);
    });

    it("削除済みmembershipや削除済み店舗は既存店舗として扱わない", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await seedManagerShop(ctx, {
          subject: "user_deleted_membership",
          email: "deleted-membership@example.com",
          shopName: "削除済みmembership店舗",
          membershipDeleted: true,
        });
        await seedManagerShop(ctx, {
          subject: "user_deleted_shop",
          email: "deleted-shop@example.com",
          shopName: "削除済み店舗",
          shopDeleted: true,
        });
      });

      await expect(
        t
          .withIdentity({ subject: "user_deleted_membership" })
          .mutation(api.setup.mutations.setupShopAndManager, setupArgs),
      ).resolves.toBeDefined();
      await expect(
        t.withIdentity({ subject: "user_deleted_shop" }).mutation(api.setup.mutations.setupShopAndManager, setupArgs),
      ).resolves.toBeDefined();
    });

    it("shopMembersはuserIdとshopIdとisDeletedでactive所属を引ける", async () => {
      const t = convexTest(schema, modules);

      const { userId, activeShopId, deletedShopId } = await t.run(async (ctx) => {
        const userId = await seedUser(ctx, "membership_lookup", "lookup@example.com");
        const activeShopId = await seedShop(ctx, "Active店舗");
        const deletedShopId = await seedShop(ctx, "Deleted membership店舗");
        await seedShopMembership(ctx, { userId, shopId: activeShopId });
        await seedShopMembership(ctx, { userId, shopId: deletedShopId, isDeleted: true });
        return { userId, activeShopId, deletedShopId };
      });

      const activeMembership = await t.run(async (ctx) =>
        ctx.db
          .query("shopMembers")
          .withIndex("by_userId_and_shopId_and_isDeleted", (q) =>
            q.eq("userId", userId).eq("shopId", activeShopId).eq("isDeleted", false),
          )
          .first(),
      );
      const deletedMembership = await t.run(async (ctx) =>
        ctx.db
          .query("shopMembers")
          .withIndex("by_userId_and_shopId_and_isDeleted", (q) =>
            q.eq("userId", userId).eq("shopId", deletedShopId).eq("isDeleted", false),
          )
          .first(),
      );

      expect(activeMembership?.shopId).toBe(activeShopId);
      expect(deletedMembership).toBeNull();
    });

    it("既存ユーザーレコードがある場合は名前・メールと同意を更新する", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await seedUser(ctx, "user_has_record", "old@example.com");
      });

      await t.withIdentity({ subject: "user_has_record" }).mutation(api.setup.mutations.setupShopAndManager, setupArgs);

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
