import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { getShopActivationReminderAt } from "../_lib/dateFormat";
import {
  seedManagerShop,
  seedOrganizationManagerShop,
  seedShop,
  seedShopMembership,
  seedUser,
  testAuthTokenIdentifier,
} from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { PERSON_NAME_MAX_LENGTH, SHOP_NAME_MAX_LENGTH } from "../constants";

const setupArgs = {
  shopName: "テスト店舗",
  submissionPattern: { kind: "dateOnly" as const },
  managerName: "山田 太郎",
  managerEmail: "yamada@example.com",
  acceptedLegal: true as const,
};

describe("setup/mutations", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe("setupShopAndManager", () => {
    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await expect(t.mutation(api.setup.mutations.setupShopAndManager, setupArgs)).rejects.toThrow();
    });

    it("削除済みユーザーは拒否し、事業者・店舗・所属を作成しない", async () => {
      const t = convexTest(schema, modules);
      const userId = await t.run(async (ctx) => {
        const id = await seedUser(ctx, "deleted_setup_user", "deleted-setup@example.com");
        await ctx.db.patch(id, { isDeleted: true });
        return id;
      });

      await expect(
        t.withIdentity({ subject: "deleted_setup_user" }).mutation(api.setup.mutations.setupShopAndManager, setupArgs),
      ).rejects.toThrow("無効になったアカウントでは初期設定を開始できません");

      const state = await t.run(async (ctx) => ({
        user: await ctx.db.get(userId),
        organizations: await ctx.db.query("organizations").collect(),
        people: await ctx.db.query("organizationPeople").collect(),
        members: await ctx.db.query("organizationMembers").collect(),
        shops: await ctx.db.query("shops").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.user).toMatchObject({ isDeleted: true, email: "deleted-setup@example.com" });
      expect(state.organizations).toEqual([]);
      expect(state.people).toEqual([]);
      expect(state.members).toEqual([]);
      expect(state.shops).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("アカウント削除受付済みユーザーは拒否し、事業者・店舗・所属を作成しない", async () => {
      const t = convexTest(schema, modules);
      const userId = await t.run(async (ctx) => {
        const id = await seedUser(ctx, "requested_setup_user", "requested-setup@example.com");
        await ctx.db.patch(id, { accountDeletionRequestedAt: Date.now() });
        return id;
      });

      await expect(
        t
          .withIdentity({ subject: "requested_setup_user" })
          .mutation(api.setup.mutations.setupShopAndManager, setupArgs),
      ).rejects.toThrow("無効になったアカウントでは初期設定を開始できません");

      const state = await t.run(async (ctx) => ({
        user: await ctx.db.get(userId),
        organizations: await ctx.db.query("organizations").collect(),
        people: await ctx.db.query("organizationPeople").collect(),
        members: await ctx.db.query("organizationMembers").collect(),
        shops: await ctx.db.query("shops").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.user).toMatchObject({
        isDeleted: false,
        accountDeletionRequestedAt: expect.any(Number),
        email: "requested-setup@example.com",
      });
      expect(state.organizations).toEqual([]);
      expect(state.people).toEqual([]);
      expect(state.members).toEqual([]);
      expect(state.shops).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("自分で作成した削除済みグループだけが残るユーザーは新しい店舗を登録できる", async () => {
      const t = convexTest(schema, modules);
      const old = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: "setup_after_group_deletion",
          email: "setup-after-group-deletion@example.com",
          plan: "free",
        });
        await ctx.db.patch(seeded.organizationId, { isDeleted: true, updatedAt: Date.now() });
        return seeded;
      });

      const shopId = await t
        .withIdentity({ subject: "setup_after_group_deletion" })
        .mutation(api.setup.mutations.setupShopAndManager, setupArgs);

      const state = await t.run(async (ctx) => ({
        newShop: await ctx.db.get(shopId),
        organizations: await ctx.db
          .query("organizations")
          .withIndex("by_createdByUserId", (q) => q.eq("createdByUserId", old.userId))
          .collect(),
        user: await ctx.db.get(old.userId),
      }));
      expect(state.newShop).toMatchObject({ name: "テスト店舗", isDeleted: false });
      expect(state.organizations).toHaveLength(2);
      expect(state.organizations.filter((organization) => !organization.isDeleted)).toHaveLength(1);
      expect(state.user).toMatchObject({ isDeleted: false, name: "山田 太郎", email: "yamada@example.com" });
    });

    it("自分で作成した有効グループが重複している場合はfail closedにする", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const userId = await seedUser(ctx, "duplicate_created_organizations");
        const now = Date.now();
        for (const name of ["重複グループA", "重複グループB"]) {
          await ctx.db.insert("organizations", {
            createdByUserId: userId,
            name,
            isDeleted: false,
            createdAt: now,
            updatedAt: now,
          });
        }
      });

      await expect(
        t
          .withIdentity({ subject: "duplicate_created_organizations" })
          .mutation(api.setup.mutations.setupShopAndManager, setupArgs),
      ).rejects.toThrow("作成済みのグループを一意に確認できません");
      await expect(t.run(async (ctx) => ctx.db.query("shops").collect())).resolves.toEqual([]);
    });

    it("認証識別子に複数userが紐づく場合は新しいuserや事業者を作成しない", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await seedUser(ctx, "duplicate_setup_identity", "duplicate-setup-1@example.com");
        await seedUser(ctx, "duplicate_setup_identity", "duplicate-setup-2@example.com");
      });

      await expect(
        t
          .withIdentity({ subject: "duplicate_setup_identity" })
          .mutation(api.setup.mutations.setupShopAndManager, setupArgs),
      ).rejects.toThrow("Not found");

      const state = await t.run(async (ctx) => ({
        users: await ctx.db.query("users").collect(),
        organizations: await ctx.db.query("organizations").collect(),
        people: await ctx.db.query("organizationPeople").collect(),
        members: await ctx.db.query("organizationMembers").collect(),
        shops: await ctx.db.query("shops").collect(),
      }));
      expect(state.users).toHaveLength(2);
      expect(state.organizations).toEqual([]);
      expect(state.people).toEqual([]);
      expect(state.members).toEqual([]);
      expect(state.shops).toEqual([]);
    });

    it("同意なしではエラー", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.withIdentity({ subject: "user_without_legal" }).mutation(api.setup.mutations.setupShopAndManager, {
          ...setupArgs,
          acceptedLegal: false as true,
        }),
      ).rejects.toThrow();
    });

    it("店舗名・管理者名・管理者メールをサーバー側でも検証する", async () => {
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({ subject: "user_invalid_setup" });

      await expect(
        asUser.mutation(api.setup.mutations.setupShopAndManager, {
          ...setupArgs,
          shopName: "あ".repeat(SHOP_NAME_MAX_LENGTH + 1),
        }),
      ).rejects.toThrow("店舗名は80文字以内で入力してください");
      await expect(
        asUser.mutation(api.setup.mutations.setupShopAndManager, {
          ...setupArgs,
          managerName: "山田\n太郎",
        }),
      ).rejects.toThrow("名前に使用できない文字が含まれています");
      await expect(
        asUser.mutation(api.setup.mutations.setupShopAndManager, {
          ...setupArgs,
          managerName: "あ".repeat(PERSON_NAME_MAX_LENGTH + 1),
        }),
      ).rejects.toThrow("名前は80文字以内で入力してください");
      await expect(
        asUser.mutation(api.setup.mutations.setupShopAndManager, {
          ...setupArgs,
          managerEmail: "not-email",
        }),
      ).rejects.toThrow("メールアドレスの形式で入力してください");
    });

    it("店舗・ユーザー・スタッフ・費用なしPro状態・同意履歴をトランザクションで作成する", async () => {
      const t = convexTest(schema, modules);
      const now = new Date("2026-07-05T10:00:00+09:00");
      vi.setSystemTime(now);
      const asUser = t.withIdentity({
        subject: "user_new",
        name: "新規ユーザー",
        email: "new@example.com",
      });

      const shopId = await asUser.mutation(api.setup.mutations.setupShopAndManager, setupArgs);
      expect(shopId).toBeDefined();

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.name).toBe("テスト店舗");
      expect(shop?.regularClosedDays).toEqual([]);
      expect(shop?.submissionPattern).toEqual({ kind: "dateOnly" });
      expect(shop?.operatingStatus).toBe("active");
      expect(shop?.organizationId).toBeDefined();
      if (!shop?.organizationId) throw new Error("organization not found");
      const organizationId = shop.organizationId;

      const organization = await t.run(async (ctx) => ctx.db.get(organizationId));
      expect(organization).toMatchObject({
        name: "テスト店舗グループ",
        billingEmail: "yamada@example.com",
        billingEmailNormalized: "yamada@example.com",
        isDeleted: false,
      });
      const organizationBillingState = await t.run(async (ctx) =>
        ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
          .unique(),
      );
      expect(organizationBillingState).not.toBeNull();
      if (!organizationBillingState) throw new Error("organization billing state not found");
      expect({
        organizationId: organizationBillingState.organizationId,
        state: organizationBillingState.state,
        freeManagerPersonId: organizationBillingState.freeManagerPersonId,
        freeShopId: organizationBillingState.freeShopId,
        version: organizationBillingState.version,
      }).toEqual({
        organizationId,
        state: { kind: "complimentary", plan: "business" },
        freeManagerPersonId: undefined,
        freeShopId: undefined,
        version: 1,
      });
      const billingState = await t.run(async (ctx) =>
        ctx.db
          .query("shopBillingStates")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .unique(),
      );
      expect(billingState).toMatchObject({
        shopId,
        planKey: "free",
        source: "system",
      });

      const user = await t.run(async (ctx) =>
        ctx.db
          .query("users")
          .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", testAuthTokenIdentifier("user_new")))
          .first(),
      );
      expect(user).not.toBeNull();
      if (!user) throw new Error("user not found");
      expect(user?.name).toBe("山田 太郎");
      expect(user?.email).toBe("yamada@example.com");
      expect(user?.role).toBe("manager");
      const organizationPerson = await t.run(async (ctx) =>
        ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId_and_userId", (q) =>
            q.eq("organizationId", organizationId).eq("userId", user._id),
          )
          .unique(),
      );
      expect(organizationPerson).toMatchObject({ status: "active", emailNormalized: "yamada@example.com" });
      const organizationMember = await t.run(async (ctx) =>
        ctx.db
          .query("organizationMembers")
          .withIndex("by_userId_and_organizationId", (q) =>
            q.eq("userId", user._id).eq("organizationId", organizationId),
          )
          .unique(),
      );
      expect(organizationMember).toMatchObject({ status: "active", personId: organizationPerson?._id });
      const consentState = await t.run(async (ctx) =>
        ctx.db
          .query("legalConsentStates")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .first(),
      );
      expect(consentState?.termsConsentVersion).toBe("manager-terms-consent-2026-05-09");
      expect(consentState?.privacyConsentVersion).toBe("manager-privacy-consent-2026-05-09");
      expect(consentState?.termsDocumentVersion).toBe("manager-terms-doc-2026-05-09");
      expect(consentState?.privacyDocumentVersion).toBe("manager-privacy-doc-2026-07-10");
      expect(consentState?.method).toBe("manager_setup");

      const staffs = await t.run(async (ctx) =>
        ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .collect(),
      );
      expect(staffs).toHaveLength(1);
      expect(staffs[0].name).toBe("山田 太郎");
      expect(staffs[0].email).toBe("yamada@example.com");
      expect(staffs[0].userId).toBe(user?._id);
      expect(staffs[0].organizationId).toBe(organizationId);
      expect(staffs[0].organizationPersonId).toBe(organizationPerson?._id);
      const staffConsentState = await t.run(async (ctx) =>
        ctx.db
          .query("legalConsentStates")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffs[0]._id))
          .first(),
      );
      expect(staffConsentState?.termsConsentVersion).toBe("staff-terms-consent-2026-05-09");
      expect(staffConsentState?.privacyConsentVersion).toBe("staff-privacy-consent-2026-05-09");
      expect(staffConsentState?.termsDocumentVersion).toBe("staff-terms-doc-2026-05-09");
      expect(staffConsentState?.privacyDocumentVersion).toBe("staff-privacy-doc-2026-07-10");
      expect(staffConsentState?.method).toBe("manager_setup");

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some((job) => job.name === "line/actions:sendInviteEmail" && job.args[0]?.staffId === staffs[0]._id),
      ).toBe(true);
      expect(
        scheduled.some(
          (job) =>
            job.name === "shopActivationReminder/actions:sendReminder" &&
            job.args[0]?.shopId === shopId &&
            job.scheduledTime === getShopActivationReminderAt(now.getTime()),
        ),
      ).toBe(true);
      expect(scheduled.filter((job) => job.name.startsWith("organizationBilling/"))).toEqual([]);

      const organizationAudits = await t.run(async (ctx) =>
        ctx.db
          .query("organizationAuditEvents")
          .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", organizationId))
          .collect(),
      );
      expect(
        organizationAudits.map(({ action, targetKind, targetId, toState }) => ({
          action,
          targetKind,
          targetId,
          toState,
        })),
      ).toEqual([
        {
          action: "organization.created",
          targetKind: "organization",
          targetId: organizationId,
          toState: "complimentary.business",
        },
      ]);

      const consentEvents = await t.run(async (ctx) =>
        ctx.db
          .query("legalConsentEvents")
          .withIndex("by_userId", (q) => q.eq("userId", user?._id))
          .collect(),
      );
      expect(consentEvents).toHaveLength(1);
      expect(consentEvents[0].method).toBe("manager_setup");
      const staffConsentEvents = await t.run(async (ctx) =>
        ctx.db
          .query("legalConsentEvents")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffs[0]._id))
          .collect(),
      );
      expect(staffConsentEvents).toHaveLength(1);
      expect(staffConsentEvents[0]).toMatchObject({ subjectType: "staff", method: "manager_setup" });
    });

    it("既に店舗がある場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await seedManagerShop(ctx, {
          subject: "user_existing",
          email: "ex@example.com",
          shopName: "既存店舗",
        });
      });

      await expect(
        t.withIdentity({ subject: "user_existing" }).mutation(api.setup.mutations.setupShopAndManager, setupArgs),
      ).rejects.toThrow(ConvexError);
    });

    it("削除済みmembershipや削除済み店舗は既存店舗として扱わない", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await seedManagerShop(ctx, {
          subject: "user_deleted_membership",
          email: "deleted-membership@example.com",
          shopName: "削除済みmembership店舗",
          membershipDeleted: true,
        });
        await seedManagerShop(ctx, {
          subject: "user_deleted_shop",
          email: "deleted-shop@example.com",
          shopName: "削除済み店舗",
          shopDeleted: true,
        });
      });

      await expect(
        t
          .withIdentity({ subject: "user_deleted_membership" })
          .mutation(api.setup.mutations.setupShopAndManager, setupArgs),
      ).resolves.toBeDefined();
      await expect(
        t.withIdentity({ subject: "user_deleted_shop" }).mutation(api.setup.mutations.setupShopAndManager, setupArgs),
      ).resolves.toBeDefined();
    });

    it("shopMembersはuserIdとshopIdとisDeletedでactive所属を引ける", async () => {
      const t = convexTest(schema, modules);

      const { userId, activeShopId, deletedShopId } = await t.run(async (ctx) => {
        const userId = await seedUser(ctx, "membership_lookup", "lookup@example.com");
        const activeShopId = await seedShop(ctx, "Active店舗");
        const deletedShopId = await seedShop(ctx, "Deleted membership店舗");
        await seedShopMembership(ctx, { userId, shopId: activeShopId });
        await seedShopMembership(ctx, { userId, shopId: deletedShopId, isDeleted: true });
        return { userId, activeShopId, deletedShopId };
      });

      const activeMembership = await t.run(async (ctx) =>
        ctx.db
          .query("shopMembers")
          .withIndex("by_userId_and_shopId_and_isDeleted", (q) =>
            q.eq("userId", userId).eq("shopId", activeShopId).eq("isDeleted", false),
          )
          .first(),
      );
      const deletedMembership = await t.run(async (ctx) =>
        ctx.db
          .query("shopMembers")
          .withIndex("by_userId_and_shopId_and_isDeleted", (q) =>
            q.eq("userId", userId).eq("shopId", deletedShopId).eq("isDeleted", false),
          )
          .first(),
      );

      expect(activeMembership?.shopId).toBe(activeShopId);
      expect(deletedMembership).toBeNull();
    });

    it("既存ユーザーレコードがある場合は名前・メールと同意を更新する", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await seedUser(ctx, "user_has_record", "old@example.com");
      });

      await t.withIdentity({ subject: "user_has_record" }).mutation(api.setup.mutations.setupShopAndManager, setupArgs);

      const user = await t.run(async (ctx) =>
        ctx.db
          .query("users")
          .withIndex("by_authTokenIdentifier", (q) =>
            q.eq("authTokenIdentifier", testAuthTokenIdentifier("user_has_record")),
          )
          .first(),
      );
      if (!user) throw new Error("user not found");
      expect(user?.name).toBe("山田 太郎");
      expect(user?.email).toBe("yamada@example.com");
      const consentState = await t.run(async (ctx) =>
        ctx.db
          .query("legalConsentStates")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .first(),
      );
      expect(consentState?.method).toBe("manager_setup");
    });
  });

  describe("createOrganization", () => {
    // ダークローンチ中は既定で閉じている。この describe は公開済みの契約を検証する。
    beforeEach(() => vi.stubEnv("FEATURE_ORGANIZATION_CREATION", "enabled"));
    afterEach(() => vi.unstubAllEnvs());

    const createArgs = {
      shopName: "二つ目の店舗",
      submissionPattern: { kind: "dateOnly" as const },
      requestId: "create-organization-request-1",
    };

    async function seedExistingManager(t: ReturnType<typeof convexTest>, subject: string) {
      return await t.run(async (ctx) =>
        seedOrganizationManagerShop(ctx, {
          subject,
          email: `${subject}@example.com`,
          shopName: "一つ目の店舗",
          complimentary: true,
        }),
      );
    }

    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await expect(t.mutation(api.setup.mutations.createOrganization, createArgs)).rejects.toThrow();
    });

    it("users未登録の認証主体はグループを作成しない", async () => {
      const t = convexTest(schema, modules);

      await expect(
        t.withIdentity({ subject: "user_without_record" }).mutation(api.setup.mutations.createOrganization, createArgs),
      ).rejects.toThrow("グループを作成する前に、初期設定を完了してください");

      const state = await t.run(async (ctx) => ({
        organizations: await ctx.db.query("organizations").collect(),
        shops: await ctx.db.query("shops").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.organizations).toEqual([]);
      expect(state.shops).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("アカウント削除受付済みユーザーは拒否し、グループ・店舗・予約を作成しない", async () => {
      const t = convexTest(schema, modules);
      const seed = await seedExistingManager(t, "create_org_deletion_requested");
      await t.run(async (ctx) => ctx.db.patch(seed.userId, { accountDeletionRequestedAt: Date.now() }));

      await expect(
        t
          .withIdentity({ subject: "create_org_deletion_requested" })
          .mutation(api.setup.mutations.createOrganization, createArgs),
      ).rejects.toThrow("無効になったアカウントではグループを作成できません。");

      const state = await t.run(async (ctx) => ({
        organizations: await ctx.db.query("organizations").collect(),
        shops: await ctx.db.query("shops").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        audits: await ctx.db.query("organizationAuditEvents").collect(),
      }));
      expect(state.organizations).toHaveLength(1);
      expect(state.shops).toHaveLength(1);
      expect(state.scheduled).toEqual([]);
      expect(state.audits).toEqual([]);
    });

    it("二つ目のグループをFreeで作り、既存グループの支払い不要Businessを変えない", async () => {
      const t = convexTest(schema, modules);
      const now = new Date("2026-07-25T10:00:00+09:00");
      vi.setSystemTime(now);
      const seed = await seedExistingManager(t, "create_org_success");

      const result = await t
        .withIdentity({ subject: "create_org_success" })
        .mutation(api.setup.mutations.createOrganization, createArgs);
      expect(result.created).toBe(true);
      expect(Object.keys(result).sort()).toEqual(["created", "shopId"]);

      const state = await t.run(async (ctx) => {
        const shop = await ctx.db.get(result.shopId);
        if (!shop?.organizationId) throw new Error("organization not found");
        const organizationId = shop.organizationId;
        return {
          shop,
          organization: await ctx.db.get(organizationId),
          billingStates: await ctx.db.query("organizationBillingStates").collect(),
          people: await ctx.db
            .query("organizationPeople")
            .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
            .collect(),
          members: await ctx.db
            .query("organizationMembers")
            .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
            .collect(),
          staffs: await ctx.db
            .query("staffs")
            .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", result.shopId).eq("isDeleted", false))
            .collect(),
          audits: await ctx.db
            .query("organizationAuditEvents")
            .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", organizationId))
            .collect(),
          scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
          stripeCustomers: await ctx.db.query("organizationStripeCustomers").collect(),
          billingNotifications: await ctx.db.query("notificationOutbox").collect(),
        };
      });

      expect(state.shop).toMatchObject({ name: "二つ目の店舗", operatingStatus: "active", isDeleted: false });
      expect(state.organization).toMatchObject({ name: "二つ目の店舗グループ", createdByUserId: seed.userId });
      const newBillingState = state.billingStates.find((billing) => billing.organizationId !== seed.organizationId);
      const existingBillingState = state.billingStates.find(
        (billing) => billing.organizationId === seed.organizationId,
      );
      expect(newBillingState?.state).toEqual({ kind: "active", plan: "free" });
      expect(newBillingState?.version).toBe(1);
      expect(existingBillingState?.state).toEqual({ kind: "complimentary", plan: "business" });
      expect(state.people).toHaveLength(1);
      expect(state.members).toHaveLength(1);
      expect(state.staffs).toHaveLength(1);
      expect(state.audits).toHaveLength(1);
      expect(state.audits[0]).toMatchObject({
        action: "organization.created",
        targetKind: "organization",
        actorUserId: seed.userId,
        toState: "active.free",
      });
      expect(state.scheduled).toHaveLength(2);
      expect(state.stripeCustomers).toEqual([]);
      expect(state.billingNotifications).toEqual([]);
    });

    it("既存ユーザーの名前・メールと利用規約の同意状態を書き換えない", async () => {
      const t = convexTest(schema, modules);
      const seed = await seedExistingManager(t, "create_org_keeps_user");
      const consentBefore = await t.run(async (ctx) => {
        await ctx.db.insert("legalConsentStates", {
          subjectType: "user",
          userId: seed.userId,
          shopId: seed.shopId,
          termsConsentVersion: "1",
          privacyConsentVersion: "1",
          termsDocumentVersion: "1",
          privacyDocumentVersion: "1",
          consentedAt: 1000,
          method: "manager_setup",
        });
        return await ctx.db.get(seed.userId);
      });

      await t
        .withIdentity({ subject: "create_org_keeps_user" })
        .mutation(api.setup.mutations.createOrganization, createArgs);

      const after = await t.run(async (ctx) => ({
        user: await ctx.db.get(seed.userId),
        consentStates: await ctx.db
          .query("legalConsentStates")
          .withIndex("by_userId", (q) => q.eq("userId", seed.userId))
          .collect(),
      }));
      expect(after.user?.name).toBe(consentBefore?.name);
      expect(after.user?.email).toBe(consentBefore?.email);
      expect(after.consentStates).toHaveLength(1);
      expect(after.consentStates[0]).toMatchObject({ shopId: seed.shopId, consentedAt: 1000 });
    });

    it("同じrequestIdの再実行は同じ店舗を返し、グループを増やさない", async () => {
      const t = convexTest(schema, modules);
      await seedExistingManager(t, "create_org_idempotent");
      const asUser = t.withIdentity({ subject: "create_org_idempotent" });

      const first = await asUser.mutation(api.setup.mutations.createOrganization, createArgs);
      const second = await asUser.mutation(api.setup.mutations.createOrganization, createArgs);

      expect(first).toEqual({ shopId: first.shopId, created: true });
      expect(second).toEqual({ shopId: first.shopId, created: false });

      const state = await t.run(async (ctx) => ({
        organizations: await ctx.db.query("organizations").collect(),
        shops: await ctx.db.query("shops").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.organizations).toHaveLength(2);
      expect(state.shops).toHaveLength(2);
      expect(state.scheduled).toHaveLength(2);
    });

    it("上限に達している場合は拒否し、グループ・店舗・予約を増やさない", async () => {
      const t = convexTest(schema, modules);
      const seed = await seedExistingManager(t, "create_org_limit");
      await t.run(async (ctx) => {
        for (const name of ["二つ目", "三つ目"]) {
          await ctx.db.insert("organizations", {
            createdByUserId: seed.userId,
            name,
            isDeleted: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      });

      await expect(
        t.withIdentity({ subject: "create_org_limit" }).mutation(api.setup.mutations.createOrganization, createArgs),
      ).rejects.toThrow("作成できるグループは3つまでです。");

      const state = await t.run(async (ctx) => ({
        organizations: await ctx.db.query("organizations").collect(),
        shops: await ctx.db.query("shops").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.organizations).toHaveLength(3);
      expect(state.shops).toHaveLength(1);
      expect(state.scheduled).toEqual([]);
    });

    it("削除済みグループは上限に数えず、招待で所属しているグループも数えない", async () => {
      const t = convexTest(schema, modules);
      const seed = await seedExistingManager(t, "create_org_excluded");
      await t.run(async (ctx) => {
        const now = Date.now();
        await ctx.db.insert("organizations", {
          createdByUserId: seed.userId,
          name: "削除済みグループ",
          isDeleted: true,
          createdAt: now,
          updatedAt: now,
        });
        const invitedOrganizationId = await ctx.db.insert("organizations", {
          createdByUserId: await seedUser(ctx, "other_owner", "other-owner@example.com"),
          name: "招待されたグループ",
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        });
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: invitedOrganizationId,
          userId: seed.userId,
          name: "管理者",
          email: "create_org_excluded@example.com",
          emailNormalized: "create_org_excluded@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationMembers", {
          organizationId: invitedOrganizationId,
          personId,
          userId: seed.userId,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
      });

      await expect(
        t.withIdentity({ subject: "create_org_excluded" }).mutation(api.setup.mutations.createOrganization, createArgs),
      ).resolves.toMatchObject({ created: true });
    });

    it("移行前のグループ未所属店舗も上限に数える", async () => {
      const t = convexTest(schema, modules);
      const userId = await t.run(async (ctx) => {
        const userId = await seedUser(ctx, "create_org_legacy", "create-org-legacy@example.com");
        const legacyShopId = await seedShop(ctx, "移行前店舗");
        await seedShopMembership(ctx, { userId, shopId: legacyShopId });
        const now = Date.now();
        for (const name of ["一つ目", "二つ目"]) {
          await ctx.db.insert("organizations", {
            createdByUserId: userId,
            name,
            isDeleted: false,
            createdAt: now,
            updatedAt: now,
          });
        }
        return userId;
      });
      expect(userId).toBeDefined();

      await expect(
        t.withIdentity({ subject: "create_org_legacy" }).mutation(api.setup.mutations.createOrganization, createArgs),
      ).rejects.toThrow("作成できるグループは3つまでです。");
    });

    it("連続作成はrate limitで拒否し、副作用を増やさない", async () => {
      const t = convexTest(schema, modules);
      vi.setSystemTime(new Date("2026-07-25T10:00:00+09:00"));
      await seedExistingManager(t, "create_org_rate_limit");
      const asUser = t.withIdentity({ subject: "create_org_rate_limit" });

      await asUser.mutation(api.setup.mutations.createOrganization, createArgs);
      await expect(
        asUser.mutation(api.setup.mutations.createOrganization, {
          ...createArgs,
          requestId: "create-organization-request-2",
        }),
      ).rejects.toThrow("グループの作成が続いています。時間をおいてお試しください");

      const state = await t.run(async (ctx) => ({
        organizations: await ctx.db.query("organizations").collect(),
        shops: await ctx.db.query("shops").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.organizations).toHaveLength(2);
      expect(state.shops).toHaveLength(2);
      expect(state.scheduled).toHaveLength(2);
    });

    it("店舗名をサーバー側でも検証する", async () => {
      const t = convexTest(schema, modules);
      await seedExistingManager(t, "create_org_validation");

      await expect(
        t
          .withIdentity({ subject: "create_org_validation" })
          .mutation(api.setup.mutations.createOrganization, { ...createArgs, shopName: "   " }),
      ).rejects.toThrow(ConvexError);
      await expect(
        t.withIdentity({ subject: "create_org_validation" }).mutation(api.setup.mutations.createOrganization, {
          ...createArgs,
          shopName: "あ".repeat(SHOP_NAME_MAX_LENGTH + 1),
        }),
      ).rejects.toThrow(ConvexError);
    });

    describe("ダークローンチ中", () => {
      beforeEach(() => vi.stubEnv("FEATURE_ORGANIZATION_CREATION", ""));

      it("未公開の間は作成を拒否し、冪等recordとrate limit budgetを消費しない", async () => {
        const t = convexTest(schema, modules);
        await seedExistingManager(t, "create_org_dark_launch");
        const asUser = t.withIdentity({ subject: "create_org_dark_launch" });

        await expect(asUser.mutation(api.setup.mutations.createOrganization, createArgs)).rejects.toThrow(
          "新しいグループの作成は現在ご利用いただけません",
        );

        const state = await t.run(async (ctx) => ({
          organizations: await ctx.db.query("organizations").collect(),
          shops: await ctx.db.query("shops").collect(),
          audits: await ctx.db
            .query("organizationAuditEvents")
            .filter((q) => q.eq(q.field("action"), "organization.created"))
            .collect(),
          scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        }));
        // seedした一つ目のグループ以外は増えない。
        expect(state.organizations).toHaveLength(1);
        expect(state.shops).toHaveLength(1);
        expect(state.audits).toHaveLength(0);
        expect(state.scheduled).toHaveLength(0);

        // budgetを消費していないため、公開後は同じrequestIdでそのまま作成できる。
        vi.stubEnv("FEATURE_ORGANIZATION_CREATION", "enabled");
        const created = await asUser.mutation(api.setup.mutations.createOrganization, createArgs);
        expect(created.created).toBe(true);
      });
    });
  });
});
