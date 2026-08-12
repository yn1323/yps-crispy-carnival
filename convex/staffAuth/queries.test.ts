import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

async function seedRecruitment(
  t: TestConvex<typeof schema>,
  shopName: string,
  options: { status?: "open" | "confirmed" } = {},
) {
  return await t.run(async (ctx) => {
    const shopId = await seedShop(ctx, shopName);
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      deadline: "2026-07-25",
      shopClosedDates: ["2026-08-10"],
      status: options.status ?? "confirmed",
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
        recruitmentId: first.recruitmentId,
        shopName: "対象店舗",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
      });
    });

    it.each(["", "x".repeat(129), "not-a-convex-id"])("不正な募集ID %j は null を返す", async (recruitmentId) => {
      const t = convexTest(schema, modules);
      await seedRecruitment(t, "対象店舗");

      expect(await t.query(api.staffAuth.queries.getRecruitmentInfo, { recruitmentId })).toBeNull();
    });

    it("確定前の募集は null を返す", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await seedRecruitment(t, "募集中店舗", { status: "open" });

      expect(await t.query(api.staffAuth.queries.getRecruitmentInfo, { recruitmentId })).toBeNull();
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

    it("募集の所属組織が論理削除済みの場合は null を返す", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId } = await seedRecruitment(t, "削除済み組織店舗");
      await t.run(async (ctx) => {
        const shop = await ctx.db.get(shopId);
        if (!shop?.organizationId) throw new Error("テスト用組織が見つかりません");
        await ctx.db.patch(shop.organizationId, { isDeleted: true });
      });

      expect(await t.query(api.staffAuth.queries.getRecruitmentInfo, { recruitmentId })).toBeNull();
    });

    it.each(["active", "planSuspended", "archived"] as const)(
      "店舗状態が%sでも現行の非削除parent契約では確定募集を返す",
      async (operatingStatus) => {
        const t = convexTest(schema, modules);
        const { shopId, recruitmentId } = await seedRecruitment(t, `${operatingStatus}店舗`);
        await t.run(async (ctx) => {
          await ctx.db.patch(shopId, { operatingStatus });
        });

        expect(await t.query(api.staffAuth.queries.getRecruitmentInfo, { recruitmentId })).toEqual({
          recruitmentId,
          shopName: `${operatingStatus}店舗`,
          periodStart: "2026-08-01",
          periodEnd: "2026-08-31",
        });
      },
    );
  });
});
