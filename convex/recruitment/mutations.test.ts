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
      // 店舗設定が後から変わっても過去の募集が歪まないよう、作成時点のシフト時間をスナップショットする
      expect(recruitment?.shiftStartTime).toBe("09:00");
      expect(recruitment?.shiftEndTime).toBe("22:00");
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
          status: options.status ?? "open",
          ...(options.status === "confirmed" ? { confirmedAt: Date.now() } : {}),
          isDeleted: options.isDeleted ?? false,
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
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
      const { t, recruitmentId } = await setupRecruitment({ subject: "user_delete_owner" });
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
