import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedStaff } from "../_test/scenarioBuilders";
import {
  getTestOrganizationId,
  seedManagerShop,
  seedOrganizationManagerShop,
  seedShop,
  seedUser,
  testAuthTokenIdentifier,
} from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { ORGANIZATION_USAGE_ACCESS_ACTIVE_PEOPLE_SCAN_LIMIT } from "../organization/service";

const PAGINATION_FIRST_PAGE = { paginationOpts: { numItems: 10, cursor: null } };
const firstPageArgs = async (t: TestConvex<typeof schema>, shopId: Id<"shops">) => ({
  ...PAGINATION_FIRST_PAGE,
  shopId,
  expectedOrganizationId: await getTestOrganizationId(t, shopId),
});

describe("dashboard/queries", () => {
  describe("getDashboardShop", () => {
    beforeEach(() => {
      vi.stubEnv("STRIPE_SECRET_KEY", "");
      vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
      vi.stubEnv("STRIPE_STANDARD_PRICE_ID", "");
      vi.stubEnv("STRIPE_PRO_PRICE_ID", "");
      vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("未認証の場合 null を返す", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => await seedShop(ctx, "対象店舗"));
      const result = await t.query(api.dashboard.queries.getDashboardShop, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
      });
      expect(result).toBeNull();
    });

    it("認証済みだが店舗未登録の場合 null を返す", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => await seedShop(ctx, "未所属店舗"));
      const result = await t.withIdentity({ subject: "user_123" }).query(api.dashboard.queries.getDashboardShop, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
      });
      expect(result).toBeNull();
    });

    it("店舗登録済みの場合、店舗情報を返す", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(
        async (ctx) => await seedManagerShop(ctx, { subject: "user_123", shopName: "テスト店舗" }),
      );

      const result = await t.withIdentity({ subject: "user_123" }).query(api.dashboard.queries.getDashboardShop, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
      });
      expect(result).toEqual({
        name: "テスト店舗",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        canWriteBusinessData: true,
        businessWriteBlockReason: null,
      });
    });

    it("同一事業者の複数店舗は明示shopIdに応じて返し分ける", async () => {
      const t = convexTest(schema, modules);
      const { organizationId, firstShopId, secondShopId } = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: "multi_shop_dashboard_user",
          shopName: "有効店舗A",
        });
        const secondShopId = await ctx.db.insert("shops", {
          organizationId: seeded.organizationId,
          name: "有効店舗B",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        return { organizationId: seeded.organizationId, firstShopId: seeded.shopId, secondShopId };
      });
      const asManager = t.withIdentity({ subject: "multi_shop_dashboard_user" });

      const firstShop = await asManager.query(api.dashboard.queries.getDashboardShop, {
        expectedOrganizationId: organizationId,
        shopId: firstShopId,
      });
      const secondShop = await asManager.query(api.dashboard.queries.getDashboardShop, {
        expectedOrganizationId: organizationId,
        shopId: secondShopId,
      });

      expect(firstShop?.name).toBe("有効店舗A");
      expect(secondShop?.name).toBe("有効店舗B");
    });

    it("論理削除された店舗は null を返す", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(
        async (ctx) =>
          await seedManagerShop(ctx, { subject: "user_deleted", shopName: "削除済み店舗", shopDeleted: true }),
      );

      const result = await t.withIdentity({ subject: "user_deleted" }).query(api.dashboard.queries.getDashboardShop, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
      });
      expect(result).toBeNull();
    });

    it("指定した店舗が削除済みの場合、別の有効店舗へフォールバックしない", async () => {
      const t = convexTest(schema, modules);
      const { deletedShopId, organizationId } = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: "user_deleted_first",
          shopName: "削除済み店舗",
          shopDeleted: true,
        });
        await ctx.db.insert("shops", {
          organizationId: seeded.organizationId,
          name: "残っている店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        return { deletedShopId: seeded.shopId, organizationId: seeded.organizationId };
      });

      const result = await t
        .withIdentity({ subject: "user_deleted_first" })
        .query(api.dashboard.queries.getDashboardShop, {
          expectedOrganizationId: organizationId,
          shopId: deletedShopId,
        });

      expect(result).toBeNull();
    });

    it("削除済みmembershipでは店舗情報を返さない", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(
        async (ctx) =>
          await seedManagerShop(ctx, {
            subject: "user_deleted_membership",
            shopName: "削除済みmembership店舗",
            membershipDeleted: true,
          }),
      );

      const result = await t
        .withIdentity({ subject: "user_deleted_membership" })
        .query(api.dashboard.queries.getDashboardShop, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
        });
      expect(result).toBeNull();
    });

    it("論理削除済みユーザーには所属店舗情報を返さない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const { userId, shopId } = await seedManagerShop(ctx, {
          subject: "deleted_dashboard_user",
          shopName: "削除ユーザー所属店舗",
        });
        await ctx.db.patch(userId, { isDeleted: true });
        return shopId;
      });

      await expect(
        t.withIdentity({ subject: "deleted_dashboard_user" }).query(api.dashboard.queries.getDashboardShop, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
        }),
      ).resolves.toBeNull();
    });

    it("返り値に不要なフィールドが含まれない", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(
        async (ctx) => await seedManagerShop(ctx, { subject: "user_fields", shopName: "店舗" }),
      );

      const result = await t.withIdentity({ subject: "user_fields" }).query(api.dashboard.queries.getDashboardShop, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
      });
      expect(Object.keys(result ?? {}).sort()).toEqual([
        "businessWriteBlockReason",
        "canWriteBusinessData",
        "name",
        "regularClosedDays",
        "submissionPattern",
      ]);
    });

    it("Freeからの契約開始結果待ちはDashboardの基本業務を継続する", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: "dashboard_pending_free",
          plan: "free",
        });
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
          .unique();
        if (!billingState) throw new Error("billing state not found");
        await ctx.db.patch(billingState._id, {
          state: { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: 1 },
        });
        return seeded;
      });

      const result = await t
        .withIdentity({ subject: "dashboard_pending_free" })
        .query(api.dashboard.queries.getDashboardShop, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
        });

      expect(result).toMatchObject({ canWriteBusinessData: true, businessWriteBlockReason: null });
    });

    it("active.freeの利用人数が上限を超えた場合は業務操作を閲覧専用にする", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: "dashboard_active_free_over_limit",
          plan: "free",
        });
        for (let index = 0; index < 5; index += 1) {
          await seedStaff(ctx, {
            shopId: seeded.shopId,
            name: `追加スタッフ${index + 1}`,
            email: `dashboard-over-limit-${index + 1}@example.com`,
          });
        }
        return seeded;
      });

      const result = await t
        .withIdentity({ subject: "dashboard_active_free_over_limit" })
        .query(api.dashboard.queries.getDashboardShop, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
        });

      expect(result).toMatchObject({
        canWriteBusinessData: false,
        businessWriteBlockReason: "usageLimitExceeded",
        usageLimitStatus: {
          kind: "overLimit",
          evaluatedPlan: "free",
          violations: [{ kind: "people", current: 6, max: 5, excess: 1 }],
        },
      });
    });

    it("利用人数のbounded評価を確定できない場合は上限超過と断定せず、評価不能として業務操作を制限する", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: "dashboard_usage_limit_unknown",
          plan: "pro",
        });
        const now = Date.now();
        for (let index = 0; index < ORGANIZATION_USAGE_ACCESS_ACTIVE_PEOPLE_SCAN_LIMIT + 1; index += 1) {
          const email = `dashboard-usage-unknown-${String(index)}@example.com`;
          await ctx.db.insert("organizationPeople", {
            organizationId: seeded.organizationId,
            name: `利用数未確定${String(index)}`,
            email,
            emailNormalized: email,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
        }
        return seeded;
      });

      const result = await t
        .withIdentity({ subject: "dashboard_usage_limit_unknown" })
        .query(api.dashboard.queries.getDashboardShop, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
        });

      expect(result).toMatchObject({
        canWriteBusinessData: false,
        businessWriteBlockReason: "usageLimitEvaluationUnavailable",
        usageLimitStatus: { kind: "unknown", evaluatedPlan: "pro" },
      });
    });

    it.each([
      {
        label: "Stripe設定不備",
        state: { kind: "active", plan: "free" } as const,
        stripeReady: false,
        expected: { terminationPending: false, canStartPaidPlan: false },
      },
      {
        label: "Freeへの変更完了後",
        state: { kind: "active", plan: "free" } as const,
        stripeReady: true,
        expected: { terminationPending: false, canStartPaidPlan: true },
      },
      {
        label: "complimentary",
        state: { kind: "complimentary", plan: "pro" } as const,
        stripeReady: true,
        expected: { terminationPending: false, canStartPaidPlan: false },
      },
      {
        label: "initialPaymentPending",
        state: { kind: "initialPaymentPending", plan: "pro", startedAt: 1 } as const,
        stripeReady: true,
        expected: { terminationPending: false, canStartPaidPlan: false },
      },
      {
        label: "pendingActivation",
        state: { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: 1 } as const,
        stripeReady: true,
        expected: { terminationPending: false, canStartPaidPlan: false },
      },
      {
        label: "paymentTerminationPending",
        state: { kind: "paymentTerminationPending", previousPlan: "pro", startedAt: 1 } as const,
        stripeReady: true,
        expected: { terminationPending: true, canStartPaidPlan: false },
      },
    ])("支払い失敗の$labelでは再契約可否を最小DTOで返す", async ({ label, state, stripeReady, expected }) => {
      if (stripeReady) {
        vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dashboard_payment_failure");
        vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_dashboard_payment_failure");
        vi.stubEnv("STRIPE_STANDARD_PRICE_ID", "price_dashboard_standard");
        vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_dashboard_pro");
        vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_dashboard_payment_failure");
      }
      const t = convexTest(schema, modules);
      const subject = `dashboard_payment_failure_${label}`;
      const { shopId } = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, { subject, plan: "pro" });
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
          .unique();
        if (!billingState) throw new Error("billing state not found");
        await ctx.db.patch(billingState._id, {
          state,
          lastPlanChange: { reason: "paymentFailed", previousPlan: "pro", occurredAt: 1 },
        });
        return seeded;
      });

      const result = await t.withIdentity({ subject }).query(api.dashboard.queries.getDashboardShop, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
      });

      expect(result?.paymentFailure).toEqual(expected);
      expect(result).not.toHaveProperty("planStatus");
      expect(result).not.toHaveProperty("trialEndingNotice");
    });
  });

  describe("getMyShops", () => {
    it("未認証またはユーザー未登録の場合は空配列を返す", async () => {
      const unauthenticated = convexTest(schema, modules);
      const unregistered = convexTest(schema, modules);

      await expect(unauthenticated.query(api.dashboard.queries.getMyShops, {})).resolves.toEqual([]);
      await expect(
        unregistered.withIdentity({ subject: "unregistered_user" }).query(api.dashboard.queries.getMyShops, {}),
      ).resolves.toEqual([]);
    });

    it.each(["active"] as const)("事業者の%s管理者には同じ事業者の全非削除店舗だけを返す", async (memberStatus) => {
      const t = convexTest(schema, modules);
      const subject = `organization_shop_list_${memberStatus}`;
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject,
          shopName: "事業者店舗A",
          plan: "pro",
        });
        await ctx.db.patch(base.memberId, { status: memberStatus });
        const secondShopId = await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          name: "事業者店舗B",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        const deletedShopId = await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          name: "削除済み事業者店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: true,
        });
        const other = await seedOrganizationManagerShop(ctx, {
          subject: `other_${memberStatus}`,
          shopName: "別事業者店舗",
          plan: "pro",
        });
        return { ...base, secondShopId, deletedShopId, otherShopId: other.shopId };
      });

      const result = await t.withIdentity({ subject }).query(api.dashboard.queries.getMyShops, {});

      expect(result).toEqual([
        {
          shopId: ids.shopId,
          shopName: "事業者店舗A",
          organizationId: ids.organizationId,
          organizationName: "事業者店舗A事業者",
          organizationPlan: "pro",
          memberStatus,
        },
        {
          shopId: ids.secondShopId,
          shopName: "事業者店舗B",
          organizationId: ids.organizationId,
          organizationName: "事業者店舗A事業者",
          organizationPlan: "pro",
          memberStatus,
        },
      ]);
      expect(result.some((shop) => shop.shopId === ids.deletedShopId)).toBe(false);
      expect(result.some((shop) => shop.shopId === ids.otherShopId)).toBe(false);
    });

    it("複数組織に所属する利用者には各組織の非削除店舗だけを所属状態付きで返す", async () => {
      const t = convexTest(schema, modules);
      const subject = "multi_organization_shop_list";
      const ids = await t.run(async (ctx) => {
        const email = "multi-organization@example.com";
        const organizationA = await seedOrganizationManagerShop(ctx, {
          subject,
          email,
          shopName: "組織A店舗",
          plan: "pro",
        });
        await ctx.db.patch(organizationA.organizationId, { name: "組織A" });
        await ctx.db.insert("shops", {
          organizationId: organizationA.organizationId,
          name: "組織A削除済み店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: true,
        });

        const now = Date.now();
        const organizationBId = await ctx.db.insert("organizations", {
          name: "組織B",
          billingEmail: email,
          billingEmailNormalized: email,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        });
        const organizationBPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: organizationBId,
          userId: organizationA.userId,
          name: "管理者",
          email,
          emailNormalized: email,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationMembers", {
          organizationId: organizationBId,
          personId: organizationBPersonId,
          userId: organizationA.userId,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        const organizationBShopId = await ctx.db.insert("shops", {
          organizationId: organizationBId,
          name: "組織B店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        await ctx.db.insert("shops", {
          organizationId: organizationBId,
          name: "組織B削除済み店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: true,
        });
        await ctx.db.insert("organizationBillingStates", {
          organizationId: organizationBId,
          state: { kind: "active", plan: "pro" },
          version: 1,
          createdAt: now,
          updatedAt: now,
        });

        await seedOrganizationManagerShop(ctx, {
          subject: "multi_organization_other_user",
          shopName: "非所属組織C店舗",
          plan: "pro",
        });

        return {
          organizationAId: organizationA.organizationId,
          organizationAShopId: organizationA.shopId,
          organizationBId,
          organizationBShopId,
        };
      });

      const result = await t.withIdentity({ subject }).query(api.dashboard.queries.getMyShops, {});

      expect(
        result
          .map((shop) => ({
            organizationId: shop.organizationId,
            organizationName: shop.organizationName,
            organizationPlan: shop.organizationPlan,
            memberStatus: shop.memberStatus,
            shopId: shop.shopId,
            shopName: shop.shopName,
          }))
          .sort(
            (a, b) =>
              (a.organizationName ?? "").localeCompare(b.organizationName ?? "", "ja") ||
              a.shopName.localeCompare(b.shopName, "ja"),
          ),
      ).toEqual([
        {
          organizationId: ids.organizationAId,
          organizationName: "組織A",
          organizationPlan: "pro",
          memberStatus: "active",
          shopId: ids.organizationAShopId,
          shopName: "組織A店舗",
        },
        {
          organizationId: ids.organizationBId,
          organizationName: "組織B",
          organizationPlan: "pro",
          memberStatus: "active",
          shopId: ids.organizationBShopId,
          shopName: "組織B店舗",
        },
      ]);
    });

    it.each([
      {
        label: "有効なPro",
        seedPlan: "pro" as const,
        state: { kind: "active", plan: "pro" } as const,
        expectedPlan: "pro" as const,
      },
      {
        label: "ProからStandardへの変更予約中",
        seedPlan: "pro" as const,
        state: {
          kind: "scheduledChange",
          currentPlan: "pro",
          targetPlan: "standard",
          effectiveAt: Date.now() + 60_000,
        } as const,
        expectedPlan: "pro" as const,
      },
      {
        label: "FreeからProへの支払い結果待ち",
        seedPlan: "free" as const,
        state: { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: Date.now() } as const,
        expectedPlan: "free" as const,
      },
    ])("$labelは現在利用できるプランを店舗コンテキストへ返す", async ({ seedPlan, state, expectedPlan }) => {
      const t = convexTest(schema, modules);
      const subject = `shop_context_plan_${state.kind}_${expectedPlan}`;
      await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, { subject, plan: seedPlan });
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
          .unique();
        if (!billingState) throw new Error("billing state not found");
        await ctx.db.patch(billingState._id, { state });
      });

      const result = await t.withIdentity({ subject }).query(api.dashboard.queries.getMyShops, {});

      expect(result).toHaveLength(1);
      expect(result[0]?.organizationPlan).toBe(expectedPlan);
    });

    it("論理削除済みユーザーの場合は所属店舗を返さない", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const { userId } = await seedManagerShop(ctx, {
          subject: "deleted_user",
          shopName: "所属店舗",
        });
        await ctx.db.patch(userId, { isDeleted: true });
      });

      const result = await t.withIdentity({ subject: "deleted_user" }).query(api.dashboard.queries.getMyShops, {});

      expect(result).toEqual([]);
    });
  });

  describe("getActiveDashboardAnnouncement", () => {
    it("未認証の場合はnullを返す", async () => {
      const t = convexTest(schema, modules);
      const result = await t.query(api.dashboard.queries.getActiveDashboardAnnouncement, {});
      expect(result).toBeNull();
    });

    it("旧フロントには対象指定を除外して最新の全体向けだけを返す", async () => {
      const t = convexTest(schema, modules);
      const globalAnnouncementId = await t.run(async (ctx) => {
        const now = Date.now();
        const organizationId = await ctx.db.insert("organizations", {
          billingEmail: "billing@example.com",
          billingEmailNormalized: "billing@example.com",
          name: "互換確認事業者",
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        });
        const shopId = await ctx.db.insert("shops", {
          organizationId,
          name: "互換確認店舗",
          regularClosedDays: [],
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          isDeleted: false,
        });
        await ctx.db.insert("dashboardAnnouncements", {
          organizationId: `${organizationId}, ${organizationId}`,
          title: "事業者向けのお知らせ",
          bodyHtml: "<p>旧フロントには表示しません。</p>",
          displayDate: "2026-06-19",
          isPublished: true,
          isDeleted: false,
        });
        await ctx.db.insert("dashboardAnnouncements", {
          shopId,
          title: "店舗向けのお知らせ",
          bodyHtml: "<p>旧フロントには表示しません。</p>",
          displayDate: "2026-06-18",
          isPublished: true,
          isDeleted: false,
        });
        await ctx.db.insert("dashboardAnnouncements", {
          organizationPlan: "pro,business",
          title: "契約プラン向けのお知らせ",
          bodyHtml: "<p>旧フロントには表示しません。</p>",
          displayDate: "2026-06-20",
          isPublished: true,
          isDeleted: false,
        });
        return await ctx.db.insert("dashboardAnnouncements", {
          title: "全体向けのお知らせ",
          bodyHtml: "<p>全体向けです。</p>",
          displayDate: "2026-06-17",
          isPublished: true,
          isDeleted: false,
        });
      });

      const result = await t
        .withIdentity({ subject: "announcement_compatibility_user" })
        .query(api.dashboard.queries.getActiveDashboardAnnouncement, {});

      expect(result).toEqual({
        _id: globalAnnouncementId,
        title: "全体向けのお知らせ",
        bodyHtml: "<p>全体向けです。</p>",
        displayDate: "2026-06-17",
      });
    });
  });

  describe("getActiveDashboardAnnouncements", () => {
    it("未認証の場合は空配列を返す", async () => {
      const t = convexTest(schema, modules);

      await expect(t.query(api.dashboard.queries.getActiveDashboardAnnouncements, {})).resolves.toEqual([]);
    });

    it("旧複数件フロントにはプラン単独指定を返さず全体向けへの誤表示を防ぐ", async () => {
      const t = convexTest(schema, modules);
      const globalAnnouncementId = await t.run(async (ctx) => {
        await ctx.db.insert("dashboardAnnouncements", {
          organizationPlan: "pro,business",
          title: "契約プラン向けのお知らせ",
          bodyHtml: "<p>旧フロントには表示しません。</p>",
          displayDate: "2026-06-18",
          isPublished: true,
          isDeleted: false,
        });
        return await ctx.db.insert("dashboardAnnouncements", {
          title: "全体向けのお知らせ",
          bodyHtml: "<p>全体向けです。</p>",
          displayDate: "2026-06-17",
          isPublished: true,
          isDeleted: false,
        });
      });

      const result = await t
        .withIdentity({ subject: "announcement_plural_compatibility_user" })
        .query(api.dashboard.queries.getActiveDashboardAnnouncements, {});

      expect(result).toEqual([
        {
          _id: globalAnnouncementId,
          title: "全体向けのお知らせ",
          bodyHtml: "<p>全体向けです。</p>",
          displayDate: "2026-06-17",
        },
      ]);
    });
  });

  describe("getActiveDashboardAnnouncementsV2", () => {
    it("未認証の場合は空配列を返す", async () => {
      const t = convexTest(schema, modules);
      const result = await t.query(api.dashboard.queries.getActiveDashboardAnnouncementsV2, {});
      expect(result).toEqual([]);
    });

    it("削除済みユーザーには3世代のお知らせqueryすべてで本文を返さない", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const userId = await seedUser(ctx, "deleted_announcement_user");
        await ctx.db.patch(userId, { isDeleted: true });
        await ctx.db.insert("dashboardAnnouncements", {
          title: "削除済みユーザーへ返さないお知らせ",
          bodyHtml: "<p>返しません。</p>",
          displayDate: "2026-06-17",
          isPublished: true,
          isDeleted: false,
        });
      });
      const actor = t.withIdentity({ subject: "deleted_announcement_user" });

      await expect(actor.query(api.dashboard.queries.getActiveDashboardAnnouncement, {})).resolves.toBeNull();
      await expect(actor.query(api.dashboard.queries.getActiveDashboardAnnouncements, {})).resolves.toEqual([]);
      await expect(actor.query(api.dashboard.queries.getActiveDashboardAnnouncementsV2, {})).resolves.toEqual([]);
    });

    it("公開中のお知らせがない場合は空配列を返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("dashboardAnnouncements", {
          title: "下書きのお知らせ",
          bodyHtml: "<p>非公開です。</p>",
          displayDate: "2026-06-17",
          isPublished: false,
          isDeleted: false,
        });
      });

      const result = await t
        .withIdentity({ subject: "announcement_user" })
        .query(api.dashboard.queries.getActiveDashboardAnnouncementsV2, {});
      expect(result).toEqual([]);
    });

    it("Pro対象はすべてのお知らせqueryへProとして返す", async () => {
      const t = convexTest(schema, modules);
      const announcementId = await t.run(
        async (ctx) =>
          await ctx.db.insert("dashboardAnnouncements", {
            organizationId: "organization-target",
            organizationPlan: "pro",

            title: "Pro対象のお知らせ",
            bodyHtml: "<p>Pro対象です。</p>",
            displayDate: "2026-06-17",
            isPublished: true,
            isDeleted: false,
          }),
      );
      const actor = t.withIdentity({ subject: "announcement_canonical_plan_user" });

      await expect(actor.query(api.dashboard.queries.getActiveDashboardAnnouncementsV2, {})).resolves.toEqual([
        expect.objectContaining({ _id: announcementId, organizationPlan: "pro" }),
      ]);
      await expect(actor.query(api.dashboard.queries.getActiveDashboardAnnouncements, {})).resolves.toEqual([
        expect.objectContaining({ _id: announcementId, organizationPlan: "pro" }),
      ]);
    });

    it("対象指定を必要なフィールドだけ返し、重複したPro対象を正規化する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const now = Date.now();
        const organizationId = await ctx.db.insert("organizations", {
          billingEmail: "billing@example.com",
          billingEmailNormalized: "billing@example.com",
          name: "対象事業者",
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        });
        const shopId = await ctx.db.insert("shops", {
          organizationId,
          name: "対象店舗",
          regularClosedDays: [],
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          isDeleted: false,
        });
        const otherOrganizationId = await ctx.db.insert("organizations", {
          billingEmail: "billing@example.com",
          billingEmailNormalized: "billing@example.com",
          name: "別の対象事業者",
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        });
        const otherShopId = await ctx.db.insert("shops", {
          organizationId: otherOrganizationId,
          name: "別の対象店舗",
          regularClosedDays: [],
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          isDeleted: false,
        });
        const organizationTargets = `${organizationId}, ${otherOrganizationId}`;
        const shopTargets = `${shopId}, ${otherShopId}`;
        const organizationPlanTargets = " pro, pro ";
        const globalAnnouncementId = await ctx.db.insert("dashboardAnnouncements", {
          title: "全体向けのお知らせ",
          bodyHtml: "<p>全体向けです。</p>",
          displayDate: "2026-06-17",
          isPublished: true,
          isDeleted: false,
        });
        const organizationAnnouncementId = await ctx.db.insert("dashboardAnnouncements", {
          organizationId: organizationTargets,
          title: "事業者向けのお知らせ",
          bodyHtml: "<p>事業者向けです。</p>",
          displayDate: "2026-06-18",
          isPublished: true,
          isDeleted: false,
        });
        const shopAnnouncementId = await ctx.db.insert("dashboardAnnouncements", {
          shopId,
          title: "店舗向けのお知らせ",
          bodyHtml: "<p>店舗向けです。</p>",
          displayDate: "2026-06-19",
          isPublished: true,
          isDeleted: false,
        });
        const combinedAnnouncementId = await ctx.db.insert("dashboardAnnouncements", {
          organizationId: organizationTargets,
          shopId: shopTargets,
          title: "事業者または店舗向けのお知らせ",
          bodyHtml: "<p>事業者または店舗向けです。</p>",
          displayDate: "2026-06-20",
          isPublished: true,
          isDeleted: false,
        });
        const organizationPlanAnnouncementId = await ctx.db.insert("dashboardAnnouncements", {
          organizationPlan: organizationPlanTargets,
          title: "契約プラン向けのお知らせ",
          bodyHtml: "<p>契約プラン向けです。</p>",
          displayDate: "2026-06-21",
          isPublished: true,
          isDeleted: false,
        });
        return {
          organizationId,
          shopId,
          organizationTargets,
          shopTargets,
          globalAnnouncementId,
          organizationAnnouncementId,
          shopAnnouncementId,
          combinedAnnouncementId,
          organizationPlanAnnouncementId,
        };
      });

      const result = await t
        .withIdentity({ subject: "announcement_user" })
        .query(api.dashboard.queries.getActiveDashboardAnnouncementsV2, {});

      expect(result).toEqual([
        {
          _id: ids.organizationPlanAnnouncementId,
          organizationPlan: "pro",
          title: "契約プラン向けのお知らせ",
          bodyHtml: "<p>契約プラン向けです。</p>",
          displayDate: "2026-06-21",
        },
        {
          _id: ids.combinedAnnouncementId,
          organizationId: ids.organizationTargets,
          shopId: ids.shopTargets,
          title: "事業者または店舗向けのお知らせ",
          bodyHtml: "<p>事業者または店舗向けです。</p>",
          displayDate: "2026-06-20",
        },
        {
          _id: ids.shopAnnouncementId,
          shopId: ids.shopId,
          title: "店舗向けのお知らせ",
          bodyHtml: "<p>店舗向けです。</p>",
          displayDate: "2026-06-19",
        },
        {
          _id: ids.organizationAnnouncementId,
          organizationId: ids.organizationTargets,
          title: "事業者向けのお知らせ",
          bodyHtml: "<p>事業者向けです。</p>",
          displayDate: "2026-06-18",
        },
        {
          _id: ids.globalAnnouncementId,
          title: "全体向けのお知らせ",
          bodyHtml: "<p>全体向けです。</p>",
          displayDate: "2026-06-17",
        },
      ]);
    });

    it("非公開と削除済みを除外し、公開中のお知らせを新しい順で返す", async () => {
      const t = convexTest(schema, modules);
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-06-17T09:00:00+09:00"));
        await t.run(async (ctx) => {
          await ctx.db.insert("dashboardAnnouncements", {
            title: "非公開のお知らせ",
            bodyHtml: "<p>表示しません。</p>",
            displayDate: "2026-06-19",
            isPublished: false,
            isDeleted: false,
          });
          await ctx.db.insert("dashboardAnnouncements", {
            title: "削除済みのお知らせ",
            bodyHtml: "<p>表示しません。</p>",
            displayDate: "2026-06-18",
            isPublished: true,
            isDeleted: true,
          });
          await ctx.db.insert("dashboardAnnouncements", {
            title: "前日のお知らせ",
            bodyHtml: "<p>古いお知らせです。</p>",
            displayDate: "2026-06-16",
            isPublished: true,
            isDeleted: false,
          });
          await ctx.db.insert("dashboardAnnouncements", {
            title: "同日の先に作ったお知らせ",
            bodyHtml: "<p>同日内では古いお知らせです。</p>",
            displayDate: "2026-06-17",
            isPublished: true,
            isDeleted: false,
          });
        });

        vi.setSystemTime(new Date("2026-06-17T09:00:01+09:00"));
        await t.run(async (ctx) => {
          await ctx.db.insert("dashboardAnnouncements", {
            title: "同日の後に作ったお知らせ",
            bodyHtml: "<p>同日内で最新のお知らせです。</p>",
            displayDate: "2026-06-17",
            isPublished: true,
            isDeleted: false,
          });
        });

        const result = await t
          .withIdentity({ subject: "announcement_user" })
          .query(api.dashboard.queries.getActiveDashboardAnnouncementsV2, {});

        expect(result.map((announcement) => announcement.title)).toEqual([
          "同日の後に作ったお知らせ",
          "同日の先に作ったお知らせ",
          "前日のお知らせ",
        ]);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("getDashboardRecruitments", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-20T00:00:00+09:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("未認証の場合、空ページを返す（ログアウト時の再実行でエラーにしない）", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => await seedShop(ctx, "対象店舗"));
      const result = await t.query(api.dashboard.queries.getDashboardRecruitments, await firstPageArgs(t, shopId));
      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(true);
    });

    it("認証済みだが店舗未登録の場合、空ページを返す", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => await seedShop(ctx, "未所属店舗"));
      const result = await t
        .withIdentity({ subject: "user_no_shop" })
        .query(api.dashboard.queries.getDashboardRecruitments, await firstPageArgs(t, shopId));
      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(true);
    });

    it("募集をページネーションで返す", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, { subject: "user_rec", email: "m@example.com", shopName: "店舗" });
        return seeded.shopId;
      });

      await t.run(async (ctx) => {
        await seedStaff(ctx, {
          shopId,
          name: "スタッフ1",
          email: "s1@example.com",
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
      });

      const result = await t
        .withIdentity({ subject: "user_rec" })
        .query(api.dashboard.queries.getDashboardRecruitments, await firstPageArgs(t, shopId));

      expect(result.page).toHaveLength(1);
      expect(result.page[0].status).toBe("open");
      expect(result.page[0].responseCount).toBe(0);
      expect(result.page[0].totalStaffCount).toBe(1);
    });

    it("論理削除された募集は除外する", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_rec_deleted",
          email: "deleted-rec@example.com",
          shopName: "店舗",
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-05-01",
          periodEnd: "2026-05-07",
          deadline: "2026-04-28",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: true,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return shopId;
      });

      const result = await t
        .withIdentity({ subject: "user_rec_deleted" })
        .query(api.dashboard.queries.getDashboardRecruitments, await firstPageArgs(t, shopId));

      expect(result.page).toHaveLength(1);
      expect(result.page[0].periodStart).toBe("2026-04-01");
      expect(Object.keys(result.page[0]).sort()).toEqual([
        "_id",
        "confirmedAt",
        "createdAt",
        "deadline",
        "periodEnd",
        "periodStart",
        "responseCount",
        "shopClosedDates",
        "status",
        "totalStaffCount",
      ]);
    });

    it("Dashboard向け候補を現在・要シフト調整・募集中・未来確定の順で返す", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-16T00:00:00+09:00"));
      try {
        const t = convexTest(schema, modules);
        const shopId = await t.run(async (ctx) => {
          const { shopId } = await seedManagerShop(ctx, {
            subject: "user_rec_dashboard_order",
            email: "dashboard-order@example.com",
            shopName: "店舗",
          });
          const base = {
            shopId,
            shopClosedDates: [],
            isDeleted: false,
            submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
          };
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-06-01",
            periodEnd: "2026-06-30",
            deadline: "2026-05-20",
            status: "confirmed",
            confirmedAt: Date.now(),
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-07-01",
            periodEnd: "2026-07-15",
            deadline: "2026-06-10",
            status: "open",
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-07-08",
            periodEnd: "2026-07-20",
            deadline: "2026-06-18",
            status: "open",
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-08-01",
            periodEnd: "2026-08-15",
            deadline: "2026-07-20",
            status: "confirmed",
            confirmedAt: Date.now(),
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-05-01",
            periodEnd: "2026-05-15",
            deadline: "2026-04-20",
            status: "confirmed",
            confirmedAt: Date.now(),
          });
          return shopId;
        });

        const result = await t
          .withIdentity({ subject: "user_rec_dashboard_order" })
          .query(api.dashboard.queries.getDashboardRecruitments, await firstPageArgs(t, shopId));

        expect(result.page.map((recruitment) => recruitment.periodStart)).toEqual([
          "2026-06-01",
          "2026-07-01",
          "2026-07-08",
          "2026-08-01",
        ]);
        expect(result.page[0].createdAt).toBeTypeOf("number");
        expect(result.page[1].confirmedAt).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("未確定シフトは終了日当日まで返し、翌日から初期取得ではなく過去取得で返す", async () => {
      vi.setSystemTime(new Date("2026-07-07T00:00:00+09:00"));
      const t = convexTest(schema, modules);
      const { recruitmentId, shopId } = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_open_ended",
          email: "open-ended@example.com",
          shopName: "店舗",
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-07-01",
          periodEnd: "2026-07-07",
          deadline: "2026-06-30",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return { recruitmentId, shopId };
      });
      const asManager = t.withIdentity({ subject: "user_open_ended" });

      const onPeriodEnd = await asManager.query(
        api.dashboard.queries.getDashboardRecruitments,
        await firstPageArgs(t, shopId),
      );
      expect(onPeriodEnd.page.map((recruitment) => recruitment._id)).toEqual([recruitmentId]);

      vi.setSystemTime(new Date("2026-07-08T00:00:00+09:00"));
      const nextDay = await asManager.query(
        api.dashboard.queries.getDashboardRecruitments,
        await firstPageArgs(t, shopId),
      );
      const past = await asManager.query(
        api.dashboard.queries.getDashboardPastRecruitments,
        await firstPageArgs(t, shopId),
      );

      expect(nextDay.page).toEqual([]);
      expect(past.page.map((recruitment) => recruitment._id)).toEqual([recruitmentId]);
    });

    it("終了済みの未確定シフトは提出期限が未来でも初期取得で返さない", async () => {
      vi.setSystemTime(new Date("2026-07-07T00:00:00+09:00"));
      const t = convexTest(schema, modules);
      const { recruitmentId, shopId } = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_ended_before_deadline",
          email: "ended-before-deadline@example.com",
          shopName: "店舗",
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-07-01",
          periodEnd: "2026-07-06",
          deadline: "2026-07-10",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return { recruitmentId, shopId };
      });
      const asManager = t.withIdentity({ subject: "user_ended_before_deadline" });

      const active = await asManager.query(
        api.dashboard.queries.getDashboardRecruitments,
        await firstPageArgs(t, shopId),
      );
      const past = await asManager.query(
        api.dashboard.queries.getDashboardPastRecruitments,
        await firstPageArgs(t, shopId),
      );

      expect(active.page).toEqual([]);
      expect(past.page.map((recruitment) => recruitment._id)).toEqual([recruitmentId]);
    });

    it("今日以降にかかる確定シフトを終了日が近い順に返し、過去と未確定は除外する", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-16T00:00:00+09:00"));
      try {
        const t = convexTest(schema, modules);
        const shopId = await t.run(async (ctx) => {
          const { shopId } = await seedManagerShop(ctx, {
            subject: "user_current_rec",
            email: "current-rec@example.com",
            shopName: "店舗",
          });
          const base = {
            shopId,
            deadline: "2026-06-01",
            shopClosedDates: [],
            status: "confirmed" as const,
            confirmedAt: Date.now(),
            isDeleted: false,
            submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
          };
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-06-01",
            periodEnd: "2026-06-30",
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-06-10",
            periodEnd: "2026-06-20",
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-07-01",
            periodEnd: "2026-07-31",
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-05-01",
            periodEnd: "2026-05-31",
          });
          await ctx.db.insert("recruitments", {
            shopId,
            periodStart: "2026-06-05",
            periodEnd: "2026-06-25",
            deadline: "2026-06-01",
            shopClosedDates: [],
            status: "open",
            isDeleted: false,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          });
          return shopId;
        });

        const result = await t
          .withIdentity({ subject: "user_current_rec" })
          .query(api.dashboard.queries.getDashboardCurrentRecruitments, {
            expectedOrganizationId: await getTestOrganizationId(t, shopId),
            shopId,
          });

        expect(result.map((recruitment) => recruitment.periodEnd)).toEqual(["2026-06-20", "2026-06-30", "2026-07-31"]);
        expect(result.every((recruitment) => recruitment.status === "confirmed")).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("recruitmentStats がない古い募集では responseCount は shiftSubmissions の件数を返す", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_rc",
          email: "rc@example.com",
          shopName: "RC店舗",
        });
        const staff1 = await seedStaff(ctx, {
          shopId,
          name: "Staff1",
          email: "s1@example.com",
        });
        const staff2 = await seedStaff(ctx, {
          shopId,
          name: "Staff2",
          email: "s2@example.com",
        });
        await seedStaff(ctx, {
          shopId,
          name: "Deleted Staff",
          email: "deleted@example.com",
          isDeleted: true,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const submission1 = await ctx.db.insert("shiftSubmissions", {
          firstSubmittedAt: Date.now(),
          recruitmentId,
          staffId: staff1,
          submittedAt: Date.now(),
        });
        await ctx.db.insert("shiftSubmissionSlots", {
          submissionId: submission1,
          recruitmentId,
          staffId: staff1,
          date: "2026-04-01",
          startTime: "09:00",
          endTime: "17:00",
        });
        await ctx.db.insert("shiftSubmissionSlots", {
          submissionId: submission1,
          recruitmentId,
          staffId: staff1,
          date: "2026-04-02",
          startTime: "09:00",
          endTime: "17:00",
        });
        const submission2 = await ctx.db.insert("shiftSubmissions", {
          firstSubmittedAt: Date.now(),
          recruitmentId,
          staffId: staff2,
          submittedAt: Date.now(),
        });
        await ctx.db.insert("shiftSubmissionSlots", {
          submissionId: submission2,
          recruitmentId,
          staffId: staff2,
          date: "2026-04-01",
          startTime: "10:00",
          endTime: "18:00",
        });
        return shopId;
      });

      const result = await t
        .withIdentity({ subject: "user_rc" })
        .query(api.dashboard.queries.getDashboardRecruitments, await firstPageArgs(t, shopId));
      expect(result.page[0].responseCount).toBe(2);
      expect(result.page[0].totalStaffCount).toBe(2);
    });

    it("recruitmentStats がある場合も totalStaffCount は現在の有効スタッフ数を返す", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_stats",
          email: "stats@example.com",
          shopName: "Stats店舗",
        });
        await seedStaff(ctx, {
          shopId,
          name: "Staff1",
          email: "s1@example.com",
        });
        await seedStaff(ctx, {
          shopId,
          name: "Staff2",
          email: "s2@example.com",
        });
        await seedStaff(ctx, {
          shopId,
          name: "Staff3",
          email: "s3@example.com",
        });
        await seedStaff(ctx, {
          shopId,
          name: "Deleted Staff",
          email: "deleted@example.com",
          isDeleted: true,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("recruitmentStats", {
          recruitmentId,
          shopId,
          submittedCount: 2,
          activeStaffCountSnapshot: 1,
          updatedAt: Date.now(),
        });
        return shopId;
      });

      const result = await t
        .withIdentity({ subject: "user_stats" })
        .query(api.dashboard.queries.getDashboardRecruitments, await firstPageArgs(t, shopId));
      expect(result.page[0].responseCount).toBe(2);
      expect(result.page[0].totalStaffCount).toBe(3);
    });
  });

  describe("hasDashboardPastRecruitments", () => {
    it("終了済みシフトが未確定でも true を返す", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-16T00:00:00+09:00"));
      try {
        const t = convexTest(schema, modules);
        const shopId = await t.run(async (ctx) => {
          const { shopId } = await seedManagerShop(ctx, {
            subject: "user_has_past",
            email: "has-past@example.com",
            shopName: "店舗",
          });
          const base = {
            shopId,
            deadline: "2026-04-20",
            shopClosedDates: [],
            isDeleted: false,
            submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
          };
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-07-01",
            periodEnd: "2026-07-15",
            status: "confirmed",
            confirmedAt: Date.now(),
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-05-01",
            periodEnd: "2026-05-15",
            status: "open",
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-04-01",
            periodEnd: "2026-04-15",
            status: "confirmed",
            confirmedAt: Date.now(),
            isDeleted: true,
          });
          return shopId;
        });

        const result = await t
          .withIdentity({ subject: "user_has_past" })
          .query(api.dashboard.queries.hasDashboardPastRecruitments, {
            expectedOrganizationId: await getTestOrganizationId(t, shopId),
            shopId,
          });

        expect(result).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("終了済みシフトがない場合は false を返す", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-16T00:00:00+09:00"));
      try {
        const t = convexTest(schema, modules);
        const shopId = await t.run(async (ctx) => {
          const { shopId } = await seedManagerShop(ctx, {
            subject: "user_no_past",
            email: "no-past@example.com",
            shopName: "店舗",
          });
          await ctx.db.insert("recruitments", {
            shopId,
            periodStart: "2026-07-01",
            periodEnd: "2026-07-15",
            deadline: "2026-06-20",
            shopClosedDates: [],
            status: "confirmed",
            confirmedAt: Date.now(),
            isDeleted: false,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          });
          return shopId;
        });

        const result = await t
          .withIdentity({ subject: "user_no_past" })
          .query(api.dashboard.queries.hasDashboardPastRecruitments, {
            expectedOrganizationId: await getTestOrganizationId(t, shopId),
            shopId,
          });

        expect(result).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("getDashboardPastRecruitments", () => {
    it("未確定と確定済みの過去シフトを終了日が新しい順にページング取得する", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-16T00:00:00+09:00"));
      try {
        const t = convexTest(schema, modules);
        const shopId = await t.run(async (ctx) => {
          const { shopId } = await seedManagerShop(ctx, {
            subject: "user_past_page",
            email: "past-page@example.com",
            shopName: "店舗",
          });
          const base = {
            shopId,
            deadline: "2026-04-20",
            shopClosedDates: [],
            isDeleted: false,
            submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
          };
          for (const [periodStart, periodEnd, status] of [
            ["2026-05-16", "2026-05-31", "open"],
            ["2026-05-01", "2026-05-15", "confirmed"],
            ["2026-04-16", "2026-04-30", "open"],
          ] as const) {
            await ctx.db.insert("recruitments", {
              ...base,
              periodStart,
              periodEnd,
              status,
              ...(status === "confirmed" ? { confirmedAt: Date.now() } : {}),
            });
          }
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-07-01",
            periodEnd: "2026-07-15",
            status: "confirmed",
            confirmedAt: Date.now(),
          });
          return shopId;
        });

        const firstPage = await t
          .withIdentity({ subject: "user_past_page" })
          .query(api.dashboard.queries.getDashboardPastRecruitments, {
            expectedOrganizationId: await getTestOrganizationId(t, shopId),
            shopId,
            paginationOpts: { numItems: 2, cursor: null },
          });
        const secondPage = await t
          .withIdentity({ subject: "user_past_page" })
          .query(api.dashboard.queries.getDashboardPastRecruitments, {
            expectedOrganizationId: await getTestOrganizationId(t, shopId),
            shopId,
            paginationOpts: { numItems: 2, cursor: firstPage.continueCursor },
          });

        expect(firstPage.page.map((recruitment) => recruitment.periodEnd)).toEqual(["2026-05-31", "2026-05-15"]);
        expect(firstPage.isDone).toBe(false);
        expect(secondPage.page.map((recruitment) => recruitment.periodEnd)).toEqual(["2026-04-30"]);
        expect(secondPage.isDone).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("getDashboardStaffs", () => {
    it("未認証の場合、空ページを返す（ログアウト時の再実行でエラーにしない）", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => await seedShop(ctx, "対象店舗"));
      const result = await t.query(api.dashboard.queries.getDashboardStaffs, await firstPageArgs(t, shopId));
      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(true);
    });

    it("認証済みだが店舗未登録の場合、空ページを返す", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => await seedShop(ctx, "未所属店舗"));
      const result = await t
        .withIdentity({ subject: "user_no_shop" })
        .query(api.dashboard.queries.getDashboardStaffs, await firstPageArgs(t, shopId));
      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(true);
    });

    it("スタッフをページネーションで返し、削除済みrowは除外する", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_staff",
          email: "m@example.com",
          shopName: "店舗",
        });
        await seedStaff(ctx, {
          shopId,
          name: "田中太郎",
          email: "tanaka@example.com",
        });
        await seedStaff(ctx, {
          shopId,
          name: "削除済みスタッフ",
          email: "deleted@example.com",
          isDeleted: true,
        });
        return shopId;
      });

      const result = await t
        .withIdentity({ subject: "user_staff" })
        .query(api.dashboard.queries.getDashboardStaffs, await firstPageArgs(t, shopId));

      expect(result.page.map((staff) => staff.name)).toEqual(["田中太郎"]);
    });

    it("参照先の事業者人物が存在しないスタッフは一覧全体を返さない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "dashboard_dangling_staff_person",
          plan: "pro",
        });
        const staffId = await seedStaff(ctx, {
          shopId: base.shopId,
          name: "参照先不在スタッフ",
          email: "dangling@example.com",
        });
        const staff = await ctx.db.get(staffId);
        if (!staff?.organizationPersonId) throw new Error("canonical staff was not created");
        await ctx.db.delete("organizationPeople", staff.organizationPersonId);
        return base.shopId;
      });

      await expect(
        t
          .withIdentity({ subject: "dashboard_dangling_staff_person" })
          .query(api.dashboard.queries.getDashboardStaffs, await firstPageArgs(t, shopId)),
      ).rejects.toThrowError("Not found");
    });

    it("有効スタッフが削除済みの事業者人物へ紐づく場合は一覧全体を返さない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "dashboard_removed_staff_person",
          plan: "pro",
        });
        const staffId = await seedStaff(ctx, {
          shopId: base.shopId,
          name: "削除済み人物スタッフ",
          email: "removed-person@example.com",
        });
        const staff = await ctx.db.get(staffId);
        if (!staff?.organizationPersonId) throw new Error("canonical staff was not created");
        await ctx.db.patch("organizationPeople", staff.organizationPersonId, {
          status: "removed",
          updatedAt: Date.now(),
        });
        return base.shopId;
      });

      await expect(
        t
          .withIdentity({ subject: "dashboard_removed_staff_person" })
          .query(api.dashboard.queries.getDashboardStaffs, await firstPageArgs(t, shopId)),
      ).rejects.toThrowError("Not found");
    });

    it("別事業者の人物へ紐づくスタッフは一覧全体を返さない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "dashboard_mismatched_staff_person",
          plan: "pro",
        });
        const other = await seedOrganizationManagerShop(ctx, {
          subject: "dashboard_mismatched_staff_person_other",
          plan: "pro",
        });
        const staffId = await seedStaff(ctx, {
          shopId: base.shopId,
          name: "別事業者人物スタッフ",
          email: "mismatched@example.com",
        });
        await ctx.db.patch("staffs", staffId, { organizationPersonId: other.personId });
        return base.shopId;
      });

      await expect(
        t
          .withIdentity({ subject: "dashboard_mismatched_staff_person" })
          .query(api.dashboard.queries.getDashboardStaffs, await firstPageArgs(t, shopId)),
      ).rejects.toThrowError("Not found");
    });

    it("対象人物の管理者所属を返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "dashboard_manager_state_owner",
          plan: "pro",
        });
        const now = Date.now();
        const targetUserId = await seedUser(ctx, "dashboard_manager_state_target", "target-before@example.com");
        const targetPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          userId: targetUserId,
          name: "招待対象スタッフ",
          email: "target-before@example.com",
          emailNormalized: "target-before@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        const targetStaffId = await ctx.db.insert("staffs", {
          excludedFromShift: false,
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: targetPersonId,
          userId: targetUserId,
          name: "招待対象スタッフ",
          email: "target-before@example.com",
          emailNormalized: "target-before@example.com",
          isDeleted: false,
        });
        const otherManagerUserId = await seedUser(ctx, "dashboard_other_manager", "other-manager@example.com");
        const otherManagerPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          userId: otherManagerUserId,
          name: "別の管理者",
          email: "other-manager@example.com",
          emailNormalized: "other-manager@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationMembers", {
          organizationId: base.organizationId,
          personId: otherManagerPersonId,
          userId: otherManagerUserId,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          excludedFromShift: false,
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: otherManagerPersonId,
          userId: otherManagerUserId,
          name: "別の管理者",
          email: "other-manager@example.com",
          emailNormalized: "other-manager@example.com",
          isDeleted: false,
        });
        return { ...base, targetPersonId, targetStaffId, otherManagerPersonId };
      });
      const owner = t.withIdentity({ subject: "dashboard_manager_state_owner" });

      const before = await owner.query(api.dashboard.queries.getDashboardStaffs, await firstPageArgs(t, ids.shopId));
      expect(before.page.find((staff) => staff.name === "別の管理者")).toMatchObject({
        isManager: true,
      });
      expect(before.page.find((staff) => staff._id === ids.targetStaffId)).toMatchObject({
        isManager: false,
      });
    });

    it("返り値に不要なフィールドが含まれない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_sf",
          email: "m@example.com",
          shopName: "店舗",
        });
        await seedStaff(ctx, {
          shopId,
          name: "スタッフ",
          email: "staff@example.com",
        });
        return shopId;
      });

      const result = await t
        .withIdentity({ subject: "user_sf" })
        .query(api.dashboard.queries.getDashboardStaffs, await firstPageArgs(t, shopId));
      expect(Object.keys(result.page[0]).sort()).toEqual([
        "_id",
        "email",
        "excludedFromShift",
        "isLineFollowing",
        "isLineLinked",
        "isManager",
        "name",
        "organizationPersonId",
      ]);
    });
  });

  describe("getCurrentUser", () => {
    it("未認証の場合 null を返す", async () => {
      const t = convexTest(schema, modules);
      const result = await t.query(api.dashboard.queries.getCurrentUser, {});
      expect(result).toBeNull();
    });

    it("新規ユーザーは isNewUser: true を返す", async () => {
      const t = convexTest(schema, modules);
      const result = await t
        .withIdentity({ subject: "new_user", name: "New User", email: "new@example.com" })
        .query(api.dashboard.queries.getCurrentUser, {});
      expect(result).toEqual({
        isNewUser: true,
        name: "New User",
        email: "new@example.com",
      });
    });

    it("既存ユーザーは isNewUser: false を返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          authTokenIdentifier: testAuthTokenIdentifier("existing_user"),
          name: "既存ユーザー",
          email: "existing@example.com",
          emailNormalized: "existing@example.com",
          role: "manager",
          isDeleted: false,
        });
      });
      const result = await t.withIdentity({ subject: "existing_user" }).query(api.dashboard.queries.getCurrentUser, {});
      expect(result).toEqual({
        isNewUser: false,
        name: "既存ユーザー",
        email: "existing@example.com",
      });
    });

    it("削除済みユーザーはClerkの氏名とメールを返さず、終了状態だけを返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          authTokenIdentifier: testAuthTokenIdentifier("deleted_user"),
          name: "退会前ユーザー",
          email: "deleted-before@example.com",
          emailNormalized: "deleted-before@example.com",
          role: "manager",
          isDeleted: true,
        });
      });

      const result = await t
        .withIdentity({ subject: "deleted_user", name: "Clerkに残る氏名", email: "clerk-remains@example.com" })
        .query(api.dashboard.queries.getCurrentUser, {});

      expect(result).toEqual({ accountDeleted: true, accountDeletionRequested: false });
      expect(result).not.toHaveProperty("name");
      expect(result).not.toHaveProperty("email");
    });

    it("アカウント削除受付済みユーザーはPIIや受付時刻を返さず、受付済み状態だけを返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          authTokenIdentifier: testAuthTokenIdentifier("account_deletion_requested_user"),
          name: "受付前の氏名",
          email: "requested-before@example.com",
          emailNormalized: "requested-before@example.com",
          role: "manager",
          isDeleted: false,
          accountDeletionRequestedAt: Date.now(),
        });
      });

      const result = await t
        .withIdentity({
          subject: "account_deletion_requested_user",
          name: "Clerkに残る氏名",
          email: "clerk-remains@example.com",
        })
        .query(api.dashboard.queries.getCurrentUser, {});

      expect(result).toEqual({ accountDeleted: true, accountDeletionRequested: true });
      expect(result).not.toHaveProperty("name");
      expect(result).not.toHaveProperty("email");
      expect(result).not.toHaveProperty("accountDeletionRequestedAt");
    });
  });
});
