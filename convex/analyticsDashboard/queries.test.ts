import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getShopRecruitmentsRef } from "./refs";

function setup() {
  return convexTest(schema, modules);
}

function recruitmentInput(
  shopId: Id<"shops">,
  overrides: Partial<Doc<"recruitments">> = {},
): Omit<Doc<"recruitments">, "_creationTime" | "_id"> {
  return {
    deadline: "2026-07-01",
    isDeleted: false,
    periodEnd: "2026-07-14",
    periodStart: "2026-07-08",
    shopClosedDates: [],
    shopId,
    status: "open",
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
    ...overrides,
  };
}

describe("analyticsDashboard/queries", () => {
  it("店舗別シフト履歴を期間の新しい順に返し、削除済み募集を除外する", async () => {
    const t = setup();
    const { newerRecruitment, olderRecruitment, shopId } = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "ローカル店舗");
      const olderRecruitment = await ctx.db.insert(
        "recruitments",
        recruitmentInput(shopId, { periodEnd: "2026-06-14", periodStart: "2026-06-08" }),
      );
      const newerRecruitment = await ctx.db.insert(
        "recruitments",
        recruitmentInput(shopId, {
          confirmedAt: Date.now(),
          periodEnd: "2026-07-14",
          periodStart: "2026-07-08",
          status: "confirmed",
        }),
      );
      await ctx.db.insert(
        "recruitments",
        recruitmentInput(shopId, { isDeleted: true, periodEnd: "2026-08-14", periodStart: "2026-08-08" }),
      );
      await ctx.db.insert("recruitmentStats", {
        activeStaffCountSnapshot: 5,
        recruitmentId: newerRecruitment,
        shopId,
        submittedCount: 3,
        updatedAt: Date.now(),
      });

      return { newerRecruitment, olderRecruitment, shopId };
    });

    const result = await t.query(getShopRecruitmentsRef, { shopId });

    expect(result.shopName).toBe("ローカル店舗");
    expect(result.rows.map((row) => row.recruitmentId)).toEqual([newerRecruitment, olderRecruitment]);
    expect(result.rows[0]).toMatchObject({
      activeStaffCountSnapshot: 5,
      status: "confirmed",
      submittedCount: 3,
    });
    expect(result.rows).toHaveLength(2);
  });
});
