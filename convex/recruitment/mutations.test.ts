import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { todayJST } from "../_lib/dateFormat";
import { seedManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

function futureDate(daysFromNow: number): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

describe("recruitment/mutations", () => {
  describe("createRecruitment", () => {
    const validArgs = () => ({
      periodStart: futureDate(7),
      periodEnd: futureDate(14),
      deadline: futureDate(3),
      shopClosedDates: [],
    });

    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await expect(t.mutation(api.recruitment.mutations.createRecruitment, validArgs())).rejects.toThrow();
    });

    it("店舗未登録の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await seedUser(ctx, "user_no_shop", "no@example.com");
      });

      await expect(
        t.withIdentity({ subject: "user_no_shop" }).mutation(api.recruitment.mutations.createRecruitment, validArgs()),
      ).rejects.toThrow();
    });

    function setupShop() {
      const t = convexTest(schema, modules);
      const shopId = t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        return seeded.shopId;
      });
      return { t, shopId };
    }

    // scheduler.runAfter(0, ...) による "use node" アクションがテスト環境で
    // トランザクション外書き込みエラーを起こすため、タイマーを止めて実行を抑制する
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("募集を作成できる", async () => {
      const { t, shopId: shopIdPromise } = setupShop();
      const shopId = await shopIdPromise;
      const args = validArgs();

      const recruitmentId = await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.recruitment.mutations.createRecruitment, args);

      expect(recruitmentId).toBeDefined();

      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(recruitment?.shopId).toBe(shopId);
      expect(recruitment?.status).toBe("open");
      expect(recruitment?.isDeleted).toBe(false);
      expect(recruitment?.periodStart).toBe(args.periodStart);
      // 店舗設定が後から変わっても過去の募集が歪まないよう、作成時点の提出方法をスナップショットする
      expect(recruitment?.submissionPattern).toEqual({ kind: "time", startTime: "09:00", endTime: "22:00" });
    });

    it("同一内容の募集作成は既存募集を返し、統計と通知予約を増やさない", async () => {
      const { t, shopId: shopIdPromise } = setupShop();
      const shopId = await shopIdPromise;
      const args = { ...validArgs(), shopClosedDates: [futureDate(8), futureDate(10)] };
      const asManager = t.withIdentity({ subject: "user_mgr" });

      const firstId = await asManager.mutation(api.recruitment.mutations.createRecruitment, args);
      const secondId = await asManager.mutation(api.recruitment.mutations.createRecruitment, {
        ...args,
        shopClosedDates: [...args.shopClosedDates].reverse(),
      });

      expect(secondId).toBe(firstId);
      const state = await t.run(async (ctx) => {
        const recruitments = await ctx.db
          .query("recruitments")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .collect();
        const stats = await ctx.db
          .query("recruitmentStats")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .collect();
        const scheduled = await ctx.db.system.query("_scheduled_functions").collect();
        return { recruitments, stats, scheduled };
      });

      expect(state.recruitments).toHaveLength(1);
      expect(state.stats).toHaveLength(1);
      expect(
        state.scheduled.filter((job) => job.name === "notification/actions:sendRecruitmentNotificationEmails"),
      ).toHaveLength(1);
    });

    it("同じ期間でも定休日が違う募集は別に作成できる", async () => {
      const { t } = setupShop();
      const asManager = t.withIdentity({ subject: "user_mgr" });

      const firstId = await asManager.mutation(api.recruitment.mutations.createRecruitment, {
        ...validArgs(),
        shopClosedDates: [futureDate(8)],
      });
      const secondId = await asManager.mutation(api.recruitment.mutations.createRecruitment, {
        ...validArgs(),
        shopClosedDates: [futureDate(9)],
      });

      expect(secondId).not.toBe(firstId);
    });

    it("削除済みの同一募集がある場合は新しく作成できる", async () => {
      const { t } = setupShop();
      const asManager = t.withIdentity({ subject: "user_mgr" });
      const args = validArgs();
      const firstId = await asManager.mutation(api.recruitment.mutations.createRecruitment, args);
      await asManager.mutation(api.recruitment.mutations.deleteRecruitment, { recruitmentId: firstId });

      const secondId = await asManager.mutation(api.recruitment.mutations.createRecruitment, args);

      expect(secondId).not.toBe(firstId);
    });

    it("店舗の提出方法を募集作成時点でスナップショットする", async () => {
      const { t, shopId: shopIdPromise } = setupShop();
      const shopId = await shopIdPromise;
      await t.run(async (ctx) => {
        await ctx.db.patch(shopId, {
          submissionPattern: {
            kind: "shiftType",
            options: [
              { id: "morning", name: "早番", startTime: "09:00", endTime: "14:00", sortOrder: 0 },
              { id: "late", name: "遅番", startTime: "14:00", endTime: "22:00", sortOrder: 1 },
            ],
          },
        });
      });

      const recruitmentId = await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.recruitment.mutations.createRecruitment, validArgs());
      await t.run(async (ctx) => {
        await ctx.db.patch(shopId, { submissionPattern: { kind: "dateOnly" } });
      });

      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(recruitment?.submissionPattern).toEqual({
        kind: "shiftType",
        options: [
          { id: "morning", name: "早番", startTime: "09:00", endTime: "14:00", sortOrder: 0 },
          { id: "late", name: "遅番", startTime: "14:00", endTime: "22:00", sortOrder: 1 },
        ],
      });
    });

    it("定休日を昇順ユニークにして保存できる", async () => {
      const { t } = setupShop();
      const args = {
        ...validArgs(),
        shopClosedDates: [futureDate(10), futureDate(8), futureDate(10)],
      };

      const recruitmentId = await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.recruitment.mutations.createRecruitment, args);

      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(recruitment?.shopClosedDates).toEqual([futureDate(8), futureDate(10)]);
    });

    it("期間外の定休日はエラー", async () => {
      const { t } = setupShop();

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.recruitment.mutations.createRecruitment, {
          ...validArgs(),
          shopClosedDates: [futureDate(15)],
        }),
      ).rejects.toThrow("定休日は募集期間内の日付を選んでください");
    });

    it("募集期間のすべてを定休日にするとエラー", async () => {
      const { t } = setupShop();

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.recruitment.mutations.createRecruitment, {
          periodStart: futureDate(7),
          periodEnd: futureDate(8),
          deadline: futureDate(3),
          shopClosedDates: [futureDate(7), futureDate(8)],
        }),
      ).rejects.toThrow("シフト期間のすべてを定休日にはできません");
    });

    it("日付形式が不正な定休日はエラー", async () => {
      const { t } = setupShop();

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.recruitment.mutations.createRecruitment, {
          ...validArgs(),
          shopClosedDates: ["2026/04/01"],
        }),
      ).rejects.toThrow("定休日の日付形式が正しくありません");
    });

    it("締切日が過去の場合エラーをthrow", async () => {
      const { t } = setupShop();

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.recruitment.mutations.createRecruitment, {
          ...validArgs(),
          deadline: futureDate(-1),
        }),
      ).rejects.toThrow("締切日は今日以降にしてください");
    });

    it("開始日が今日以前の場合エラーをthrow", async () => {
      const { t } = setupShop();

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.recruitment.mutations.createRecruitment, {
          periodStart: todayJST(),
          periodEnd: futureDate(14),
          deadline: futureDate(3),
          shopClosedDates: [],
        }),
      ).rejects.toThrow("開始日は明日以降にしてください");
    });
  });

  describe("deleteRecruitment", () => {
    async function setupRecruitment(
      options: { subject?: string; status?: "open" | "confirmed"; isDeleted?: boolean } = {},
    ) {
      const t = convexTest(schema, modules);
      const subject = options.subject ?? "user_delete_mgr";
      const recruitmentId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject,
          email: `${subject}@example.com`,
          shopName: "削除テスト店舗",
        });
        return await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
          shopClosedDates: [],
          status: options.status ?? "open",
          ...(options.status === "confirmed" ? { confirmedAt: Date.now() } : {}),
          isDeleted: options.isDeleted ?? false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
      });
      return { t, recruitmentId, subject };
    }

    it("未認証の場合エラーをthrow", async () => {
      const { t, recruitmentId } = await setupRecruitment();

      await expect(t.mutation(api.recruitment.mutations.deleteRecruitment, { recruitmentId })).rejects.toThrow();
    });

    it("店舗未登録の場合エラーをthrow", async () => {
      const { t, recruitmentId } = await setupRecruitment();
      await t.run(async (ctx) => {
        await seedUser(ctx, "user_no_shop_delete", "no-shop-delete@example.com");
      });

      await expect(
        t
          .withIdentity({ subject: "user_no_shop_delete" })
          .mutation(api.recruitment.mutations.deleteRecruitment, { recruitmentId }),
      ).rejects.toThrow();
    });

    it("募集中の募集を論理削除できる", async () => {
      const { t, recruitmentId, subject } = await setupRecruitment({ status: "open" });

      await t.withIdentity({ subject }).mutation(api.recruitment.mutations.deleteRecruitment, { recruitmentId });

      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(recruitment?.isDeleted).toBe(true);
    });

    it("確定済みの募集を論理削除できる", async () => {
      const { t, recruitmentId, subject } = await setupRecruitment({ status: "confirmed" });

      await t.withIdentity({ subject }).mutation(api.recruitment.mutations.deleteRecruitment, { recruitmentId });

      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(recruitment).toMatchObject({ status: "confirmed", isDeleted: true });
    });

    it("他店舗の募集は削除できない", async () => {
      const { t, recruitmentId } = await setupRecruitment({ subject: "user_delete_manager" });
      await t.run(async (ctx) => {
        await seedManagerShop(ctx, {
          subject: "user_delete_other",
          email: "delete-other@example.com",
          shopName: "別店舗",
        });
      });

      await expect(
        t
          .withIdentity({ subject: "user_delete_other" })
          .mutation(api.recruitment.mutations.deleteRecruitment, { recruitmentId }),
      ).rejects.toThrow("Not found");
    });

    it("削除済みの募集は削除できない", async () => {
      const { t, recruitmentId, subject } = await setupRecruitment({ isDeleted: true });

      await expect(
        t.withIdentity({ subject }).mutation(api.recruitment.mutations.deleteRecruitment, { recruitmentId }),
      ).rejects.toThrow("Not found");
    });

    it("存在しない募集IDは削除できない", async () => {
      const { t, subject } = await setupRecruitment();

      await expect(
        t.withIdentity({ subject }).mutation(api.recruitment.mutations.deleteRecruitment, {
          recruitmentId: "missing" as Id<"recruitments">,
        }),
      ).rejects.toThrow();
    });
  });
});
