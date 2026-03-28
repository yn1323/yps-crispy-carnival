import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";

describe("recruitment/mutations", () => {
  describe("createRecruitment", () => {
    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.recruitment.mutations.createRecruitment, {
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
        }),
      ).rejects.toThrow();
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
        t.withIdentity({ subject: "user_no_shop" }).mutation(api.recruitment.mutations.createRecruitment, {
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
        }),
      ).rejects.toThrow();
    });

    it("募集を作成できる", async () => {
      const t = convexTest(schema, modules);

      const shopId = await t.run(async (ctx) => {
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

      const recruitmentId = await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.recruitment.mutations.createRecruitment, {
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
        });

      expect(recruitmentId).toBeDefined();

      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(recruitment?.shopId).toBe(shopId);
      expect(recruitment?.status).toBe("open");
      expect(recruitment?.isDeleted).toBe(false);
      expect(recruitment?.periodStart).toBe("2026-04-01");
    });
  });
});
