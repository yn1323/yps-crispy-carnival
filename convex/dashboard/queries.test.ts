import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  seedManagerShop,
  seedOrganizationManagerShop,
  seedShop,
  seedShopMembership,
  seedUser,
  testAuthTokenIdentifier,
} from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const PAGINATION_FIRST_PAGE = { paginationOpts: { numItems: 10, cursor: null } };
const firstPageArgs = (shopId: Id<"shops">) => ({ ...PAGINATION_FIRST_PAGE, shopId });

describe("dashboard/queries", () => {
  describe("getDashboardShop", () => {
    it("未認証の場合 null を返す", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => await seedShop(ctx, "対象店舗"));
      const result = await t.query(api.dashboard.queries.getDashboardShop, { shopId });
      expect(result).toBeNull();
    });

    it("認証済みだが店舗未登録の場合 null を返す", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => await seedShop(ctx, "未所属店舗"));
      const result = await t
        .withIdentity({ subject: "user_123" })
        .query(api.dashboard.queries.getDashboardShop, { shopId });
      expect(result).toBeNull();
    });

    it("店舗登録済みの場合、店舗情報を返す", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(
        async (ctx) => await seedManagerShop(ctx, { subject: "user_123", shopName: "テスト店舗" }),
      );

      const result = await t
        .withIdentity({ subject: "user_123" })
        .query(api.dashboard.queries.getDashboardShop, { shopId });
      expect(result).toEqual({
        name: "テスト店舗",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        canWriteBusinessData: true,
        businessWriteBlockReason: null,
      });
    });

    it("同一managerの複数店舗は明示shopIdに応じて返し分ける", async () => {
      const t = convexTest(schema, modules);
      const { firstShopId, secondShopId } = await t.run(async (ctx) => {
        const userId = await seedUser(ctx, "multi_shop_dashboard_user");
        const firstShopId = await seedShop(ctx, "有効店舗A");
        const secondShopId = await seedShop(ctx, "有効店舗B");
        await seedShopMembership(ctx, { userId, shopId: firstShopId });
        await seedShopMembership(ctx, { userId, shopId: secondShopId });
        return { firstShopId, secondShopId };
      });
      const asManager = t.withIdentity({ subject: "multi_shop_dashboard_user" });

      const firstShop = await asManager.query(api.dashboard.queries.getDashboardShop, { shopId: firstShopId });
      const secondShop = await asManager.query(api.dashboard.queries.getDashboardShop, { shopId: secondShopId });

      expect(firstShop?.name).toBe("有効店舗A");
      expect(secondShop?.name).toBe("有効店舗B");
    });

    it("shopId省略時は旧クライアント互換で先頭の有効所属店舗を返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const userId = await seedUser(ctx, "legacy_multi_shop_dashboard_user");

        const deletedShopId = await seedShop(ctx, "削除済み店舗");
        await ctx.db.patch(deletedShopId, { isDeleted: true });
        await seedShopMembership(ctx, { userId, shopId: deletedShopId });

        const firstActiveShopId = await seedShop(ctx, "先頭の有効店舗");
        const secondActiveShopId = await seedShop(ctx, "2件目の有効店舗");
        await seedShopMembership(ctx, { userId, shopId: firstActiveShopId });
        await seedShopMembership(ctx, { userId, shopId: secondActiveShopId });
      });

      const result = await t
        .withIdentity({ subject: "legacy_multi_shop_dashboard_user" })
        .query(api.dashboard.queries.getDashboardShop, {});

      expect(result?.name).toBe("先頭の有効店舗");
    });

    it("論理削除された店舗は null を返す", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(
        async (ctx) =>
          await seedManagerShop(ctx, { subject: "user_deleted", shopName: "削除済み店舗", shopDeleted: true }),
      );

      const result = await t
        .withIdentity({ subject: "user_deleted" })
        .query(api.dashboard.queries.getDashboardShop, { shopId });
      expect(result).toBeNull();
    });

    it("指定した店舗が削除済みの場合、別の有効店舗へフォールバックしない", async () => {
      const t = convexTest(schema, modules);
      const deletedShopId = await t.run(async (ctx) => {
        const userId = await seedUser(ctx, "user_deleted_first");
        const deletedShopId = await seedShop(ctx, "削除済み店舗");
        await ctx.db.patch(deletedShopId, { isDeleted: true });
        await seedShopMembership(ctx, { userId, shopId: deletedShopId });

        const activeShopId = await seedShop(ctx, "残っている店舗");
        await seedShopMembership(ctx, { userId, shopId: activeShopId });
        return deletedShopId;
      });

      const result = await t
        .withIdentity({ subject: "user_deleted_first" })
        .query(api.dashboard.queries.getDashboardShop, { shopId: deletedShopId });

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
        .query(api.dashboard.queries.getDashboardShop, { shopId });
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
        t.withIdentity({ subject: "deleted_dashboard_user" }).query(api.dashboard.queries.getDashboardShop, { shopId }),
      ).resolves.toBeNull();
    });

    it("返り値に不要なフィールドが含まれない", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(
        async (ctx) => await seedManagerShop(ctx, { subject: "user_fields", shopName: "店舗" }),
      );

      const result = await t
        .withIdentity({ subject: "user_fields" })
        .query(api.dashboard.queries.getDashboardShop, { shopId });
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
        .query(api.dashboard.queries.getDashboardShop, { shopId });

      expect(result).toMatchObject({ canWriteBusinessData: true, businessWriteBlockReason: null });
    });

    it.each([
      {
        state: {
          kind: "restricted" as const,
          reason: "paymentGraceExpired" as const,
          previousPlan: "pro" as const,
          recoveryManagerPersonIds: [] as Id<"organizationPeople">[],
          previousActiveShopIds: [] as Id<"shops">[],
          restrictedAt: 1,
        },
        reason: "restricted" as const,
      },
    ])("$state.kindではDashboard業務操作を閲覧専用にする", async ({ state, reason }) => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, { subject: `dashboard_${state.kind}`, plan: "pro" });
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
          .unique();
        if (!billingState) throw new Error("billing state not found");
        const nextState =
          state.kind === "restricted" ? { ...state, recoveryManagerPersonIds: [seeded.personId] } : state;
        await ctx.db.patch(billingState._id, { state: nextState });
        return seeded;
      });

      const result = await t
        .withIdentity({ subject: `dashboard_${state.kind}` })
        .query(api.dashboard.queries.getDashboardShop, { shopId });

      expect(result).toMatchObject({ canWriteBusinessData: false, businessWriteBlockReason: reason });
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

    it("本人の有効な所属店舗だけを最小DTOで返す", async () => {
      const t = convexTest(schema, modules);
      const { activeShopIds } = await t.run(async (ctx) => {
        const userId = await seedUser(ctx, "multi_shop_user");
        const firstShopId = await seedShop(ctx, "有効店舗A");
        const secondShopId = await seedShop(ctx, "有効店舗B");
        await seedShopMembership(ctx, { userId, shopId: firstShopId });
        await seedShopMembership(ctx, { userId, shopId: secondShopId });

        const deletedShopId = await seedShop(ctx, "削除済み店舗");
        await ctx.db.patch(deletedShopId, { isDeleted: true });
        await seedShopMembership(ctx, { userId, shopId: deletedShopId });

        const deletedMembershipShopId = await seedShop(ctx, "所属解除済み店舗");
        await seedShopMembership(ctx, {
          userId,
          shopId: deletedMembershipShopId,
          isDeleted: true,
        });

        const otherUserId = await seedUser(ctx, "other_shop_user");
        const otherShopId = await seedShop(ctx, "他ユーザーの店舗");
        await seedShopMembership(ctx, { userId: otherUserId, shopId: otherShopId });

        return { activeShopIds: [firstShopId, secondShopId] };
      });

      const result = await t.withIdentity({ subject: "multi_shop_user" }).query(api.dashboard.queries.getMyShops, {});

      expect([...result].sort((a, b) => a.shopName.localeCompare(b.shopName, "ja"))).toEqual([
        {
          shopId: activeShopIds[0],
          shopName: "有効店舗A",
          shopStatus: "active",
          organizationId: null,
          organizationName: null,
          organizationPlan: null,
          memberStatus: "active",
        },
        {
          shopId: activeShopIds[1],
          shopName: "有効店舗B",
          shopStatus: "active",
          organizationId: null,
          organizationName: null,
          organizationPlan: null,
          memberStatus: "active",
        },
      ]);
      expect(Object.keys(result[0] ?? {}).sort()).toEqual([
        "memberStatus",
        "organizationId",
        "organizationName",
        "organizationPlan",
        "shopId",
        "shopName",
        "shopStatus",
      ]);
    });

    it("旧shopMembersが同じ店舗で重複する場合は店舗切替候補にも表示しない", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const { shopId, userId } = await seedManagerShop(ctx, {
          subject: "duplicate_legacy_shop_memberships_in_switcher",
          shopName: "重複旧所属店舗",
        });
        await seedShopMembership(ctx, { userId, shopId });
      });

      const result = await t
        .withIdentity({ subject: "duplicate_legacy_shop_memberships_in_switcher" })
        .query(api.dashboard.queries.getMyShops, {});

      expect(result).toEqual([]);
    });

    it.each([
      "active",
      "readOnly",
    ] as const)("事業者の%s管理者には同じ事業者の全非削除店舗だけを返す", async (memberStatus) => {
      const t = convexTest(schema, modules);
      const subject = `organization_shop_list_${memberStatus}`;
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject,
          shopName: "事業者店舗A",
          plan: "pro",
        });
        await ctx.db.patch(base.memberId, { status: memberStatus });
        const archivedShopId = await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          operatingStatus: "archived",
          name: "事業者店舗B",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        const deletedShopId = await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          operatingStatus: "active",
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
        return { ...base, archivedShopId, deletedShopId, otherShopId: other.shopId };
      });

      const result = await t.withIdentity({ subject }).query(api.dashboard.queries.getMyShops, {});

      expect(result).toEqual([
        {
          shopId: ids.shopId,
          shopName: "事業者店舗A",
          shopStatus: "active",
          organizationId: ids.organizationId,
          organizationName: "事業者店舗A事業者",
          organizationPlan: "pro",
          memberStatus,
        },
        {
          shopId: ids.archivedShopId,
          shopName: "事業者店舗B",
          shopStatus: "archived",
          organizationId: ids.organizationId,
          organizationName: "事業者店舗A事業者",
          organizationPlan: "pro",
          memberStatus,
        },
      ]);
      expect(result.some((shop) => shop.shopId === ids.deletedShopId)).toBe(false);
      expect(result.some((shop) => shop.shopId === ids.otherShopId)).toBe(false);
    });

    it("複数グループに所属する利用者には各グループの非削除店舗だけを所属状態付きで返す", async () => {
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
          operatingStatus: "active",
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
          status: "readOnly",
          createdAt: now,
          updatedAt: now,
        });
        const organizationBShopId = await ctx.db.insert("shops", {
          organizationId: organizationBId,
          operatingStatus: "archived",
          name: "組織B店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        await ctx.db.insert("shops", {
          organizationId: organizationBId,
          operatingStatus: "active",
          name: "組織B削除済み店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: true,
        });
        await ctx.db.insert("organizationBillingStates", {
          organizationId: organizationBId,
          state: { kind: "active", plan: "business" },
          version: 1,
          createdAt: now,
          updatedAt: now,
        });

        await seedOrganizationManagerShop(ctx, {
          subject: "multi_organization_other_user",
          shopName: "非所属組織C店舗",
          plan: "business",
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
            shopStatus: shop.shopStatus,
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
          shopStatus: "active",
        },
        {
          organizationId: ids.organizationBId,
          organizationName: "組織B",
          organizationPlan: "business",
          memberStatus: "readOnly",
          shopId: ids.organizationBShopId,
          shopName: "組織B店舗",
          shopStatus: "archived",
        },
      ]);
    });

    it.each([
      {
        label: "有効なBusiness",
        seedPlan: "business" as const,
        state: { kind: "active", plan: "business" } as const,
        expectedPlan: "business" as const,
      },
      {
        label: "BusinessからProへの変更予約中",
        seedPlan: "business" as const,
        state: {
          kind: "scheduledChange",
          currentPlan: "business",
          targetPlan: "pro",
          effectiveAt: Date.now() + 60_000,
        } as const,
        expectedPlan: "business" as const,
      },
      {
        label: "FreeからProへの支払い結果待ち",
        seedPlan: "free" as const,
        state: { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: Date.now() } as const,
        expectedPlan: "free" as const,
      },
      {
        label: "契約制限中",
        seedPlan: "business" as const,
        state: {
          kind: "restricted",
          reason: "paymentGraceExpired",
          previousPlan: "business",
          recoveryManagerPersonIds: [] as Id<"organizationPeople">[],
          previousActiveShopIds: [] as Id<"shops">[],
          restrictedAt: Date.now(),
        } as const,
        expectedPlan: null,
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

    it("単一値とカンマ区切りの対象指定を必要なフィールドだけ返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const now = Date.now();
        const organizationId = await ctx.db.insert("organizations", {
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
        const organizationPlanTargets = "pro, business";
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
          organizationPlanTargets,
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
          organizationPlan: ids.organizationPlanTargets,
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
      const result = await t.query(api.dashboard.queries.getDashboardRecruitments, firstPageArgs(shopId));
      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(true);
    });

    it("認証済みだが店舗未登録の場合、空ページを返す", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => await seedShop(ctx, "未所属店舗"));
      const result = await t
        .withIdentity({ subject: "user_no_shop" })
        .query(api.dashboard.queries.getDashboardRecruitments, firstPageArgs(shopId));
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
        await ctx.db.insert("staffs", {
          shopId,
          name: "スタッフ1",
          email: "s1@example.com",
          isDeleted: false,
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
        .query(api.dashboard.queries.getDashboardRecruitments, firstPageArgs(shopId));

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
        .query(api.dashboard.queries.getDashboardRecruitments, firstPageArgs(shopId));

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
          .query(api.dashboard.queries.getDashboardRecruitments, firstPageArgs(shopId));

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

      const onPeriodEnd = await asManager.query(api.dashboard.queries.getDashboardRecruitments, firstPageArgs(shopId));
      expect(onPeriodEnd.page.map((recruitment) => recruitment._id)).toEqual([recruitmentId]);

      vi.setSystemTime(new Date("2026-07-08T00:00:00+09:00"));
      const nextDay = await asManager.query(api.dashboard.queries.getDashboardRecruitments, firstPageArgs(shopId));
      const past = await asManager.query(api.dashboard.queries.getDashboardPastRecruitments, firstPageArgs(shopId));

      expect(nextDay.page).toEqual([]);
      expect(past.page.map((recruitment) => recruitment._id)).toEqual([recruitmentId]);
    });

    it("終了済みの未確定シフトは締切日が未来でも初期取得で返さない", async () => {
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

      const active = await asManager.query(api.dashboard.queries.getDashboardRecruitments, firstPageArgs(shopId));
      const past = await asManager.query(api.dashboard.queries.getDashboardPastRecruitments, firstPageArgs(shopId));

      expect(active.page).toEqual([]);
      expect(past.page.map((recruitment) => recruitment._id)).toEqual([recruitmentId]);
    });

    it("現在のシフトだけを終了日が近い順に返す", async () => {
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
          .query(api.dashboard.queries.getDashboardCurrentRecruitments, { shopId });

        expect(result.map((recruitment) => recruitment.periodEnd)).toEqual(["2026-06-20", "2026-06-30"]);
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
        const staff1 = await ctx.db.insert("staffs", {
          shopId,
          name: "Staff1",
          email: "s1@example.com",
          isDeleted: false,
        });
        const staff2 = await ctx.db.insert("staffs", {
          shopId,
          name: "Staff2",
          email: "s2@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
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
        .query(api.dashboard.queries.getDashboardRecruitments, firstPageArgs(shopId));
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
        await ctx.db.insert("staffs", {
          shopId,
          name: "Staff1",
          email: "s1@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "Staff2",
          email: "s2@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "Staff3",
          email: "s3@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
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
        .query(api.dashboard.queries.getDashboardRecruitments, firstPageArgs(shopId));
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
          .query(api.dashboard.queries.hasDashboardPastRecruitments, { shopId });

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
          .query(api.dashboard.queries.hasDashboardPastRecruitments, { shopId });

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
            shopId,
            paginationOpts: { numItems: 2, cursor: null },
          });
        const secondPage = await t
          .withIdentity({ subject: "user_past_page" })
          .query(api.dashboard.queries.getDashboardPastRecruitments, {
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
      const result = await t.query(api.dashboard.queries.getDashboardStaffs, firstPageArgs(shopId));
      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(true);
    });

    it("認証済みだが店舗未登録の場合、空ページを返す", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => await seedShop(ctx, "未所属店舗"));
      const result = await t
        .withIdentity({ subject: "user_no_shop" })
        .query(api.dashboard.queries.getDashboardStaffs, firstPageArgs(shopId));
      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(true);
    });

    it("スタッフをページネーションで返し、削除済みは除外される", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_staff",
          email: "m@example.com",
          shopName: "店舗",
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "田中太郎",
          email: "tanaka@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "削除済みスタッフ",
          email: "deleted@example.com",
          isDeleted: true,
        });
        return shopId;
      });

      const result = await t
        .withIdentity({ subject: "user_staff" })
        .query(api.dashboard.queries.getDashboardStaffs, firstPageArgs(shopId));

      expect(result.page).toHaveLength(1);
      expect(result.page[0].name).toBe("田中太郎");
    });

    it("事業者人物へ紐づくスタッフを安全な店舗所属削除経路として識別する", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "organization_linked_staff_query",
          plan: "pro",
        });
        const now = Date.now();
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "移行済みスタッフ",
          email: "linked@example.com",
          emailNormalized: "linked@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: personId,
          name: "移行済みスタッフ",
          email: "linked@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId: base.shopId,
          name: "移行前スタッフ",
          email: "legacy@example.com",
          isDeleted: false,
        });
        return base.shopId;
      });

      const result = await t
        .withIdentity({ subject: "organization_linked_staff_query" })
        .query(api.dashboard.queries.getDashboardStaffs, firstPageArgs(shopId));

      expect(result.page.find((staff) => staff.name === "移行済みスタッフ")?.isOrganizationLinked).toBe(true);
      expect(result.page.find((staff) => staff.name === "移行前スタッフ")?.isOrganizationLinked).toBe(false);
    });

    it("対象人物の管理者所属と招待状態を返し、メール変更後の招待し直しを案内する", async () => {
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

      const before = await owner.query(api.dashboard.queries.getDashboardStaffs, firstPageArgs(ids.shopId));
      expect(before.page.find((staff) => staff.name === "別の管理者")).toMatchObject({
        isManager: true,
        managerInvitationState: { kind: "unavailable", reason: "このスタッフはすでに管理者です。" },
      });
      expect(before.page.find((staff) => staff._id === ids.targetStaffId)).toMatchObject({
        isManager: false,
        managerInvitationState: {
          kind: "available",
          mode: "addition",
          replacesStaleInvitation: false,
        },
      });

      const invitationId = await t.run(async (ctx) => {
        const now = Date.now();
        return await ctx.db.insert("organizationInvitations", {
          organizationId: ids.organizationId,
          email: "target-before@example.com",
          emailNormalized: "target-before@example.com",
          tokenDigest: "dashboard-target-pending",
          status: "pending",
          purpose: "managerAddition",
          inviterMemberId: ids.memberId,
          targetPersonId: ids.targetPersonId,
          reservedSeat: false,
          version: 1,
          expiresAt: now + 86_400_000,
          createdAt: now,
          updatedAt: now,
        });
      });
      const pending = await owner.query(api.dashboard.queries.getDashboardStaffs, firstPageArgs(ids.shopId));
      expect(pending.page.find((staff) => staff._id === ids.targetStaffId)?.managerInvitationState).toEqual({
        kind: "pending",
        mode: "addition",
      });

      await t.run(async (ctx) => {
        const now = Date.now();
        await ctx.db.patch(ids.targetPersonId, {
          email: "target-after@example.com",
          emailNormalized: "target-after@example.com",
          updatedAt: now,
        });
        await ctx.db.patch(ids.targetStaffId, {
          email: "target-after@example.com",
          emailNormalized: "target-after@example.com",
        });
      });
      const stale = await owner.query(api.dashboard.queries.getDashboardStaffs, firstPageArgs(ids.shopId));
      expect(stale.page.find((staff) => staff._id === ids.targetStaffId)?.managerInvitationState).toEqual({
        kind: "available",
        mode: "addition",
        replacesStaleInvitation: true,
      });

      const currentEmailLegacyInvitationId = await t.run(async (ctx) => {
        const now = Date.now();
        return await ctx.db.insert("organizationInvitations", {
          organizationId: ids.organizationId,
          email: "target-after@example.com",
          emailNormalized: "target-after@example.com",
          tokenDigest: "dashboard-current-email-legacy-pending",
          status: "pending",
          purpose: "managerAddition",
          inviterMemberId: ids.memberId,
          reservedSeat: false,
          version: 1,
          expiresAt: now + 86_400_000,
          createdAt: now,
          updatedAt: now,
        });
      });
      const conflicted = await owner.query(api.dashboard.queries.getDashboardStaffs, firstPageArgs(ids.shopId));
      expect(conflicted.page.find((staff) => staff._id === ids.targetStaffId)?.managerInvitationState).toEqual({
        kind: "unavailable",
        reason: "このスタッフへの招待状態を確認できません。グループ設定を確認してください。",
      });

      await t.run(async (ctx) => {
        const now = Date.now();
        await ctx.db.patch(invitationId, {
          status: "revoked",
          revokedAt: now,
          version: 2,
          updatedAt: now,
        });
        await ctx.db.patch(currentEmailLegacyInvitationId, {
          status: "revoked",
          revokedAt: now,
          version: 2,
          updatedAt: now,
        });
        await ctx.db.insert("organizationInvitations", {
          organizationId: ids.organizationId,
          email: "target-after@example.com",
          emailNormalized: "target-after@example.com",
          tokenDigest: "dashboard-current-email-other-target-pending",
          status: "pending",
          purpose: "managerAddition",
          inviterMemberId: ids.memberId,
          targetPersonId: ids.otherManagerPersonId,
          reservedSeat: false,
          version: 1,
          expiresAt: now + 86_400_000,
          createdAt: now,
          updatedAt: now,
        });
      });
      const wrongTarget = await owner.query(api.dashboard.queries.getDashboardStaffs, firstPageArgs(ids.shopId));
      expect(wrongTarget.page.find((staff) => staff._id === ids.targetStaffId)?.managerInvitationState).toEqual({
        kind: "unavailable",
        reason: "このスタッフへの招待状態を確認できません。グループ設定を確認してください。",
      });
      expect(await t.run((ctx) => ctx.db.get(invitationId))).toMatchObject({ status: "revoked" });
    });

    it("返り値に不要なフィールドが含まれない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_sf",
          email: "m@example.com",
          shopName: "店舗",
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "スタッフ",
          email: "staff@example.com",
          isDeleted: false,
        });
        return shopId;
      });

      const result = await t
        .withIdentity({ subject: "user_sf" })
        .query(api.dashboard.queries.getDashboardStaffs, firstPageArgs(shopId));
      expect(Object.keys(result.page[0]).sort()).toEqual([
        "_id",
        "email",
        "excludedFromShift",
        "isLineFollowing",
        "isLineLinked",
        "isManager",
        "isOrganizationLinked",
        "managerInvitationState",
        "name",
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
      expect(result).toEqual({ isNewUser: true, name: "New User", email: "new@example.com" });
    });

    it("既存ユーザーは isNewUser: false を返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          authTokenIdentifier: testAuthTokenIdentifier("existing_user"),
          name: "既存ユーザー",
          email: "existing@example.com",
          role: "manager",
          isDeleted: false,
        });
      });
      const result = await t.withIdentity({ subject: "existing_user" }).query(api.dashboard.queries.getCurrentUser, {});
      expect(result).toEqual({ isNewUser: false, name: "既存ユーザー", email: "existing@example.com" });
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
