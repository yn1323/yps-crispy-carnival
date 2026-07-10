import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getFeatureRequestsRef } from "../analyticsDashboard/refs";

const submitFeatureRequest = makeFunctionReference<
  "mutation",
  { comment: string; requestId: string; shopId?: Id<"shops"> },
  { status: "accepted" }
>("featureRequest/mutations:submit");

describe("要望受付シナリオ", () => {
  it("管理ユーザーが送った要望を重複させず分析一覧へ反映する", async () => {
    const t = convexTest(schema, modules);
    const subject = "feature_request_scenario_manager";
    const requestId = "715cefed-afbf-46a6-bf84-064dad551888";
    const seeded = await t.run(async (ctx) => {
      const ids = await seedManagerShop(ctx, {
        subject,
        email: "feature-request-scenario@example.com",
        shopName: "シナリオ店舗",
      });
      await ctx.db.patch(ids.userId, { name: "シナリオ管理者" });
      return ids;
    });
    const asManager = t.withIdentity({ subject });

    await asManager.mutation(submitFeatureRequest, { comment: "スタッフ一覧を絞り込みたい", requestId });
    await asManager.mutation(submitFeatureRequest, { comment: "再送された要望", requestId });

    const result = await t.query(getFeatureRequestsRef, { cursor: null, limit: 50 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      shopId: seeded.shopId,
      shopName: "シナリオ店舗",
      senderType: "manager",
      comment: "スタッフ一覧を絞り込みたい",
    });
  });
});
