import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";

const validArgs = {
  shopName: "新・居酒屋たなか",
  shiftStartTime: "10:00",
  shiftEndTime: "23:00",
};

const MANAGER_SUBJECT = "user_manager";

describe("shop/mutations", () => {
  describe("updateShopSettings", () => {
    it("未認証の場合エラーをthrowする", async () => {
      const t = convexTest(schema, modules);
      await expect(t.mutation(api.shop.mutations.updateShopSettings, validArgs)).rejects.toThrow();
    });

    it("店舗が存在しないマネージャーは Not found でエラー", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "user_no_shop",
          name: "店舗なし",
          email: "noshop@example.com",
          role: "manager",
          isDeleted: false,
        });
      });
      await expect(
        t.withIdentity({ subject: "user_no_shop" }).mutation(api.shop.mutations.updateShopSettings, validArgs),
      ).rejects.toThrow();
    });

    it("店舗名とシフト時間帯を更新する", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: MANAGER_SUBJECT,
          name: "山田 太郎",
          email: "yamada@example.com",
          role: "manager",
          isDeleted: false,
        });
        return ctx.db.insert("shops", {
          name: "居酒屋たなか",
          shiftStartTime: "14:00",
          shiftEndTime: "25:00",
          ownerId: MANAGER_SUBJECT,
          isDeleted: false,
        });
      });

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, validArgs);

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.name).toBe("新・居酒屋たなか");
      expect(shop?.shiftStartTime).toBe("10:00");
      expect(shop?.shiftEndTime).toBe("23:00");
    });

    it("店舗名の前後空白をトリムする", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: MANAGER_SUBJECT,
          name: "山田 太郎",
          email: "yamada@example.com",
          role: "manager",
          isDeleted: false,
        });
        return ctx.db.insert("shops", {
          name: "居酒屋たなか",
          shiftStartTime: "14:00",
          shiftEndTime: "25:00",
          ownerId: MANAGER_SUBJECT,
          isDeleted: false,
        });
      });

      await t
        .withIdentity({ subject: MANAGER_SUBJECT })
        .mutation(api.shop.mutations.updateShopSettings, { ...validArgs, shopName: "  スペース入り  " });

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.name).toBe("スペース入り");
    });

    it("空の店舗名は ConvexError", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: MANAGER_SUBJECT,
          name: "山田 太郎",
          email: "yamada@example.com",
          role: "manager",
          isDeleted: false,
        });
        await ctx.db.insert("shops", {
          name: "居酒屋たなか",
          shiftStartTime: "14:00",
          shiftEndTime: "25:00",
          ownerId: MANAGER_SUBJECT,
          isDeleted: false,
        });
      });

      await expect(
        t
          .withIdentity({ subject: MANAGER_SUBJECT })
          .mutation(api.shop.mutations.updateShopSettings, { ...validArgs, shopName: "   " }),
      ).rejects.toThrow(ConvexError);
    });

    it("終了時間 <= 開始時間は ConvexError", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: MANAGER_SUBJECT,
          name: "山田 太郎",
          email: "yamada@example.com",
          role: "manager",
          isDeleted: false,
        });
        await ctx.db.insert("shops", {
          name: "居酒屋たなか",
          shiftStartTime: "14:00",
          shiftEndTime: "25:00",
          ownerId: MANAGER_SUBJECT,
          isDeleted: false,
        });
      });

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          shiftStartTime: "22:00",
          shiftEndTime: "22:00",
        }),
      ).rejects.toThrow(ConvexError);

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          shiftStartTime: "22:00",
          shiftEndTime: "20:00",
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("既存 recruitments のシフト時間スナップショットは更新で変化しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId } = await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: MANAGER_SUBJECT,
          name: "山田 太郎",
          email: "yamada@example.com",
          role: "manager",
          isDeleted: false,
        });
        const shopId = await ctx.db.insert("shops", {
          name: "居酒屋たなか",
          shiftStartTime: "14:00",
          shiftEndTime: "25:00",
          ownerId: MANAGER_SUBJECT,
          isDeleted: false,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-05-01",
          periodEnd: "2026-05-07",
          deadline: "2026-04-28",
          status: "open",
          isDeleted: false,
          shiftStartTime: "14:00",
          shiftEndTime: "25:00",
        });
        return { shopId, recruitmentId };
      });

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, validArgs);

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(shop?.shiftStartTime).toBe("10:00");
      expect(recruitment?.shiftStartTime).toBe("14:00");
      expect(recruitment?.shiftEndTime).toBe("25:00");
    });
  });
});
