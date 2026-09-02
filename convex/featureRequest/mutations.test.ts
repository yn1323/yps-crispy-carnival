import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { seedStaff } from "../_test/scenarioBuilders";
import { getTestOrganizationId, seedManagerShop, seedOrganizationMembership, seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { FEATURE_REQUEST_COMMENT_MAX_LENGTH } from "../constants";

const REQUEST_ID = "f4c8f39b-4dc1-4b97-b322-c1cc0f2dfe6f";
const submitFeatureRequest = makeFunctionReference<
  "mutation",
  { comment: string; expectedOrganizationId: Id<"organizations">; requestId: string; shopId: Id<"shops"> },
  { status: "accepted" }
>("featureRequest/mutations:submit");

const submitFeatureRequestFromStaff = makeFunctionReference<
  "mutation",
  { comment: string; requestId: string; sessionToken: string; accessKind: "submit" | "view" },
  { status: "accepted" }
>("featureRequest/mutations:submitFromStaff");

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

describe("featureRequest/mutations", () => {
  it("未認証では要望を登録できない", async () => {
    const t = convexTest(schema, modules);
    const shopId = await t.run((ctx) => seedShop(ctx, "未認証テスト店舗"));
    const expectedOrganizationId = await getTestOrganizationId(t, shopId);

    await expect(
      t.mutation(submitFeatureRequest, {
        comment: "一覧をCSVで出したい",
        expectedOrganizationId,
        requestId: REQUEST_ID,
        shopId,
      }),
    ).rejects.toThrow();
  });

  it("店舗と送信者を認証情報から確定して要望を登録する", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run((ctx) =>
      seedManagerShop(ctx, { subject: "feature_request_manager", email: "manager@example.com", shopName: "要望店舗" }),
    );

    const result = await t.withIdentity({ subject: "feature_request_manager" }).mutation(submitFeatureRequest, {
      comment: "  一覧をCSVで出したい  ",
      expectedOrganizationId: seeded.organizationId,
      requestId: REQUEST_ID,
      shopId: seeded.shopId,
    });

    expect(result).toEqual({ status: "accepted" });
    const requests = await t.run((ctx) => ctx.db.query("featureRequests").collect());
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      comment: "一覧をCSVで出したい",
      requestId: REQUEST_ID,
      shopId: seeded.shopId,
      userId: seeded.userId,
    });
    expect(requests[0]).not.toHaveProperty("organizationId");
  });

  it("同じrequestIdの再送は登録を増やさない", async () => {
    const t = convexTest(schema, modules);
    const { organizationId, shopId } = await t.run((ctx) =>
      seedManagerShop(ctx, { subject: "feature_request_retry", email: "retry@example.com", shopName: "再送店舗" }),
    );
    const asManager = t.withIdentity({ subject: "feature_request_retry" });

    await asManager.mutation(submitFeatureRequest, {
      comment: "最初の要望",
      expectedOrganizationId: organizationId,
      requestId: REQUEST_ID,
      shopId,
    });
    await expect(
      asManager.mutation(submitFeatureRequest, {
        comment: "再送された要望",
        expectedOrganizationId: organizationId,
        requestId: REQUEST_ID,
        shopId,
      }),
    ).resolves.toEqual({ status: "accepted" });

    expect(await t.run((ctx) => ctx.db.query("featureRequests").collect())).toHaveLength(1);
  });

  it("別店舗のshopIdでは要望を登録できない", async () => {
    const t = convexTest(schema, modules);
    const { expectedOrganizationId, otherShopId } = await t.run(async (ctx) => {
      const actor = await seedManagerShop(ctx, {
        subject: "feature_request_scoped",
        email: "scoped@example.com",
        shopName: "所属店舗",
      });
      const other = await seedManagerShop(ctx, {
        subject: "feature_request_other",
        email: "other@example.com",
        shopName: "別店舗",
      });
      return { expectedOrganizationId: actor.organizationId, otherShopId: other.shopId };
    });

    await expect(
      t.withIdentity({ subject: "feature_request_scoped" }).mutation(submitFeatureRequest, {
        comment: "別店舗名義の要望",
        expectedOrganizationId,
        requestId: REQUEST_ID,
        shopId: otherShopId,
      }),
    ).rejects.toThrow("Not found");
    expect(await t.run((ctx) => ctx.db.query("featureRequests").collect())).toHaveLength(0);
  });

  it("空白だけと201文字の要望を拒否する", async () => {
    const t = convexTest(schema, modules);
    const { organizationId, shopId } = await t.run((ctx) =>
      seedManagerShop(ctx, { subject: "feature_request_validation", email: "valid@example.com", shopName: "検証店舗" }),
    );
    const asManager = t.withIdentity({ subject: "feature_request_validation" });

    await expect(
      asManager.mutation(submitFeatureRequest, {
        comment: "   ",
        expectedOrganizationId: organizationId,
        requestId: REQUEST_ID,
        shopId,
      }),
    ).rejects.toThrow("要望を入力してください");
    await expect(
      asManager.mutation(submitFeatureRequest, {
        comment: "あ".repeat(FEATURE_REQUEST_COMMENT_MAX_LENGTH + 1),
        expectedOrganizationId: organizationId,
        requestId: "842ff731-6646-49f7-ac47-cea4cf432a30",
        shopId,
      }),
    ).rejects.toThrow("要望は200文字以内で入力してください");
  });

  it("異なる要望の短時間連続送信を拒否する", async () => {
    const t = convexTest(schema, modules);
    const { organizationId, shopId } = await t.run((ctx) =>
      seedManagerShop(ctx, { subject: "feature_request_limit", email: "limit@example.com", shopName: "制限店舗" }),
    );
    const asManager = t.withIdentity({ subject: "feature_request_limit" });

    await asManager.mutation(submitFeatureRequest, {
      comment: "最初の要望",
      expectedOrganizationId: organizationId,
      requestId: REQUEST_ID,
      shopId,
    });
    await expect(
      asManager.mutation(submitFeatureRequest, {
        comment: "次の要望",
        expectedOrganizationId: organizationId,
        requestId: "6cf637aa-9b42-4027-a0c8-46872f7e4a22",
        shopId,
      }),
    ).rejects.toThrow("少し時間をおいて");
  });

  it("canonicalな組織と有効店舗を明示して店舗scopeの要望を登録する", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run((ctx) =>
      seedManagerShop(ctx, {
        subject: "app_feature_request_manager",
        email: "app-feature-request@example.com",
        shopName: "アプリ要望店舗",
      }),
    );

    await expect(
      t.withIdentity({ subject: "app_feature_request_manager" }).mutation(submitFeatureRequestForOrganization, {
        expectedOrganizationId: seeded.organizationId,
        shopId: seeded.shopId,
        comment: "  この店舗への要望を送りたい  ",
        requestId: REQUEST_ID,
      }),
    ).resolves.toEqual({ status: "accepted" });

    const requests = await t.run((ctx) => ctx.db.query("featureRequests").collect());
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      shopId: seeded.shopId,
      userId: seeded.userId,
      comment: "この店舗への要望を送りたい",
      requestId: REQUEST_ID,
    });
    expect(requests[0]).not.toHaveProperty("organizationId");
  });

  it("現在店舗が未確定ならcanonicalな組織scopeで要望を登録する", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run((ctx) =>
      seedManagerShop(ctx, {
        subject: "app_feature_request_organization",
        email: "app-feature-request-organization@example.com",
        shopName: "組織scope要望店舗",
      }),
    );

    await expect(
      t.withIdentity({ subject: "app_feature_request_organization" }).mutation(submitFeatureRequestForOrganization, {
        expectedOrganizationId: seeded.organizationId,
        comment: "  組織全体への要望を送りたい  ",
        requestId: REQUEST_ID,
      }),
    ).resolves.toEqual({ status: "accepted" });

    const requests = await t.run((ctx) => ctx.db.query("featureRequests").collect());
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      organizationId: seeded.organizationId,
      userId: seeded.userId,
      comment: "組織全体への要望を送りたい",
      requestId: REQUEST_ID,
    });
    expect(requests[0]).not.toHaveProperty("shopId");
  });

  it("非削除店舗がなくてもcanonicalな組織scopeで要望を登録する", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const result = await seedManagerShop(ctx, {
        subject: "app_feature_request_without_non_deleted_shop",
        email: "app-feature-request-without-non-deleted-shop@example.com",
        shopName: "削除済み組織scope店舗",
      });
      await ctx.db.patch(result.shopId, { isDeleted: true });
      return result;
    });

    await expect(
      t
        .withIdentity({ subject: "app_feature_request_without_non_deleted_shop" })
        .mutation(submitFeatureRequestForOrganization, {
          expectedOrganizationId: seeded.organizationId,
          comment: "店舗がなくても伝えたい要望",
          requestId: REQUEST_ID,
        }),
    ).resolves.toEqual({ status: "accepted" });

    const requests = await t.run((ctx) => ctx.db.query("featureRequests").collect());
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      organizationId: seeded.organizationId,
      userId: seeded.userId,
      comment: "店舗がなくても伝えたい要望",
    });
    expect(requests[0]).not.toHaveProperty("shopId");
  });

  it("削除済み店舗scopeでは要望を登録できない", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const result = await seedManagerShop(ctx, {
        subject: "app_feature_request_deleted_shop",
        email: "app-feature-request-deleted-shop@example.com",
        shopName: "削除済み要望店舗",
      });
      await ctx.db.patch(result.shopId, { isDeleted: true });
      return result;
    });

    await expect(
      t.withIdentity({ subject: "app_feature_request_deleted_shop" }).mutation(submitFeatureRequestForOrganization, {
        expectedOrganizationId: seeded.organizationId,
        shopId: seeded.shopId,
        comment: "削除済み店舗への要望",
        requestId: REQUEST_ID,
      }),
    ).rejects.toThrow("Not found");
    expect(await t.run((ctx) => ctx.db.query("featureRequests").collect())).toEqual([]);
  });

  it("同じrequestIdのapp再送は登録を増やさない", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run((ctx) =>
      seedManagerShop(ctx, {
        subject: "app_feature_request_retry",
        email: "app-feature-request-retry@example.com",
        shopName: "アプリ再送店舗",
      }),
    );
    const asManager = t.withIdentity({ subject: "app_feature_request_retry" });

    await asManager.mutation(submitFeatureRequestForOrganization, {
      expectedOrganizationId: seeded.organizationId,
      shopId: seeded.shopId,
      comment: "最初の要望",
      requestId: REQUEST_ID,
    });
    await expect(
      asManager.mutation(submitFeatureRequestForOrganization, {
        expectedOrganizationId: seeded.organizationId,
        shopId: seeded.shopId,
        comment: "再送された要望",
        requestId: REQUEST_ID,
      }),
    ).resolves.toEqual({ status: "accepted" });

    const requests = await t.run((ctx) => ctx.db.query("featureRequests").collect());
    expect(requests).toHaveLength(1);
    expect(requests[0]?.comment).toBe("最初の要望");
  });

  it("URLの組織と異なる組織の店舗では要望を登録できない", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const primary = await seedManagerShop(ctx, {
        subject: "app_feature_request_cross_org",
        email: "app-feature-request-cross-org@example.com",
        shopName: "表示中の組織店舗",
      });
      const otherShopId = await seedShop(ctx, "別組織店舗");
      await seedOrganizationMembership(ctx, { userId: primary.userId, shopId: otherShopId });
      return { ...primary, otherShopId };
    });

    await expect(
      t.withIdentity({ subject: "app_feature_request_cross_org" }).mutation(submitFeatureRequestForOrganization, {
        expectedOrganizationId: seeded.organizationId,
        shopId: seeded.otherShopId,
        comment: "別組織店舗名義の要望",
        requestId: REQUEST_ID,
      }),
    ).rejects.toThrow("Not found");
    expect(await t.run((ctx) => ctx.db.query("featureRequests").collect())).toEqual([]);
  });

  it("所属していない組織scopeでは要望を登録できない", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const primary = await seedManagerShop(ctx, {
        subject: "app_feature_request_other_org",
        email: "app-feature-request-other-org@example.com",
        shopName: "所属組織店舗",
      });
      const other = await seedManagerShop(ctx, {
        subject: "app_feature_request_other_org_owner",
        email: "app-feature-request-other-org-owner@example.com",
        shopName: "未所属組織店舗",
      });
      return { primary, other };
    });

    await expect(
      t.withIdentity({ subject: "app_feature_request_other_org" }).mutation(submitFeatureRequestForOrganization, {
        expectedOrganizationId: seeded.other.organizationId,
        comment: "未所属組織名義の要望",
        requestId: REQUEST_ID,
      }),
    ).rejects.toThrow("Not found");
    expect(await t.run((ctx) => ctx.db.query("featureRequests").collect())).toEqual([]);
  });

  it("removedの組織所属ではapp要望を登録できない", async () => {
    const status = "removed" as const;
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const result = await seedManagerShop(ctx, {
        subject: `app_feature_request_${status}`,
        email: `app-feature-request-${status.toLowerCase()}@example.com`,
        shopName: `${status}店舗`,
      });
      await ctx.db.patch(result.memberId, { status, updatedAt: Date.now() });
      return result;
    });

    await expect(
      t.withIdentity({ subject: `app_feature_request_${status}` }).mutation(submitFeatureRequestForOrganization, {
        expectedOrganizationId: seeded.organizationId,
        comment: "権限のない要望",
        requestId: REQUEST_ID,
      }),
    ).rejects.toThrow("Not found");
    expect(await t.run((ctx) => ctx.db.query("featureRequests").collect())).toEqual([]);
  });

  it("スタッフセッションから店舗とstaffIdを確定して要望を登録する", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "staff_feature_request_manager",
        email: "staff-feature-request-manager@example.com",
        shopName: "スタッフ要望店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "スタッフ",
        email: "staff@example.com",
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-07",
        deadline: "2026-06-30",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
      });
      const sessionToken = "staff-feature-request-session";
      await ctx.db.insert("sessions", {
        sessionToken,
        staffId,
        shopId,
        recruitmentId,
        accessKind: "submit",
        expiresAt: Date.now() + 60_000,
      });
      return { shopId, staffId, sessionToken };
    });

    await expect(
      t.mutation(submitFeatureRequestFromStaff, {
        comment: "提出画面でも要望を送りたい",
        requestId: REQUEST_ID,
        sessionToken: seeded.sessionToken,
        accessKind: "submit",
      }),
    ).resolves.toEqual({ status: "accepted" });
    await expect(
      t.mutation(submitFeatureRequestFromStaff, {
        comment: "同じ要望の再送",
        requestId: REQUEST_ID,
        sessionToken: seeded.sessionToken,
        accessKind: "submit",
      }),
    ).resolves.toEqual({ status: "accepted" });

    const requests = await t.run((ctx) => ctx.db.query("featureRequests").collect());
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      shopId: seeded.shopId,
      staffId: seeded.staffId,
      comment: "提出画面でも要望を送りたい",
    });
    expect(requests[0]).not.toHaveProperty("organizationId");
    expect(requests[0]).not.toHaveProperty("userId");
  });

  it("view用sessionとcaller引数を一致させてもスタッフ要望を登録できない", async () => {
    const t = convexTest(schema, modules);
    const sessionToken = "staff-feature-request-view-session";
    await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "staff_feature_request_view_manager",
        email: "staff-feature-request-view-manager@example.com",
        shopName: "閲覧session要望店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "閲覧スタッフ",
        email: "viewer@example.com",
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-07",
        deadline: "2026-06-30",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
      });
      await ctx.db.insert("sessions", {
        sessionToken,
        staffId,
        shopId,
        recruitmentId,
        accessKind: "view",
        expiresAt: Date.now() + 60_000,
      });
    });

    await expect(
      t.mutation(submitFeatureRequestFromStaff, {
        comment: "閲覧画面から要望を送る",
        requestId: REQUEST_ID,
        sessionToken,
        accessKind: "view",
      }),
    ).rejects.toThrow("Session expired");
    expect(await t.run((ctx) => ctx.db.query("featureRequests").collect())).toEqual([]);
  });
});
