import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getFeatureRequestsRef } from "../analyticsDashboard/refs";

const submitFeatureRequest = makeFunctionReference<
  "mutation",
  {
    expectedOrganizationId: Id<"organizations">;
    comment: string;
    requestId: string;
    shopId: Id<"shops">;
  },
  { status: "accepted" }
>("featureRequest/mutations:submit");

const submitFeatureRequestForOrganization = makeFunctionReference<
  "mutation",
  {
    expectedOrganizationId: Id<"organizations">;
    shopId?: Id<"shops">;
    comment: string;
    requestId: string;
  },
  { status: "accepted" }
>("featureRequest/mutations:submitForOrganization");

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

    await asManager.mutation(submitFeatureRequest, {
      expectedOrganizationId: seeded.organizationId,
      comment: "スタッフ一覧を絞り込みたい",
      requestId,
      shopId: seeded.shopId,
    });
    await asManager.mutation(submitFeatureRequest, {
      expectedOrganizationId: seeded.organizationId,
      comment: "再送された要望",
      requestId,
      shopId: seeded.shopId,
    });

    const result = await t.query(getFeatureRequestsRef, { cursor: null, limit: 50 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      shopId: seeded.shopId,
      shopName: "シナリオ店舗",
      senderType: "manager",
      comment: "スタッフ一覧を絞り込みたい",
    });
  });

  it("新appの組織scope要望を組織対象として分析一覧へ反映する", async () => {
    const t = convexTest(schema, modules);
    const subject = "feature_request_scenario_organization";
    const requestId = "569b1117-077e-4ad1-a390-80b6dd8aa17c";
    const seeded = await t.run(async (ctx) => {
      const ids = await seedManagerShop(ctx, {
        subject,
        email: "feature-request-organization-scenario@example.com",
        shopName: "組織scope所属店舗",
      });
      await ctx.db.patch(ids.organizationId, { name: "組織scopeシナリオ" });
      return ids;
    });

    await t.withIdentity({ subject }).mutation(submitFeatureRequestForOrganization, {
      expectedOrganizationId: seeded.organizationId,
      comment: "組織全体の管理を改善したい",
      requestId,
    });

    const result = await t.query(getFeatureRequestsRef, { cursor: null, limit: 50 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      targetKind: "organization",
      organizationId: seeded.organizationId,
      organizationName: "組織scopeシナリオ",
      shopId: null,
      shopName: "組織scopeシナリオ（組織全体）",
      senderType: "manager",
      comment: "組織全体の管理を改善したい",
    });
  });
});
