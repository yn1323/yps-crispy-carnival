import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { seedManagerShop, seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { FEATURE_REQUEST_COMMENT_MAX_LENGTH } from "../constants";

const REQUEST_ID = "f4c8f39b-4dc1-4b97-b322-c1cc0f2dfe6f";
const submitFeatureRequest = makeFunctionReference<
  "mutation",
  { comment: string; requestId: string; shopId: Id<"shops"> },
  { status: "accepted" }
>("featureRequest/mutations:submit");

const submitFeatureRequestFromStaff = makeFunctionReference<
  "mutation",
  { comment: string; requestId: string; sessionToken: string; accessKind: "submit" | "view" },
  { status: "accepted" }
>("featureRequest/mutations:submitFromStaff");

describe("featureRequest/mutations", () => {
  it("未認証では要望を登録できない", async () => {
    const t = convexTest(schema, modules);
    const shopId = await t.run((ctx) => seedShop(ctx, "未認証テスト店舗"));

    await expect(
      t.mutation(submitFeatureRequest, { comment: "一覧をCSVで出したい", requestId: REQUEST_ID, shopId }),
    ).rejects.toThrow();
  });

  it("店舗と送信者を認証情報から確定して要望を登録する", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run((ctx) =>
      seedManagerShop(ctx, { subject: "feature_request_manager", email: "manager@example.com", shopName: "要望店舗" }),
    );

    const result = await t.withIdentity({ subject: "feature_request_manager" }).mutation(submitFeatureRequest, {
      comment: "  一覧をCSVで出したい  ",
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
  });

  it("同じrequestIdの再送は登録を増やさない", async () => {
    const t = convexTest(schema, modules);
    const { shopId } = await t.run((ctx) =>
      seedManagerShop(ctx, { subject: "feature_request_retry", email: "retry@example.com", shopName: "再送店舗" }),
    );
    const asManager = t.withIdentity({ subject: "feature_request_retry" });

    await asManager.mutation(submitFeatureRequest, { comment: "最初の要望", requestId: REQUEST_ID, shopId });
    await expect(
      asManager.mutation(submitFeatureRequest, { comment: "再送された要望", requestId: REQUEST_ID, shopId }),
    ).resolves.toEqual({ status: "accepted" });

    expect(await t.run((ctx) => ctx.db.query("featureRequests").collect())).toHaveLength(1);
  });

  it("別店舗のshopIdでは要望を登録できない", async () => {
    const t = convexTest(schema, modules);
    const { otherShopId } = await t.run(async (ctx) => {
      await seedManagerShop(ctx, {
        subject: "feature_request_scoped",
        email: "scoped@example.com",
        shopName: "所属店舗",
      });
      const other = await seedManagerShop(ctx, {
        subject: "feature_request_other",
        email: "other@example.com",
        shopName: "別店舗",
      });
      return { otherShopId: other.shopId };
    });

    await expect(
      t.withIdentity({ subject: "feature_request_scoped" }).mutation(submitFeatureRequest, {
        comment: "別店舗名義の要望",
        requestId: REQUEST_ID,
        shopId: otherShopId,
      }),
    ).rejects.toThrow("Not found");
    expect(await t.run((ctx) => ctx.db.query("featureRequests").collect())).toHaveLength(0);
  });

  it("空白だけと201文字の要望を拒否する", async () => {
    const t = convexTest(schema, modules);
    const { shopId } = await t.run((ctx) =>
      seedManagerShop(ctx, { subject: "feature_request_validation", email: "valid@example.com", shopName: "検証店舗" }),
    );
    const asManager = t.withIdentity({ subject: "feature_request_validation" });

    await expect(
      asManager.mutation(submitFeatureRequest, { comment: "   ", requestId: REQUEST_ID, shopId }),
    ).rejects.toThrow("要望を入力してください");
    await expect(
      asManager.mutation(submitFeatureRequest, {
        comment: "あ".repeat(FEATURE_REQUEST_COMMENT_MAX_LENGTH + 1),
        requestId: "842ff731-6646-49f7-ac47-cea4cf432a30",
        shopId,
      }),
    ).rejects.toThrow("要望は200文字以内で入力してください");
  });

  it("異なる要望の短時間連続送信を拒否する", async () => {
    const t = convexTest(schema, modules);
    const { shopId } = await t.run((ctx) =>
      seedManagerShop(ctx, { subject: "feature_request_limit", email: "limit@example.com", shopName: "制限店舗" }),
    );
    const asManager = t.withIdentity({ subject: "feature_request_limit" });

    await asManager.mutation(submitFeatureRequest, { comment: "最初の要望", requestId: REQUEST_ID, shopId });
    await expect(
      asManager.mutation(submitFeatureRequest, {
        comment: "次の要望",
        requestId: "6cf637aa-9b42-4027-a0c8-46872f7e4a22",
        shopId,
      }),
    ).rejects.toThrow("少し時間をおいて");
  });

  it("スタッフセッションから店舗とstaffIdを確定して要望を登録する", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "スタッフ要望店舗");
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "スタッフ",
        email: "staff@example.com",
        isDeleted: false,
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
    expect(requests[0]).not.toHaveProperty("userId");
  });

  it("view用sessionとcaller引数を一致させてもスタッフ要望を登録できない", async () => {
    const t = convexTest(schema, modules);
    const sessionToken = "staff-feature-request-view-session";
    await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "閲覧session要望店舗");
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "閲覧スタッフ",
        email: "viewer@example.com",
        isDeleted: false,
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
