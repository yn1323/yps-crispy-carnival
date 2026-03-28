import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";

describe("setup/mutations", () => {
  describe("createShop", () => {
    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.setup.mutations.createShop, {
          shopName: "テスト店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
        }),
      ).rejects.toThrow();
    });

    it("店舗とユーザーレコードを作成する", async () => {
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({
        subject: "user_new",
        name: "新規ユーザー",
        email: "new@example.com",
      });

      const shopId = await asUser.mutation(api.setup.mutations.createShop, {
        shopName: "テスト店舗",
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
      });

      expect(shopId).toBeDefined();

      // shops テーブルを確認
      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.name).toBe("テスト店舗");
      expect(shop?.ownerId).toBe("user_new");
      expect(shop?.isDeleted).toBe(false);

      // users テーブルにも作成されていること
      const user = await t.run(async (ctx) =>
        ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", "user_new"))
          .first(),
      );
      expect(user).not.toBeNull();
      expect(user?.role).toBe("manager");
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
        t.withIdentity({ subject: "user_existing" }).mutation(api.setup.mutations.createShop, {
          shopName: "重複店舗",
          shiftStartTime: "10:00",
          shiftEndTime: "20:00",
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("既存ユーザーレコードがある場合は users を再作成しない", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "user_has_record",
          name: "既存ユーザー",
          email: "existing@example.com",
          role: "manager",
          isDeleted: false,
        });
      });

      await t.withIdentity({ subject: "user_has_record" }).mutation(api.setup.mutations.createShop, {
        shopName: "新店舗",
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
      });

      // users が1件のままであること
      const users = await t.run(async (ctx) =>
        ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", "user_has_record"))
          .collect(),
      );
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe("既存ユーザー");
    });
  });
});
