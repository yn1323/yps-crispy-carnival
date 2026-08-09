import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { seedLegacyManagerShop, seedManagerShop, seedOrganizationManagerShop, seedShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS,
  SHIFT_TYPE_NAME_MAX_LENGTH,
  SHOP_NAME_MAX_LENGTH,
} from "../constants";
import { deletedLineUserId } from "../deletionCleanup/tombstone";

const validArgs = {
  shopName: "新・居酒屋たなか",
  regularClosedDays: [],
  submissionPattern: { kind: "time" as const, startTime: "10:00", endTime: "23:00" },
};

const MANAGER_SUBJECT = "user_manager";

describe("shop/mutations", () => {
  describe("updateShopSettings", () => {
    it("同じ時刻の複数更新を別の分析source eventとして記録する", async () => {
      const occurredAt = Date.parse("2026-08-02T00:00:00.000Z");
      vi.stubEnv("ANALYTICS_SOURCE_CAPTURE_START_AT", "");
      vi.useFakeTimers();
      vi.setSystemTime(occurredAt);

      try {
        const t = convexTest(schema, modules);
        const { shopId } = await t.run(async (ctx) =>
          seedOrganizationManagerShop(ctx, {
            subject: MANAGER_SUBJECT,
            email: "analytics-shop-manager@example.com",
            shopName: "更新前店舗",
            plan: "pro",
          }),
        );
        const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });

        await asManager.mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          shopId,
          shopName: "1回目の店舗名",
        });
        await asManager.mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          shopId,
          shopName: "2回目の店舗名",
        });

        const events = await t.run(async (ctx) =>
          ctx.db
            .query("analyticsSourceEvents")
            .withIndex("by_shopId_and_occurredAt", (q) => q.eq("shopId", shopId))
            .collect(),
        );
        expect(events).toHaveLength(2);
        expect(new Set(events.map((event) => event.eventKey)).size).toBe(2);
        expect(events.map((event) => event.payload)).toEqual([
          { kind: "shop", change: "updated", displayName: "1回目の店舗名" },
          { kind: "shop", change: "updated", displayName: "2回目の店舗名" },
        ]);
        expect(events.map((event) => event.occurredAt)).toEqual([occurredAt, occurredAt]);
      } finally {
        vi.unstubAllEnvs();
        vi.useRealTimers();
      }
    });

    it("shopIdを省略した旧クライアントは先頭の有効所属店舗を更新できる", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        return shopId;
      });
      const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });

      await asManager.mutation(api.shop.mutations.updateShopSettings, validArgs);

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.name).toBe("新・居酒屋たなか");
    });

    it("未認証の場合エラーをthrowする", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => seedShop(ctx));
      await expect(t.mutation(api.shop.mutations.updateShopSettings, { ...validArgs, shopId })).rejects.toThrow();
    });

    it("店舗が存在しないマネージャーは Not found でエラー", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        await seedUser(ctx, "user_no_shop", "noshop@example.com");
        return seedShop(ctx);
      });
      await expect(
        t
          .withIdentity({ subject: "user_no_shop" })
          .mutation(api.shop.mutations.updateShopSettings, { ...validArgs, shopId }),
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

      await t
        .withIdentity({ subject: MANAGER_SUBJECT })
        .mutation(api.shop.mutations.updateShopSettings, { ...validArgs, shopId, shopName: "  スペース入り  " });

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
        t
          .withIdentity({ subject: MANAGER_SUBJECT })
          .mutation(api.shop.mutations.updateShopSettings, { ...validArgs, shopId, shopName: "   " }),
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
          shopId,
          shopName: "あ".repeat(SHOP_NAME_MAX_LENGTH + 1),
        }),
      ).rejects.toThrow("店舗名は80文字以内で入力してください");
      await expect(
        t
          .withIdentity({ subject: MANAGER_SUBJECT })
          .mutation(api.shop.mutations.updateShopSettings, { ...validArgs, shopId, shopName: "店舗\n名" }),
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
          shopId,
          submissionPattern: { kind: "time", startTime: "22:00", endTime: "22:00" },
        }),
      ).rejects.toThrow(ConvexError);

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
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

      await t
        .withIdentity({ subject: MANAGER_SUBJECT })
        .mutation(api.shop.mutations.updateShopSettings, { ...validArgs, shopId });

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

  describe("updateShopSetting", () => {
    it("店舗名だけを正規化して更新する", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: "partial_shop_name",
          shopName: "更新前店舗",
          plan: "pro",
        });
        await ctx.db.patch(seeded.shopId, {
          regularClosedDays: ["sun", "wed"],
          submissionPattern: { kind: "dateOnly" },
        });
        return seeded.shopId;
      });

      await t.withIdentity({ subject: "partial_shop_name" }).mutation(api.shop.mutations.updateShopSetting, {
        shopId,
        change: { kind: "shopName", shopName: "  更新後店舗  " },
      });

      const settings = await t.run(async (ctx) => {
        const shop = await ctx.db.get(shopId);
        return shop
          ? {
              name: shop.name,
              regularClosedDays: shop.regularClosedDays,
              submissionPattern: shop.submissionPattern,
            }
          : null;
      });
      expect(settings).toEqual({
        name: "更新後店舗",
        regularClosedDays: ["sun", "wed"],
        submissionPattern: { kind: "dateOnly" },
      });
    });

    it("希望提出方法だけを正規化して更新する", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: "partial_submission_pattern",
          shopName: "提出方法店舗",
          plan: "pro",
        });
        await ctx.db.patch(seeded.shopId, { regularClosedDays: ["sun", "thu"] });
        return seeded.shopId;
      });

      await t.withIdentity({ subject: "partial_submission_pattern" }).mutation(api.shop.mutations.updateShopSetting, {
        shopId,
        change: {
          kind: "submissionPattern",
          submissionPattern: {
            kind: "shiftType",
            options: [
              { id: "late", name: "  遅番  ", startTime: "15:00", endTime: "23:00", sortOrder: 0 },
              { id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 1 },
            ],
          },
        },
      });

      const settings = await t.run(async (ctx) => {
        const shop = await ctx.db.get(shopId);
        return shop
          ? {
              name: shop.name,
              regularClosedDays: shop.regularClosedDays,
              submissionPattern: shop.submissionPattern,
            }
          : null;
      });
      expect(settings).toEqual({
        name: "提出方法店舗",
        regularClosedDays: ["sun", "thu"],
        submissionPattern: {
          kind: "shiftType",
          options: [
            { id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
            { id: "late", name: "遅番", startTime: "15:00", endTime: "23:00", sortOrder: 1 },
          ],
        },
      });
    });

    it("定休日だけを曜日順に更新する", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: "partial_closed_days",
          shopName: "定休日店舗",
          plan: "pro",
        });
        await ctx.db.patch(seeded.shopId, { submissionPattern: { kind: "dateOnly" } });
        return seeded.shopId;
      });

      await t.withIdentity({ subject: "partial_closed_days" }).mutation(api.shop.mutations.updateShopSetting, {
        shopId,
        change: { kind: "regularClosedDays", regularClosedDays: ["fri", "mon", "mon"] },
      });

      const settings = await t.run(async (ctx) => {
        const shop = await ctx.db.get(shopId);
        return shop
          ? {
              name: shop.name,
              regularClosedDays: shop.regularClosedDays,
              submissionPattern: shop.submissionPattern,
            }
          : null;
      });
      expect(settings).toEqual({
        name: "定休日店舗",
        regularClosedDays: ["mon", "fri"],
        submissionPattern: { kind: "dateOnly" },
      });
    });

    it("同じ事業者の別店舗を明示shopIdで更新する", async () => {
      const t = convexTest(schema, modules);
      const { baseShopId, targetShopId } = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: "partial_explicit_target",
          shopName: "基準店舗",
          plan: "pro",
        });
        const targetShopId = await ctx.db.insert("shops", {
          organizationId: seeded.organizationId,
          operatingStatus: "active",
          name: "更新対象店舗",
          submissionPattern: { kind: "dateOnly" },
          regularClosedDays: ["sun"],
          isDeleted: false,
        });
        return { baseShopId: seeded.shopId, targetShopId };
      });

      await t.withIdentity({ subject: "partial_explicit_target" }).mutation(api.shop.mutations.updateShopSetting, {
        shopId: targetShopId,
        change: { kind: "shopName", shopName: "更新後の対象店舗" },
      });

      const names = await t.run(async (ctx) => ({
        base: (await ctx.db.get(baseShopId))?.name,
        target: (await ctx.db.get(targetShopId))?.name,
      }));
      expect(names).toEqual({ base: "基準店舗", target: "更新後の対象店舗" });
    });

    it("shopIdを省略した場合はどの店舗も更新しない", async () => {
      const t = convexTest(schema, modules);
      const { baseShopId, otherShopId } = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: "partial_missing_target",
          shopName: "先頭店舗",
          plan: "pro",
        });
        const otherShopId = await ctx.db.insert("shops", {
          organizationId: seeded.organizationId,
          operatingStatus: "active",
          name: "2店舗目",
          submissionPattern: { kind: "dateOnly" },
          regularClosedDays: [],
          isDeleted: false,
        });
        return { baseShopId: seeded.shopId, otherShopId };
      });

      await expect(
        t.withIdentity({ subject: "partial_missing_target" }).mutation(
          api.shop.mutations.updateShopSetting,
          // Runtime validatorもshopIdを必須にしていることを確認するため、意図的に型境界を越える。
          { change: { kind: "shopName", shopName: "不正更新" } } as never,
        ),
      ).rejects.toThrow();

      const names = await t.run(async (ctx) => ({
        base: (await ctx.db.get(baseShopId))?.name,
        other: (await ctx.db.get(otherShopId))?.name,
      }));
      expect(names).toEqual({ base: "先頭店舗", other: "2店舗目" });
    });

    it("未認証では更新できない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => seedShop(ctx, "未認証店舗"));

      await expect(
        t.mutation(api.shop.mutations.updateShopSetting, {
          shopId,
          change: { kind: "shopName", shopName: "不正更新" },
        }),
      ).rejects.toThrow();
      await expect(t.run(async (ctx) => (await ctx.db.get(shopId))?.name)).resolves.toBe("未認証店舗");
    });

    it("別事業者の店舗は Not found で更新できない", async () => {
      const t = convexTest(schema, modules);
      const otherShopId = await t.run(async (ctx) => {
        await seedOrganizationManagerShop(ctx, { subject: "partial_idor_actor", plan: "pro" });
        const other = await seedOrganizationManagerShop(ctx, {
          subject: "partial_idor_other",
          shopName: "別事業者店舗",
          plan: "pro",
        });
        return other.shopId;
      });

      await expect(
        t.withIdentity({ subject: "partial_idor_actor" }).mutation(api.shop.mutations.updateShopSetting, {
          shopId: otherShopId,
          change: { kind: "shopName", shopName: "不正更新" },
        }),
      ).rejects.toThrow("Not found");
      await expect(t.run(async (ctx) => (await ctx.db.get(otherShopId))?.name)).resolves.toBe("別事業者店舗");
    });

    it("閲覧のみの管理者は更新できない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: "partial_read_only",
          shopName: "閲覧専用店舗",
          plan: "pro",
        });
        await ctx.db.patch(seeded.memberId, { status: "readOnly" });
        return seeded.shopId;
      });

      await expect(
        t.withIdentity({ subject: "partial_read_only" }).mutation(api.shop.mutations.updateShopSetting, {
          shopId,
          change: { kind: "shopName", shopName: "不正更新" },
        }),
      ).rejects.toThrow("Not found");
      await expect(t.run(async (ctx) => (await ctx.db.get(shopId))?.name)).resolves.toBe("閲覧専用店舗");
    });

    it("不正な希望提出方法は既存schemaで拒否し、店舗を更新しない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: "partial_invalid_pattern",
          shopName: "入力検証店舗",
          plan: "pro",
        });
        return seeded.shopId;
      });

      await expect(
        t.withIdentity({ subject: "partial_invalid_pattern" }).mutation(api.shop.mutations.updateShopSetting, {
          shopId,
          change: {
            kind: "submissionPattern",
            submissionPattern: { kind: "time", startTime: "22:00", endTime: "21:00" },
          },
        }),
      ).rejects.toThrow(ConvexError);
      await expect(t.run(async (ctx) => (await ctx.db.get(shopId))?.submissionPattern)).resolves.toEqual({
        kind: "time",
        startTime: "09:00",
        endTime: "22:00",
      });
    });
  });

  describe("deleteShop", () => {
    // バックグラウンドの cleanupDeletedShop は runAfter(0) で自己再スケジュールするため、
    // フェイクタイマー + finishAllScheduledFunctions で完了まで進める。
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("未認証の場合エラーをthrowする", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => seedShop(ctx));
      await expect(t.mutation(api.shop.mutations.deleteShop, { confirmShopId: shopId, shopId })).rejects.toThrow();
    });

    it("店舗が存在しないマネージャーは Not found でエラー", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        await seedUser(ctx, "user_no_shop", "noshop@example.com");
        return seedShop(ctx);
      });
      await expect(
        t
          .withIdentity({ subject: "user_no_shop" })
          .mutation(api.shop.mutations.deleteShop, { confirmShopId: shopId, shopId }),
      ).rejects.toThrow();
    });

    it("confirmShopId が解決された店舗と一致しない場合は削除しない", async () => {
      const t = convexTest(schema, modules);
      const { ownShopId, otherShopId } = await t.run(async (ctx) => {
        const { shopId } = await seedLegacyManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        return { ownShopId: shopId, otherShopId: await seedShop(ctx, "別店舗") };
      });

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.deleteShop, {
          confirmShopId: otherShopId,
          shopId: ownShopId,
        }),
      ).rejects.toThrow();

      const ownShop = await t.run(async (ctx) => ctx.db.get(ownShopId));
      expect(ownShop?.isDeleted).toBe(false);
    });

    it("事業者に紐づく店舗は旧APIで削除せず組織設定の削除導線へ寄せる", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run((ctx) =>
        seedOrganizationManagerShop(ctx, { subject: "organization_shop_delete", plan: "pro" }),
      );

      await expect(
        t.withIdentity({ subject: "organization_shop_delete" }).mutation(api.shop.mutations.deleteShop, {
          confirmShopId: ids.shopId,
          shopId: ids.shopId,
        }),
      ).rejects.toThrow("組織設定から店舗を削除してください");

      const state = await t.run(async (ctx) => ({
        shop: await ctx.db.get(ids.shopId),
        member: await ctx.db.get(ids.memberId),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.shop).toMatchObject({ isDeleted: false, operatingStatus: "active" });
      expect(state.member?.status).toBe("active");
      expect(state.scheduled.filter((job) => job.name === "shop/mutations:cleanupDeletedShop")).toHaveLength(0);
    });

    it("店舗・所属スタッフ・所属マネージャーを論理削除し、アクセス経路を無効化する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const { userId, shopId } = await seedLegacyManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
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
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "佐藤",
          email: "sato@example.com",
          emailNormalized: "sato@example.com",
          isDeleted: false,
        });
        const sessionId = await ctx.db.insert("sessions", {
          sessionToken: "session-token",
          staffId,
          shopId,
          recruitmentId,
          expiresAt: Date.now() + 1000,
        });
        const magicLinkId = await ctx.db.insert("magicLinks", {
          token: "magic-token",
          staffId,
          shopId,
          recruitmentId,
          expiresAt: Date.now() + 1000,
        });
        const lineLinkTokenId = await ctx.db.insert("lineLinkTokens", {
          staffId,
          shopId,
          token: "line-token",
          expiresAt: Date.now() + 1000,
        });
        const lineAccountId = await ctx.db.insert("staffLineAccounts", {
          staffId,
          shopId,
          lineUserId: "U123",
          linkedAt: Date.now(),
          following: true,
          isDeleted: false,
        });
        const registrationLinkId = await ctx.db.insert("shopRegistrationLinks", {
          shopId,
          token: "registration-token",
          createdAt: Date.now(),
        });
        const membership = await ctx.db
          .query("shopMembers")
          .withIndex("by_userId_and_shopId", (q) => q.eq("userId", userId).eq("shopId", shopId))
          .first();
        return {
          shopId,
          staffId,
          sessionId,
          magicLinkId,
          lineLinkTokenId,
          lineAccountId,
          registrationLinkId,
          membershipId: membership?._id,
        };
      });

      await t
        .withIdentity({ subject: MANAGER_SUBJECT })
        .mutation(api.shop.mutations.deleteShop, { confirmShopId: ids.shopId, shopId: ids.shopId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await t.run(async (ctx) => {
        expect(await ctx.db.get(ids.shopId)).toMatchObject({ isDeleted: true, name: "居酒屋たなか" });
        expect(await ctx.db.get(ids.staffId)).toMatchObject({
          isDeleted: true,
          name: "佐藤",
          email: "sato@example.com",
          emailNormalized: "sato@example.com",
        });
        expect(ids.membershipId && (await ctx.db.get(ids.membershipId))?.isDeleted).toBe(true);
        expect((await ctx.db.get(ids.sessionId))?.revokedAt).toBeTypeOf("number");
        expect((await ctx.db.get(ids.magicLinkId))?.revokedAt).toBeTypeOf("number");
        expect((await ctx.db.get(ids.lineLinkTokenId))?.revokedAt).toBeTypeOf("number");
        const lineAccount = await ctx.db.get(ids.lineAccountId);
        expect(lineAccount).toMatchObject({
          isDeleted: true,
          following: false,
          lineUserId: deletedLineUserId(ids.lineAccountId),
        });
        expect((await ctx.db.get(ids.registrationLinkId))?.revokedAt).toBeTypeOf("number");
      });
    });

    it("他店舗のデータは削除しない", async () => {
      const t = convexTest(schema, modules);
      const { ownShopId, otherShopId, otherStaffId } = await t.run(async (ctx) => {
        const own = await seedLegacyManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        const other = await seedLegacyManagerShop(ctx, {
          subject: "user_other",
          email: "other@example.com",
          shopName: "別店舗",
        });
        const otherStaffId = await ctx.db.insert("staffs", {
          shopId: other.shopId,
          name: "別スタッフ",
          email: "other-staff@example.com",
          emailNormalized: "other-staff@example.com",
          isDeleted: false,
        });
        return { ownShopId: own.shopId, otherShopId: other.shopId, otherStaffId };
      });

      await t
        .withIdentity({ subject: MANAGER_SUBJECT })
        .mutation(api.shop.mutations.deleteShop, { confirmShopId: ownShopId, shopId: ownShopId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await t.run(async (ctx) => {
        expect((await ctx.db.get(otherShopId))?.isDeleted).toBe(false);
        expect((await ctx.db.get(otherStaffId))?.isDeleted).toBe(false);
      });
    });

    it("pending通知はすぐ停止し、processing通知はlease終了後に回収して送信済みは変更しない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const { shopId } = await seedLegacyManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        const base = {
          channel: "email" as const,
          shopId,
          payload: {
            kind: "email" as const,
            context: "test",
            from: "noreply@example.com",
            to: "sato@example.com",
            subject: "件名",
            html: "<p>body</p>",
          },
          attemptCount: 0,
          nextRunAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        const pendingId = await ctx.db.insert("notificationOutbox", {
          ...base,
          status: "pending",
          dedupeKey: "dedupe-pending",
        });
        const processingId = await ctx.db.insert("notificationOutbox", {
          ...base,
          status: "processing",
          dedupeKey: "dedupe-processing",
        });
        const sentId = await ctx.db.insert("notificationOutbox", {
          ...base,
          status: "sent",
          dedupeKey: "dedupe-sent",
          sentAt: Date.now(),
        });
        const now = Date.now();
        const failureId = await ctx.db.insert("notificationFailureInbox", {
          failureKey: `outbox:${pendingId}`,
          sourceType: "outbox",
          status: "retrying",
          shopId,
          outboxId: pendingId,
          channel: "email",
          dedupeKey: "dedupe-pending",
          notificationContext: "test",
          firstFailedAt: now,
          lastFailedAt: now,
          lastError: "delivery failed",
          createdAt: now,
          updatedAt: now,
        });
        return { shopId, pendingId, processingId, sentId, failureId };
      });

      await t
        .withIdentity({ subject: MANAGER_SUBJECT })
        .mutation(api.shop.mutations.deleteShop, { confirmShopId: ids.shopId, shopId: ids.shopId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await t.run(async (ctx) => {
        expect(await ctx.db.get(ids.pendingId)).toMatchObject({
          status: "cancelled",
          cancelReason: "shop_inactive",
          cancelledAt: expect.any(Number),
        });
        expect(await ctx.db.get(ids.processingId)).toMatchObject({
          status: "cancelled",
          cancelReason: "shop_inactive",
        });
        expect(await ctx.db.get(ids.failureId)).toMatchObject({
          status: "resolved",
          resolutionKind: "superseded",
          resolvedAt: expect.any(Number),
        });
        expect((await ctx.db.get(ids.sentId))?.status).toBe("sent");
      });
    });

    it("provider処理中の通知はlease中に上書きせず、staleになった後で回収する", async () => {
      const t = convexTest(schema, modules);
      const startedAt = Date.now();
      const ids = await t.run(async (ctx) => {
        const { shopId } = await seedLegacyManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "削除対象店",
        });
        await ctx.db.patch(shopId, { isDeleted: true });
        const outboxId = await ctx.db.insert("notificationOutbox", {
          channel: "email",
          shopId,
          status: "processing",
          dedupeKey: "dedupe-processing-lease",
          payload: {
            kind: "email",
            context: "test",
            from: "noreply@example.com",
            to: "sato@example.com",
            subject: "件名",
            html: "<p>body</p>",
          },
          attemptCount: 1,
          nextRunAt: startedAt,
          processingStartedAt: startedAt,
          createdAt: startedAt,
          updatedAt: startedAt,
        });
        return { shopId, outboxId };
      });

      await t.mutation(internal.shop.mutations.cleanupDeletedShopProcessingOutbox, { shopId: ids.shopId });

      const beforeExpiry = await t.run(async (ctx) => ({
        outbox: await ctx.db.get(ids.outboxId),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(beforeExpiry.outbox?.status).toBe("processing");
      expect(beforeExpiry.scheduled.some((job) => job.name === "deletionCleanup/mutations:kick")).toBe(true);

      vi.setSystemTime(startedAt + NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS + 1);
      await t.mutation(internal.shop.mutations.cleanupDeletedShopProcessingOutbox, { shopId: ids.shopId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const staleOutbox = await t.run(async (ctx) => ctx.db.get(ids.outboxId));
      expect(staleOutbox).toMatchObject({
        status: "cancelled",
        cancelReason: "shop_inactive",
      });
      expect(staleOutbox).not.toHaveProperty("processingStartedAt");
    });

    it("バッチサイズを超える件数でも全件を後片付けできる", async () => {
      const t = convexTest(schema, modules);
      const COUNT = 150; // SHOP_CLEANUP_BATCH_SIZE(100) を跨いで再スケジュールされること
      const { shopId, magicLinkIds } = await t.run(async (ctx) => {
        const { shopId } = await seedLegacyManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
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
        const magicLinkIds = [];
        for (let i = 0; i < COUNT; i++) {
          const staffId = await ctx.db.insert("staffs", {
            shopId,
            name: `スタッフ${i}`,
            email: `staff${i}@example.com`,
            emailNormalized: `staff${i}@example.com`,
            isDeleted: false,
          });
          magicLinkIds.push(
            await ctx.db.insert("magicLinks", {
              token: `magic-${i}`,
              staffId,
              shopId,
              recruitmentId,
              expiresAt: Date.now() + 1000,
            }),
          );
        }
        return { shopId, magicLinkIds };
      });

      await t
        .withIdentity({ subject: MANAGER_SUBJECT })
        .mutation(api.shop.mutations.deleteShop, { confirmShopId: shopId, shopId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await t.run(async (ctx) => {
        const remainingStaff = await ctx.db
          .query("staffs")
          .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
          .collect();
        expect(remainingStaff).toHaveLength(0);
        for (const magicLinkId of magicLinkIds) {
          expect((await ctx.db.get(magicLinkId))?.revokedAt).toBeTypeOf("number");
        }
      });
    });
  });
});
