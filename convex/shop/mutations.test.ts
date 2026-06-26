import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { seedManagerShop, seedUser } from "../_test/seed";
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

    it("過長店舗名と制御文字入り店舗名は更新できない", async () => {
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
          shopName: "あ".repeat(SHOP_NAME_MAX_LENGTH + 1),
        }),
      ).rejects.toThrow("店舗名は80文字以内で入力してください");
      await expect(
        t
          .withIdentity({ subject: MANAGER_SUBJECT })
          .mutation(api.shop.mutations.updateShopSettings, { ...validArgs, shopName: "店舗\n名" }),
      ).rejects.toThrow("店舗名に使用できない文字が含まれています");
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

    it("時間指定の対応範囲外の時刻は ConvexError", async () => {
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

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, validArgs);

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

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.updateShopSettings, {
          ...validArgs,
          submissionPattern: {
            kind: "shiftType",
            options: [{ id: "night", name: "深夜", startTime: "10:00", endTime: "99:00", sortOrder: 0 }],
          },
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("過長・制御文字入りの勤務区分名は更新できない", async () => {
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

  describe("deleteShop", () => {
    it("未認証の場合エラーをthrowする", async () => {
      const t = convexTest(schema, modules);
      await expect(t.mutation(api.shop.mutations.deleteShop, {})).rejects.toThrow();
    });

    it("店舗が存在しないマネージャーは Not found でエラー", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await seedUser(ctx, "user_no_shop", "noshop@example.com");
      });
      await expect(
        t.withIdentity({ subject: "user_no_shop" }).mutation(api.shop.mutations.deleteShop, {}),
      ).rejects.toThrow();
    });

    it("店舗・所属スタッフ・所属マネージャーを論理削除し、アクセス経路を無効化する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const { userId, shopId } = await seedManagerShop(ctx, {
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

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.deleteShop, {});

      await t.run(async (ctx) => {
        expect((await ctx.db.get(ids.shopId))?.isDeleted).toBe(true);
        expect((await ctx.db.get(ids.staffId))?.isDeleted).toBe(true);
        expect(ids.membershipId && (await ctx.db.get(ids.membershipId))?.isDeleted).toBe(true);
        expect((await ctx.db.get(ids.sessionId))?.revokedAt).toBeTypeOf("number");
        expect((await ctx.db.get(ids.magicLinkId))?.revokedAt).toBeTypeOf("number");
        expect((await ctx.db.get(ids.lineLinkTokenId))?.revokedAt).toBeTypeOf("number");
        const lineAccount = await ctx.db.get(ids.lineAccountId);
        expect(lineAccount?.isDeleted).toBe(true);
        expect(lineAccount?.following).toBe(false);
        expect((await ctx.db.get(ids.registrationLinkId))?.revokedAt).toBeTypeOf("number");
      });
    });

    it("他店舗のデータは削除しない", async () => {
      const t = convexTest(schema, modules);
      const { otherShopId, otherStaffId } = await t.run(async (ctx) => {
        await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "yamada@example.com",
          shopName: "居酒屋たなか",
        });
        const other = await seedManagerShop(ctx, {
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
        return { otherShopId: other.shopId, otherStaffId };
      });

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shop.mutations.deleteShop, {});

      await t.run(async (ctx) => {
        expect((await ctx.db.get(otherShopId))?.isDeleted).toBe(false);
        expect((await ctx.db.get(otherStaffId))?.isDeleted).toBe(false);
      });
    });
  });
});
