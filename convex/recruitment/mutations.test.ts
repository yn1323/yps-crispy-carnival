import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { todayJST } from "../_lib/dateFormat";
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
        await ctx.db.insert("users", {
          clerkId: "user_no_shop",
          name: "店舗なし",
          email: "no@example.com",
          role: "manager",
          isDeleted: false,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_no_shop" }).mutation(api.recruitment.mutations.createRecruitment, validArgs()),
      ).rejects.toThrow();
    });

    function setupShop() {
      const t = convexTest(schema, modules);
      const shopId = t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "user_mgr",
          name: "管理者",
          email: "mgr@example.com",
          role: "manager",
          isDeleted: false,
        });
        return await ctx.db.insert("shops", {
          name: "テスト店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_mgr",
          isDeleted: false,
        });
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
});
