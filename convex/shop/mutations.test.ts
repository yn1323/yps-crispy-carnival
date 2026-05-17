import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { seedManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const validArgs = {
  shopName: "新・居酒屋たなか",
  regularClosedDays: [],
  submissionPattern: { kind: "time" as const, startTime: "10:00", endTime: "23:00" },
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
        await seedUser(ctx, "user_no_shop", "noshop@example.com");
      });
      await expect(
        t.withIdentity({ subject: "user_no_shop" }).mutation(api.shop.mutations.updateShopSettings, validArgs),
      ).rejects.toThrow();
    });

    it("店舗名、定休日、時間指定の提出方法を更新する", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        return seeded.shopId;
      });

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
        ...validArgs,
        regularClosedDays: ["tue", "mon", "mon"],
      });

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.name).toBe("新・居酒屋たなか");
      expect(shop?.regularClosedDays).toEqual(["mon", "tue"]);
      expect(shop?.submissionPattern).toEqual({ kind: "time", startTime: "10:00", endTime: "23:00" });
    });

    it("日ごとの提出方法を更新する", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        return seeded.shopId;
      });

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
        ...validArgs,
        submissionPattern: { kind: "dateOnly" },
      });

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.submissionPattern).toEqual({ kind: "dateOnly" });
    });

    it("店舗名の前後空白をトリムする", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        return seeded.shopId;
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
        await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
      });

      await expect(
        t
          .withIdentity({ subject: MANAGER_SUBJECT })
          .mutation(api.shop.mutations.updateShopSettings, { ...validArgs, shopName: "   " }),
      ).rejects.toThrow(ConvexError);
    });

    it("時間指定の終了時間 <= 開始時間は ConvexError", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
      });

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          submissionPattern: { kind: "time", startTime: "22:00", endTime: "22:00" },
        }),
      ).rejects.toThrow(ConvexError);

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          submissionPattern: { kind: "time", startTime: "22:00", endTime: "20:00" },
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("既存 recruitments の提出方法スナップショットは更新で変化しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId } = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        const shopId = seeded.shopId;
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-05-01",
          periodEnd: "2026-05-07",
          deadline: "2026-04-28",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "dateOnly" },
        });
        return { shopId, recruitmentId };
      });

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, validArgs);

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(shop?.submissionPattern).toEqual({ kind: "time", startTime: "10:00", endTime: "23:00" });
      expect(recruitment?.submissionPattern).toEqual({ kind: "dateOnly" });
    });

    it("勤務区分の提出方法を更新する", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        return seeded.shopId;
      });

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
        ...validArgs,
        submissionPattern: {
          kind: "shiftType",
          options: [
            { id: "morning", name: "早番", startTime: "10:00", endTime: "15:00", sortOrder: 1 },
            { id: "late", name: "遅番", startTime: "15:00", endTime: "23:00", sortOrder: 0 },
          ],
        },
      });

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.submissionPattern).toEqual({
        kind: "shiftType",
        options: [
          { id: "late", name: "遅番", startTime: "15:00", endTime: "23:00", sortOrder: 0 },
          { id: "morning", name: "早番", startTime: "10:00", endTime: "15:00", sortOrder: 1 },
        ],
      });
    });

    it("不正な勤務区分時刻は ConvexError", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
      });

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          submissionPattern: {
            kind: "shiftType",
            options: [{ id: "morning", name: "早番", startTime: "bad", endTime: "15:00", sortOrder: 0 }],
          },
        }),
      ).rejects.toThrow(ConvexError);
    });
  });
});
