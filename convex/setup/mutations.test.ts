import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";

const setupArgs = {
  shopName: "テスト店舗",
  shiftStartTime: "09:00",
  shiftEndTime: "22:00",
  ownerName: "山田 太郎",
  ownerEmail: "yamada@example.com",
};

describe("setup/mutations", () => {
  describe("setupShopAndOwner", () => {
    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await expect(t.mutation(api.setup.mutations.setupShopAndOwner, setupArgs)).rejects.toThrow();
    });

    it("店舗・ユーザー・スタッフを1トランザクションで作成する", async () => {
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({
        subject: "user_new",
        name: "新規ユーザー",
        email: "new@example.com",
      });

      const shopId = await asUser.mutation(api.setup.mutations.setupShopAndOwner, setupArgs);
      expect(shopId).toBeDefined();

      // shops テーブルを確認
      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.name).toBe("テスト店舗");
      expect(shop?.ownerId).toBe("user_new");

      // users テーブルを確認
      const user = await t.run(async (ctx) =>
        ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", "user_new"))
          .first(),
      );
      expect(user).not.toBeNull();
      expect(user?.name).toBe("山田 太郎");
      expect(user?.email).toBe("yamada@example.com");
      expect(user?.role).toBe("manager");

      // staffs テーブルを確認
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
    });

    it("既に店舗がある場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "user_existing",
          name: "既存",
          email: "ex@example.com",
          role: "manager",
          isDeleted: false,
        });
        await ctx.db.insert("shops", {
          name: "既存店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_existing",
          isDeleted: false,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_existing" }).mutation(api.setup.mutations.setupShopAndOwner, setupArgs),
      ).rejects.toThrow(ConvexError);
    });

    it("既存ユーザーレコードがある場合は名前・メールを更新する", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "user_has_record",
          name: "旧名前",
          email: "old@example.com",
          role: "manager",
          isDeleted: false,
        });
      });

      await t.withIdentity({ subject: "user_has_record" }).mutation(api.setup.mutations.setupShopAndOwner, setupArgs);

      const user = await t.run(async (ctx) =>
        ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", "user_has_record"))
          .first(),
      );
      expect(user?.name).toBe("山田 太郎");
      expect(user?.email).toBe("yamada@example.com");
    });
  });
});
