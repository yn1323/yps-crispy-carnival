import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

async function seedRecruitment(t: TestConvex<typeof schema>, shopName: string) {
  return await t.run(async (ctx) => {
    const shopId = await seedShop(ctx, shopName);
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      deadline: "2026-07-25",
      shopClosedDates: ["2026-08-10"],
      status: "open",
      isDeleted: false,
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    });
    return { shopId, recruitmentId };
  });
}

describe("staffAuth/queries", () => {
  describe("getRecruitmentInfo", () => {
    it("未認証でも募集に紐づく店舗の最小DTOだけを返す", async () => {
      const t = convexTest(schema, modules);
      const first = await seedRecruitment(t, "対象店舗");
      await seedRecruitment(t, "別店舗");

      const result = await t.query(api.staffAuth.queries.getRecruitmentInfo, {
        recruitmentId: first.recruitmentId,
      });

      expect(result).toEqual({
        shopName: "対象店舗",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
      });
    });

    it("論理削除済み募集は null を返す", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await seedRecruitment(t, "対象店舗");
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, { isDeleted: true });
      });

      const result = await t.query(api.staffAuth.queries.getRecruitmentInfo, { recruitmentId });

      expect(result).toBeNull();
    });

    it("募集の所属店舗が論理削除済みの場合は null を返す", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId } = await seedRecruitment(t, "削除済み店舗");
      await t.run(async (ctx) => {
        await ctx.db.patch(shopId, { isDeleted: true });
      });

      const result = await t.query(api.staffAuth.queries.getRecruitmentInfo, { recruitmentId });

      expect(result).toBeNull();
    });
  });
});
