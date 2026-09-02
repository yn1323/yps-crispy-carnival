import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { recalculateOpenRecruitmentStatsForShops } from "./stats";

describe("recruitment/stats", () => {
  it("caller固有のwork上限を超える場合は統計を部分更新しない", async () => {
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const targetShopId = await seedShop(ctx, "統計更新上限店舗");
      await seedStaff(ctx, {
        shopId: targetShopId,
        name: "対象スタッフ",
        email: "stats-work-limit@example.com",
      });
      await ctx.db.insert("recruitments", {
        shopId: targetShopId,
        periodStart: "2026-08-20",
        periodEnd: "2026-08-31",
        deadline: "2026-08-18",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return targetShopId;
    });

    await expect(
      t.run(async (ctx) => await recalculateOpenRecruitmentStatsForShops(ctx, [shopId], Date.now(), { workLimit: 1 })),
    ).rejects.toThrow("募集中のシフト提出状況を安全に更新できません");

    await expect(t.run(async (ctx) => await ctx.db.query("recruitmentStats").collect())).resolves.toEqual([]);
  });
});
