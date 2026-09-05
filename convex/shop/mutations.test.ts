import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { getTestOrganizationId, seedManagerShop, seedOrganizationManagerShop, seedShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { SHIFT_TYPE_NAME_MAX_LENGTH, SHOP_NAME_MAX_LENGTH } from "../constants";

const validArgs = {
  shopName: "新・居酒屋たなか",
  regularClosedDays: [],
  submissionPattern: { kind: "time" as const, startTime: "10:00", endTime: "23:00" },
};

const MANAGER_SUBJECT = "user_manager";

describe("shop/mutations", () => {
  describe("updateShopSettings", () => {
    it("店舗設定の更新は日次利用実績に数えない", async () => {
      const occurredAt = Date.parse("2026-08-02T00:00:00.000Z");
      vi.useFakeTimers();
      vi.setSystemTime(occurredAt);

      try {
        const t = convexTest(schema, modules);
        const { shopId } = await t.run(async (ctx) =>
          seedOrganizationManagerShop(ctx, {
            subject: MANAGER_SUBJECT,
            email: "analytics-shop-manager@example.com",
            shopName: "更新前店舗",
            plan: "standard",
          }),
        );
        const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });

        await asManager.mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          shopName: "1回目の店舗名",
        });
        await asManager.mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          shopName: "2回目の店舗名",
        });

        const state = await t.run(async (ctx) => ({
          shop: await ctx.db.get(shopId),
          days: await ctx.db.query("analyticsShopDays").collect(),
          analyticsState: await ctx.db.query("analyticsState").collect(),
        }));
        expect(state.shop?.name).toBe("2回目の店舗名");
        expect(state.days).toEqual([]);
        expect(state.analyticsState).toEqual([]);
      } finally {
        vi.unstubAllEnvs();
        vi.useRealTimers();
      }
    });

    it("未認証の場合エラーをthrowする", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => seedShop(ctx));
      await expect(
        t.mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
        }),
      ).rejects.toThrow();
    });

    it("店舗が存在しないマネージャーは Not found でエラー", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        await seedUser(ctx, "user_no_shop", "noshop@example.com");
        return seedShop(ctx);
      });
      await expect(
        t.withIdentity({ subject: "user_no_shop" }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
        }),
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
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
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
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
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

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
        ...validArgs,
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
        shopName: "  スペース入り  ",
      });

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.name).toBe("スペース入り");
    });

    it("空の店舗名は ConvexError", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        return seeded.shopId;
      });

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          shopName: "   ",
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("過長店舗名と制御文字入り店舗名は更新できない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        return seeded.shopId;
      });

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          shopName: "あ".repeat(SHOP_NAME_MAX_LENGTH + 1),
        }),
      ).rejects.toThrow("店舗名は80文字以内で入力してください");
      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          shopName: "店舗\n名",
        }),
      ).rejects.toThrow("店舗名に使用できない文字が含まれています");
    });

    it("時間指定の終了時間 <= 開始時間は ConvexError", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        return seeded.shopId;
      });

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          submissionPattern: { kind: "time", startTime: "22:00", endTime: "22:00" },
        }),
      ).rejects.toThrow(ConvexError);

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          submissionPattern: { kind: "time", startTime: "22:00", endTime: "20:00" },
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("時間指定の対応範囲外の時刻は ConvexError", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        return seeded.shopId;
      });

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          submissionPattern: { kind: "time", startTime: "10:00", endTime: "99:00" },
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("時間指定は翌12:00まで更新できる", async () => {
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
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
        submissionPattern: { kind: "time", startTime: "00:00", endTime: "36:00" },
      });

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.submissionPattern).toEqual({ kind: "time", startTime: "00:00", endTime: "36:00" });
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

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
        ...validArgs,
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
      });

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(shop?.submissionPattern).toEqual({ kind: "time", startTime: "10:00", endTime: "23:00" });
      expect(recruitment?.submissionPattern).toEqual({ kind: "dateOnly" });
    });

    it("勤務区分の提出方法を開始時間・終了時間順で更新する", async () => {
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
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
        submissionPattern: {
          kind: "shiftType",
          options: [
            { id: "late", name: "遅番", startTime: "15:00", endTime: "23:00", sortOrder: 0 },
            { id: "long-morning", name: "ロング早番", startTime: "10:00", endTime: "18:00", sortOrder: 1 },
            { id: "morning", name: "早番", startTime: "10:00", endTime: "15:00", sortOrder: 2 },
          ],
        },
      });

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.submissionPattern).toEqual({
        kind: "shiftType",
        options: [
          { id: "morning", name: "早番", startTime: "10:00", endTime: "15:00", sortOrder: 0 },
          { id: "long-morning", name: "ロング早番", startTime: "10:00", endTime: "18:00", sortOrder: 1 },
          { id: "late", name: "遅番", startTime: "15:00", endTime: "23:00", sortOrder: 2 },
        ],
      });
    });

    it("勤務区分 option id の重複は更新できない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        return seeded.shopId;
      });

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          submissionPattern: {
            kind: "shiftType",
            options: [
              { id: "duplicate", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
              { id: "duplicate", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
            ],
          },
        }),
      ).rejects.toThrow("勤務区分IDが重複しています");
    });

    it("不正な勤務区分時刻は ConvexError", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        return seeded.shopId;
      });

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          submissionPattern: {
            kind: "shiftType",
            options: [{ id: "morning", name: "早番", startTime: "bad", endTime: "15:00", sortOrder: 0 }],
          },
        }),
      ).rejects.toThrow(ConvexError);

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          submissionPattern: {
            kind: "shiftType",
            options: [{ id: "night", name: "深夜", startTime: "10:00", endTime: "99:00", sortOrder: 0 }],
          },
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("過長・制御文字入りの勤務区分名は更新できない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        return seeded.shopId;
      });

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          submissionPattern: {
            kind: "shiftType",
            options: [
              {
                id: "too-long",
                name: "あ".repeat(SHIFT_TYPE_NAME_MAX_LENGTH + 1),
                startTime: "09:00",
                endTime: "18:00",
                sortOrder: 0,
              },
            ],
          },
        }),
      ).rejects.toThrow("勤務区分名は30文字以内で入力してください");
      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          submissionPattern: {
            kind: "shiftType",
            options: [{ id: "control", name: "早\n番", startTime: "09:00", endTime: "18:00", sortOrder: 0 }],
          },
        }),
      ).rejects.toThrow("勤務区分名に使用できない文字が含まれています");
    });

    it("勤務区分は翌12:00まで更新できる", async () => {
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
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
        submissionPattern: {
          kind: "shiftType",
          options: [{ id: "night", name: "深夜", startTime: "24:00", endTime: "36:00", sortOrder: 0 }],
        },
      });

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.submissionPattern).toEqual({
        kind: "shiftType",
        options: [{ id: "night", name: "深夜", startTime: "24:00", endTime: "36:00", sortOrder: 0 }],
      });
    });

    it("4件を超える勤務区分は更新できない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        return seeded.shopId;
      });

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          submissionPattern: {
            kind: "shiftType",
            options: Array.from({ length: 5 }, (_, index) => ({
              id: `option-${index}`,
              name: `区分${index + 1}`,
              startTime: "09:00",
              endTime: "18:00",
              sortOrder: index,
            })),
          },
        }),
      ).rejects.toThrow("勤務区分は4件まで登録できます");
    });
  });
});
