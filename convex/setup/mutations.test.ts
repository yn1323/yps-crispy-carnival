import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { getShopActivationReminderAt } from "../_lib/dateFormat";
import {
  seedLegacyManagerShop,
  seedLegacyShop,
  seedLegacyShopMembership,
  seedManagerShop,
  seedOrganizationManagerShop,
  seedUser,
  testAuthTokenIdentifier,
} from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { PERSON_NAME_MAX_LENGTH, SHOP_NAME_MAX_LENGTH } from "../constants";
import { PROMOTION_CODE_INVALID_ERROR_CODE } from "./constants";

const setupArgs = {
  shopName: "テスト店舗",
  submissionPattern: { kind: "dateOnly" as const },
  managerName: "山田 太郎",
  managerEmail: "yamada@example.com",
  acceptedLegal: true as const,
};

describe("setup/mutations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("ANALYTICS_SOURCE_CAPTURE_START_AT", "");
    vi.stubEnv("PROMOTION_COMPLIMENTARY_PRO_CODE", "");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("verifyPromotionCode", () => {
    it("未認証ではコードを確認できない", async () => {
      const t = convexTest(schema, modules);
      vi.stubEnv("PROMOTION_COMPLIMENTARY_PRO_CODE", "ABC123");

      await expect(t.mutation(api.setup.mutations.verifyPromotionCode, { promotionCode: "ABC123" })).rejects.toThrow(
        "Unauthenticated",
      );
    });

    it("認証済みの初回登録対象者だけが正規化したコードを副作用なしで確認できる", async () => {
      const t = convexTest(schema, modules);
      vi.stubEnv("PROMOTION_COMPLIMENTARY_PRO_CODE", "A1B2C3");

      await expect(
        t
          .withIdentity({ subject: "promotion_verification_user" })
          .mutation(api.setup.mutations.verifyPromotionCode, { promotionCode: "  a1b2c3  " }),
      ).resolves.toBeNull();

      expect(
        await t.run(async (ctx) => ({
          users: await ctx.db.query("users").collect(),
          organizations: await ctx.db.query("organizations").collect(),
          shops: await ctx.db.query("shops").collect(),
          billingStates: await ctx.db.query("organizationBillingStates").collect(),
          audits: await ctx.db.query("organizationAuditEvents").collect(),
          scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        })),
      ).toEqual({ users: [], organizations: [], shops: [], billingStates: [], audits: [], scheduled: [] });
    });

    it.each([
      { configuredCode: "ABC123", promotionCode: "ZZZ999" },
      { configuredCode: "", promotionCode: "ABC123" },
      { configuredCode: "ABC-12", promotionCode: "ABC123" },
    ])("適用できないコードは同じstructured errorで拒否する", async ({ configuredCode, promotionCode }) => {
      const t = convexTest(schema, modules);
      vi.stubEnv("PROMOTION_COMPLIMENTARY_PRO_CODE", configuredCode);

      const caughtError = await t
        .withIdentity({ subject: `promotion_verification_invalid_${promotionCode}` })
        .mutation(api.setup.mutations.verifyPromotionCode, { promotionCode })
        .then(
          () => null,
          (error: unknown) => error as { data?: unknown },
        );

      expect(caughtError?.data).toEqual({ code: PROMOTION_CODE_INVALID_ERROR_CODE });
    });

    it("既存組織の管理者にはコード照合結果を返さない", async () => {
      const t = convexTest(schema, modules);
      vi.stubEnv("PROMOTION_COMPLIMENTARY_PRO_CODE", "ABC123");
      await t.run(async (ctx) => {
        await seedOrganizationManagerShop(ctx, {
          subject: "existing_promotion_verification_user",
          email: "existing-promotion@example.com",
          complimentary: true,
        });
      });

      await expect(
        t
          .withIdentity({ subject: "existing_promotion_verification_user" })
          .mutation(api.setup.mutations.verifyPromotionCode, { promotionCode: "ABC123" }),
      ).rejects.toThrow("すでに組織へ所属しています。");
    });

    it("事前確認後も最終登録時の設定と一致しなければ作成しない", async () => {
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({ subject: "promotion_revalidation_user" });
      vi.stubEnv("PROMOTION_COMPLIMENTARY_PRO_CODE", "ABC123");
      await asUser.mutation(api.setup.mutations.verifyPromotionCode, { promotionCode: "ABC123" });

      vi.stubEnv("PROMOTION_COMPLIMENTARY_PRO_CODE", "DEF456");
      const caughtError = await asUser
        .mutation(api.setup.mutations.setupShopAndManager, { ...setupArgs, promotionCode: "ABC123" })
        .then(
          () => null,
          (error: unknown) => error as { data?: unknown },
        );

      expect(caughtError?.data).toEqual({ code: PROMOTION_CODE_INVALID_ERROR_CODE });
      await expect(t.run(async (ctx) => ctx.db.query("organizations").collect())).resolves.toEqual([]);
    });
  });

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
      ).rejects.toThrow("無効になったアカウントでは、初期設定を開始できません。");

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
      ).rejects.toThrow("無効になったアカウントでは、初期設定を開始できません。");

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

    it("自分で作成した削除済み組織だけが残るユーザーは新しい店舗を登録できる", async () => {
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

    it("有効な組織へすでに所属している場合は初回Setupを拒否する", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const owner = await seedOrganizationManagerShop(ctx, {
          subject: "setup_invited_org_owner",
          complimentary: true,
        });
        const userId = await seedUser(ctx, "setup_invited_org_member", "invited-member@example.com");
        const now = Date.now();
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: owner.organizationId,
          userId,
          name: "招待済み管理者",
          email: "invited-member@example.com",
          emailNormalized: "invited-member@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationMembers", {
          organizationId: owner.organizationId,
          personId,
          userId,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
      });
      const before = await t.run(async (ctx) => ({
        organizations: await ctx.db.query("organizations").collect(),
        shops: await ctx.db.query("shops").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));

      await expect(
        t
          .withIdentity({ subject: "setup_invited_org_member" })
          .mutation(api.setup.mutations.setupShopAndManager, setupArgs),
      ).rejects.toThrow("すでに組織へ所属しています。");

      expect(
        await t.run(async (ctx) => ({
          organizations: await ctx.db.query("organizations").collect(),
          shops: await ctx.db.query("shops").collect(),
          scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        })),
      ).toEqual(before);
    });

    it("自分で作成した有効組織が重複している場合はfail closedにする", async () => {
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
      ).rejects.toThrow(
        "作成済みの組織情報を確認できません。\n画面を更新しても解消しない場合は、お問い合わせください。",
      );
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

    it("店舗・ユーザー・スタッフ・2か月Trial・同意履歴を作成する", async () => {
      const t = convexTest(schema, modules);
      const now = new Date("2026-07-05T10:00:00+09:00");
      vi.setSystemTime(now);
      vi.stubEnv("PROMOTION_COMPLIMENTARY_PRO_CODE", "ABC123");
      vi.stubEnv("CONVEX_CLOUD_URL", "");
      vi.stubEnv("DEBUG_MODE", "");
      vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", "");
      const asUser = t.withIdentity({
        subject: "user_new",
        name: "新規ユーザー",
        email: "new@example.com",
      });

      const shopId = await asUser.mutation(api.setup.mutations.setupShopAndManager, {
        ...setupArgs,
        promotionCode: "  ",
      });
      expect(shopId).toBeDefined();

      const shop = await t.run(async (ctx) => ctx.db.get(shopId));
      expect(shop?.name).toBe("テスト店舗");
      expect(shop?.regularClosedDays).toEqual([]);
      expect(shop?.submissionPattern).toEqual({ kind: "dateOnly" });
      expect(shop?.isDeleted).toBe(false);
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
        state: { kind: "trial", trialEndsAt: Date.parse("2026-09-04T15:00:00.000Z") },
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
      expect(billingState).toBeNull();
      const stripeState = await t.run(async (ctx) => ({
        customers: await ctx.db.query("organizationStripeCustomers").collect(),
        subscriptions: await ctx.db.query("organizationStripeSubscriptions").collect(),
        operations: await ctx.db.query("organizationStripeOperations").collect(),
      }));
      expect(stripeState).toEqual({ customers: [], subscriptions: [], operations: [] });

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
      const legacyMembership = await t.run(async (ctx) =>
        ctx.db
          .query("shopMembers")
          .withIndex("by_userId_and_shopId", (q) => q.eq("userId", user._id).eq("shopId", shopId))
          .unique(),
      );
      expect(legacyMembership).toBeNull();
      const consentState = await t.run(async (ctx) =>
        ctx.db
          .query("legalConsentStates")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .first(),
      );
      expect(consentState?.termsConsentVersion).toBe("manager-terms-consent-2026-08-27-2");
      expect(consentState?.privacyConsentVersion).toBe("manager-privacy-consent-2026-08-26");
      expect(consentState?.termsDocumentVersion).toBe("manager-terms-doc-2026-08-27-2");
      expect(consentState?.privacyDocumentVersion).toBe("manager-privacy-doc-2026-08-26");
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
      expect(staffConsentState?.privacyConsentVersion).toBe("staff-privacy-consent-2026-08-26");
      expect(staffConsentState?.termsDocumentVersion).toBe("staff-terms-doc-2026-08-26");
      expect(staffConsentState?.privacyDocumentVersion).toBe("staff-privacy-doc-2026-08-26-2");
      expect(staffConsentState?.method).toBe("manager_setup");

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some(
          (job) =>
            job.name === "line/actions:sendInviteEmail" &&
            job.args[0]?.staffId === staffs[0]._id &&
            job.args[0]?.organizationPersonId === organizationPerson?._id &&
            job.args[0]?.lineLinkGenerationAtSchedule === 0,
        ),
      ).toBe(true);
      expect(
        scheduled.some(
          (job) =>
            job.name === "shopActivationReminder/actions:sendReminder" &&
            job.args[0]?.shopId === shopId &&
            job.scheduledTime === getShopActivationReminderAt(now.getTime()),
        ),
      ).toBe(true);
      expect(
        scheduled
          .filter((job) => job.name === "organizationBilling/mutations:processDeadline")
          .map((job) => ({ scheduledTime: job.scheduledTime, args: job.args[0] })),
      ).toEqual([
        {
          scheduledTime: Date.parse("2026-09-04T15:00:00.000Z"),
          args: {
            organizationId,
            expectedVersion: 1,
            expectedDeadlineAt: Date.parse("2026-09-04T15:00:00.000Z"),
          },
        },
      ]);

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
          toState: "trial",
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

    it("一致するコードを正規化し、支払い不要Proをコード非保存・期限処理なしで作成する", async () => {
      const t = convexTest(schema, modules);
      const now = new Date("2026-07-05T10:00:00+09:00");
      vi.setSystemTime(now);
      vi.stubEnv("PROMOTION_COMPLIMENTARY_PRO_CODE", "A1B2C3");
      const asUser = t.withIdentity({
        subject: "complimentary_promotion_user",
        name: "新規ユーザー",
        email: "promotion@example.com",
      });

      const shopId = await asUser.mutation(api.setup.mutations.setupShopAndManager, {
        ...setupArgs,
        promotionCode: "  a1b2c3  ",
      });
      const state = await t.run(async (ctx) => {
        const shop = await ctx.db.get(shopId);
        if (!shop?.organizationId) throw new Error("organization not found");
        const organizationId = shop.organizationId;
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
          .unique();
        return {
          billingState,
          audits: await ctx.db
            .query("organizationAuditEvents")
            .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", organizationId))
            .collect(),
          analyticsEvents: await ctx.db.query("analyticsSourceEvents").collect(),
          scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
          stripeCustomers: await ctx.db.query("organizationStripeCustomers").collect(),
          stripeSubscriptions: await ctx.db.query("organizationStripeSubscriptions").collect(),
          stripeOperations: await ctx.db.query("organizationStripeOperations").collect(),
          billingNotifications: await ctx.db.query("notificationOutbox").collect(),
        };
      });

      expect(state.billingState).toMatchObject({
        state: { kind: "complimentary", plan: "pro" },
        version: 1,
      });
      expect(state.billingState?.freeManagerPersonId).toBeUndefined();
      expect(state.billingState?.freeShopId).toBeUndefined();
      expect(state.scheduled.filter((job) => job.name === "organizationBilling/mutations:processDeadline")).toEqual([]);
      expect({
        customers: state.stripeCustomers,
        subscriptions: state.stripeSubscriptions,
        operations: state.stripeOperations,
        notifications: state.billingNotifications,
      }).toEqual({ customers: [], subscriptions: [], operations: [], notifications: [] });
      expect(state.audits.map(({ action, toState }) => ({ action, toState }))).toEqual([
        { action: "organization.created", toState: "complimentary.pro" },
      ]);
      expect(state.analyticsEvents.map((event) => event.payload)).toEqual([
        expect.objectContaining({ kind: "organization", change: "created", currentPlan: "pro" }),
      ]);
      expect(JSON.stringify(state)).not.toContain("A1B2C3");
      expect(JSON.stringify(state)).not.toContain("a1b2c3");
    });

    it.each([
      { label: "入力が6桁でない", configuredCode: "ABC123", promotionCode: "ABC12" },
      { label: "入力と設定が一致しない", configuredCode: "ABC123", promotionCode: "ZZZ999" },
      { label: "環境変数が未設定", configuredCode: "", promotionCode: "ABC123" },
      { label: "環境変数が6桁の英数字でない", configuredCode: "ABC-12", promotionCode: "ABC123" },
    ])("$label場合は同じstructured errorで全作成を拒否する", async ({ configuredCode, promotionCode }) => {
      const t = convexTest(schema, modules);
      vi.stubEnv("PROMOTION_COMPLIMENTARY_PRO_CODE", configuredCode);
      const asUser = t.withIdentity({ subject: `invalid_promotion_${promotionCode}` });

      const caughtError = await asUser
        .mutation(api.setup.mutations.setupShopAndManager, { ...setupArgs, promotionCode })
        .then(
          () => null,
          (error: unknown) => error as { data?: unknown },
        );

      expect(caughtError?.data).toEqual({ code: PROMOTION_CODE_INVALID_ERROR_CODE });
      const state = await t.run(async (ctx) => ({
        users: await ctx.db.query("users").collect(),
        organizations: await ctx.db.query("organizations").collect(),
        people: await ctx.db.query("organizationPeople").collect(),
        members: await ctx.db.query("organizationMembers").collect(),
        shops: await ctx.db.query("shops").collect(),
        billingStates: await ctx.db.query("organizationBillingStates").collect(),
        staffs: await ctx.db.query("staffs").collect(),
        positions: await ctx.db.query("positions").collect(),
        legalStates: await ctx.db.query("legalConsentStates").collect(),
        legalEvents: await ctx.db.query("legalConsentEvents").collect(),
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        analyticsEvents: await ctx.db.query("analyticsSourceEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state).toEqual({
        users: [],
        organizations: [],
        people: [],
        members: [],
        shops: [],
        billingStates: [],
        staffs: [],
        positions: [],
        legalStates: [],
        legalEvents: [],
        audits: [],
        analyticsEvents: [],
        scheduled: [],
      });
    });

    it("既に店舗がある場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      vi.stubEnv("PROMOTION_COMPLIMENTARY_PRO_CODE", "ABC123");

      await t.run(async (ctx) => {
        await seedManagerShop(ctx, {
          subject: "user_existing",
          email: "ex@example.com",
          shopName: "既存店舗",
        });
      });

      await expect(
        t.withIdentity({ subject: "user_existing" }).mutation(api.setup.mutations.setupShopAndManager, {
          ...setupArgs,
          promotionCode: "ABC123",
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("削除済みmembershipや削除済み店舗は既存店舗として扱わない", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await seedLegacyManagerShop(ctx, {
          subject: "user_deleted_membership",
          email: "deleted-membership@example.com",
          shopName: "削除済みmembership店舗",
          membershipDeleted: true,
        });
        await seedLegacyManagerShop(ctx, {
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
        const activeShopId = await seedLegacyShop(ctx, "Active店舗");
        const deletedShopId = await seedLegacyShop(ctx, "Deleted membership店舗");
        await seedLegacyShopMembership(ctx, { userId, shopId: activeShopId });
        await seedLegacyShopMembership(ctx, { userId, shopId: deletedShopId, isDeleted: true });
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

    type ExistingManagerSeed = Awaited<ReturnType<typeof seedExistingManager>>;
    type OrganizationCreationTest = ReturnType<typeof convexTest>;
    const sourceIntegrityCases: Array<{
      key: string;
      label: string;
      corrupt: (t: OrganizationCreationTest, seed: ExistingManagerSeed) => Promise<void>;
    }> = [
      {
        key: "removed",
        label: "removedのcanonical所属",
        corrupt: async (t, seed) => {
          await t.run(async (ctx) => ctx.db.patch(seed.memberId, { status: "removed" }));
        },
      },
      {
        key: "deleted_shop",
        label: "削除済みsource店舗",
        corrupt: async (t, seed) => {
          await t.run(async (ctx) => ctx.db.patch(seed.shopId, { isDeleted: true }));
        },
      },
      {
        key: "deleted_organization",
        label: "削除済みsource組織",
        corrupt: async (t, seed) => {
          await t.run(async (ctx) => ctx.db.patch(seed.organizationId, { isDeleted: true, updatedAt: Date.now() }));
        },
      },
      {
        key: "duplicate_person",
        label: "同一userの重複person",
        corrupt: async (t, seed) => {
          await t.run(async (ctx) => {
            const now = Date.now();
            await ctx.db.insert("organizationPeople", {
              organizationId: seed.organizationId,
              userId: seed.userId,
              name: "重複管理者",
              email: "duplicate-manager@example.com",
              emailNormalized: "duplicate-manager@example.com",
              status: "active",
              createdAt: now,
              updatedAt: now,
            });
          });
        },
      },
      {
        key: "mismatched_person",
        label: "memberとpersonの組織不一致",
        corrupt: async (t, seed) => {
          const foreign = await seedExistingManager(t, "create_org_source_integrity_foreign");
          await t.run(async (ctx) => ctx.db.patch(seed.memberId, { personId: foreign.personId }));
        },
      },
      {
        key: "duplicate_member",
        label: "同一user・組織の重複member",
        corrupt: async (t, seed) => {
          await t.run(async (ctx) => {
            const now = Date.now();
            await ctx.db.insert("organizationMembers", {
              organizationId: seed.organizationId,
              personId: seed.personId,
              userId: seed.userId,
              status: "active",
              createdAt: now,
              updatedAt: now,
            });
          });
        },
      },
    ];

    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await expect(t.mutation(api.setup.mutations.createOrganization, createArgs)).rejects.toThrow();
    });

    it("users未登録の認証主体は組織を作成しない", async () => {
      const t = convexTest(schema, modules);

      await expect(
        t.withIdentity({ subject: "user_without_record" }).mutation(api.setup.mutations.createOrganization, createArgs),
      ).rejects.toThrow("組織を作成する前に、初期設定を完了してください。");

      const state = await t.run(async (ctx) => ({
        organizations: await ctx.db.query("organizations").collect(),
        shops: await ctx.db.query("shops").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.organizations).toEqual([]);
      expect(state.shops).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("users行だけで管理者所属がない認証主体は、旧frontend互換のsource省略でも組織を作成しない", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await seedUser(ctx, "create_org_without_manager_authority", "without-manager-authority@example.com");
      });
      const readProtectedState = () =>
        t.run(async (ctx) => ({
          organizations: await ctx.db.query("organizations").collect(),
          shops: await ctx.db.query("shops").collect(),
          people: await ctx.db.query("organizationPeople").collect(),
          members: await ctx.db.query("organizationMembers").collect(),
          staffs: await ctx.db.query("staffs").collect(),
          billingStates: await ctx.db.query("organizationBillingStates").collect(),
          audits: await ctx.db.query("organizationAuditEvents").collect(),
          analyticsEvents: await ctx.db.query("analyticsSourceEvents").collect(),
          legalConsents: await ctx.db.query("legalConsentStates").collect(),
          positions: await ctx.db.query("positions").collect(),
          scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        }));
      const beforeRejected = await readProtectedState();

      await expect(
        t
          .withIdentity({ subject: "create_org_without_manager_authority" })
          .mutation(api.setup.mutations.createOrganization, createArgs),
      ).rejects.toThrow("Not found");

      expect(await readProtectedState()).toEqual(beforeRejected);
    });

    it("activeなlegacy管理者所属があれば、旧frontend互換のsource省略でもusers snapshotで作成できる", async () => {
      const t = convexTest(schema, modules);
      const legacy = await t.run(async (ctx) =>
        seedLegacyManagerShop(ctx, {
          subject: "create_org_legacy_omitted_source",
          email: "legacy-omitted-source@example.com",
          shopName: "移行前店舗",
        }),
      );

      const result = await t
        .withIdentity({ subject: "create_org_legacy_omitted_source" })
        .mutation(api.setup.mutations.createOrganization, {
          ...createArgs,
          requestId: "create-organization-legacy-omitted-source",
        });

      const created = await t.run(async (ctx) => {
        const shop = await ctx.db.get(result.shopId);
        if (!shop?.organizationId) throw new Error("organization not found");
        const organizationId = shop.organizationId;
        const audit = await ctx.db
          .query("organizationAuditEvents")
          .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", organizationId))
          .unique();
        return { shop, organization: await ctx.db.get(organizationId), audit };
      });
      expect(result.created).toBe(true);
      expect(created.shop).toMatchObject({ name: "二つ目の店舗", isDeleted: false });
      expect(created.organization).toMatchObject({ createdByUserId: legacy.userId, isDeleted: false });
      expect(created.audit?.fromState).toBe("managerProfile.omittedSourceUserSnapshot");
    });

    it.each([
      {
        label: "removedなcanonical person",
        corrupt: async (t: OrganizationCreationTest, seed: ExistingManagerSeed) => {
          await t.run(async (ctx) => ctx.db.patch(seed.personId, { status: "removed", updatedAt: Date.now() }));
        },
      },
      {
        label: "重複canonical person",
        corrupt: async (t: OrganizationCreationTest, seed: ExistingManagerSeed) => {
          await t.run(async (ctx) => {
            const now = Date.now();
            await ctx.db.insert("organizationPeople", {
              organizationId: seed.organizationId,
              userId: seed.userId,
              name: "重複管理者",
              email: "duplicate-legacy-manager@example.com",
              emailNormalized: "duplicate-legacy-manager@example.com",
              status: "active",
              createdAt: now,
              updatedAt: now,
            });
          });
        },
      },
    ])("$labelがlegacy所属に残っていても、source省略で管理者authorityにfallbackしない", async ({ corrupt }) => {
      const t = convexTest(schema, modules);
      const seed = await seedExistingManager(t, "create_org_invalid_legacy_omitted_source");
      await t.run(async (ctx) => {
        await ctx.db.delete(seed.memberId);
        await seedLegacyShopMembership(ctx, { userId: seed.userId, shopId: seed.shopId });
      });
      await corrupt(t, seed);
      const readProtectedState = () =>
        t.run(async (ctx) => ({
          organizations: await ctx.db.query("organizations").collect(),
          shops: await ctx.db.query("shops").collect(),
          people: await ctx.db.query("organizationPeople").collect(),
          members: await ctx.db.query("organizationMembers").collect(),
          billingStates: await ctx.db.query("organizationBillingStates").collect(),
          audits: await ctx.db.query("organizationAuditEvents").collect(),
          scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        }));
      const beforeRejected = await readProtectedState();

      await expect(
        t
          .withIdentity({ subject: "create_org_invalid_legacy_omitted_source" })
          .mutation(api.setup.mutations.createOrganization, {
            ...createArgs,
            requestId: "create-organization-invalid-legacy-omitted-source",
          }),
      ).rejects.toThrow("Not found");

      expect(await readProtectedState()).toEqual(beforeRejected);
    });

    it("アカウント削除受付済みユーザーは拒否し、組織・店舗・予約を作成しない", async () => {
      const t = convexTest(schema, modules);
      const seed = await seedExistingManager(t, "create_org_deletion_requested");
      await t.run(async (ctx) => ctx.db.patch(seed.userId, { accountDeletionRequestedAt: Date.now() }));

      await expect(
        t
          .withIdentity({ subject: "create_org_deletion_requested" })
          .mutation(api.setup.mutations.createOrganization, createArgs),
      ).rejects.toThrow("無効になったアカウントでは、組織を作成できません。");

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

    it("二つ目の組織をFreeで作り、既存組織の支払い不要Proを変えない", async () => {
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

      expect(state.shop).toMatchObject({ name: "二つ目の店舗", isDeleted: false });
      expect(state.organization).toMatchObject({ name: "二つ目の店舗グループ", createdByUserId: seed.userId });
      const newBillingState = state.billingStates.find((billing) => billing.organizationId !== seed.organizationId);
      const existingBillingState = state.billingStates.find(
        (billing) => billing.organizationId === seed.organizationId,
      );
      expect(newBillingState?.state).toEqual({ kind: "active", plan: "free" });
      expect(newBillingState?.version).toBe(1);
      expect(existingBillingState?.state).toEqual({ kind: "complimentary", plan: "pro" });
      expect(state.people).toHaveLength(1);
      expect(state.members).toHaveLength(1);
      expect(state.staffs).toHaveLength(1);
      expect(newBillingState?.freeManagerPersonId).toBe(state.people[0]?._id);
      expect(newBillingState?.freeShopId).toBe(result.shopId);
      expect(state.audits).toHaveLength(1);
      expect(state.audits[0]).toMatchObject({
        action: "organization.created",
        targetKind: "organization",
        actorUserId: seed.userId,
        fromState: "managerProfile.omittedSourceUserSnapshot",
        toState: "active.free",
      });
      expect(state.scheduled).toHaveLength(2);
      expect(state.scheduled.some((job) => job.name === "organizationBilling/mutations:processDeadline")).toBe(false);
      expect(state.stripeCustomers).toEqual([]);
      expect(state.billingNotifications).toEqual([]);
    });

    it("操作元組織のperson連絡先を新しいperson・staff・初回請求先へ引き継ぐ", async () => {
      const t = convexTest(schema, modules);
      const seed = await seedExistingManager(t, "create_org_contact_source");
      await t.run(async (ctx) => {
        const sourceStaffId = await ctx.db.insert("staffs", {
          shopId: seed.shopId,
          organizationId: seed.organizationId,
          organizationPersonId: seed.personId,
          userId: seed.userId,
          name: "管理者",
          email: "create_org_contact_source@example.com",
          emailNormalized: "create_org_contact_source@example.com",
          excludedFromShift: false,
          isDeleted: false,
        });
        await ctx.db.patch(seed.userId, {
          name: "古いユーザー名",
          email: "stale-login@example.com",
          emailNormalized: "stale-login@example.com",
        });
        await ctx.db.patch(seed.personId, {
          name: "現在の管理者名",
          email: "shift-contact@example.com",
          emailNormalized: "shift-contact@example.com",
          updatedAt: Date.now(),
        });
        await ctx.db.patch(sourceStaffId, {
          name: "現在の管理者名",
          email: "shift-contact@example.com",
          emailNormalized: "shift-contact@example.com",
        });
      });

      const result = await t
        .withIdentity({ subject: "create_org_contact_source" })
        .mutation(api.setup.mutations.createOrganization, {
          ...createArgs,
          sourceShopId: seed.shopId,
          requestId: "create-organization-contact-source",
        });

      const created = await t.run(async (ctx) => {
        const shop = await ctx.db.get(result.shopId);
        if (!shop?.organizationId) throw new Error("organization not found");
        const organizationId = shop.organizationId;
        const people = await ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
          .collect();
        const staffs = await ctx.db
          .query("staffs")
          .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", result.shopId).eq("isDeleted", false))
          .collect();
        const audit = await ctx.db
          .query("organizationAuditEvents")
          .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", organizationId))
          .first();
        return { organization: await ctx.db.get(organizationId), people, staffs, audit };
      });
      expect(created.organization).toMatchObject({
        billingEmail: "shift-contact@example.com",
        billingEmailNormalized: "shift-contact@example.com",
      });
      expect(created.people).toEqual([
        expect.objectContaining({ name: "現在の管理者名", email: "shift-contact@example.com" }),
      ]);
      expect(created.staffs).toEqual([
        expect.objectContaining({ name: "現在の管理者名", email: "shift-contact@example.com" }),
      ]);
      expect(created.audit?.fromState).toBe("managerProfile.canonicalPerson");
    });

    it("organizationMember作成前でもlegacy所属と一意なactive personがあればperson snapshotを使う", async () => {
      const t = convexTest(schema, modules);
      const seed = await seedExistingManager(t, "create_org_partial_person_source");
      await t.run(async (ctx) => {
        await ctx.db.delete(seed.memberId);
        await seedLegacyShopMembership(ctx, { userId: seed.userId, shopId: seed.shopId });
        await ctx.db.patch(seed.userId, {
          name: "古いユーザー名",
          email: "partial-person-login@example.com",
          emailNormalized: "partial-person-login@example.com",
        });
        await ctx.db.patch(seed.personId, {
          name: "移行途中の現在名",
          email: "partial-person-contact@example.com",
          emailNormalized: "partial-person-contact@example.com",
        });
      });

      const result = await t
        .withIdentity({ subject: "create_org_partial_person_source" })
        .mutation(api.setup.mutations.createOrganization, {
          ...createArgs,
          sourceShopId: seed.shopId,
          requestId: "create-organization-partial-person-source",
        });

      const created = await t.run(async (ctx) => {
        const shop = await ctx.db.get(result.shopId);
        if (!shop?.organizationId) throw new Error("organization not found");
        const organizationId = shop.organizationId;
        return {
          organization: await ctx.db.get(organizationId),
          people: await ctx.db
            .query("organizationPeople")
            .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
            .collect(),
          audit: await ctx.db
            .query("organizationAuditEvents")
            .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", organizationId))
            .first(),
        };
      });
      expect(created.organization?.billingEmail).toBe("partial-person-contact@example.com");
      expect(created.people).toEqual([
        expect.objectContaining({ name: "移行途中の現在名", email: "partial-person-contact@example.com" }),
      ]);
      expect(created.audit?.fromState).toBe("managerProfile.canonicalPerson");
    });

    it("organization付きsourceがlegacy所属だけの移行途中ならusers snapshotで作成し、再送を同じ店舗へ収束させる", async () => {
      const t = convexTest(schema, modules);
      const seed = await seedExistingManager(t, "create_org_partial_legacy_source");
      await t.run(async (ctx) => {
        await ctx.db.delete(seed.memberId);
        await ctx.db.delete(seed.personId);
        await seedLegacyShopMembership(ctx, { userId: seed.userId, shopId: seed.shopId });
        await ctx.db.patch(seed.userId, {
          name: "移行途中管理者",
          email: "partial-legacy-contact@example.com",
          emailNormalized: "partial-legacy-contact@example.com",
        });
      });
      const args = {
        ...createArgs,
        sourceShopId: seed.shopId,
        requestId: "create-organization-partial-legacy-source",
      };
      const asUser = t.withIdentity({ subject: "create_org_partial_legacy_source" });

      const first = await asUser.mutation(api.setup.mutations.createOrganization, args);
      const second = await asUser.mutation(api.setup.mutations.createOrganization, args);

      expect(first.created).toBe(true);
      expect(second).toEqual({ shopId: first.shopId, created: false });
      const created = await t.run(async (ctx) => {
        const shop = await ctx.db.get(first.shopId);
        if (!shop?.organizationId) throw new Error("organization not found");
        const organizationId = shop.organizationId;
        const [organization, people, staffs, audit] = await Promise.all([
          ctx.db.get(organizationId),
          ctx.db
            .query("organizationPeople")
            .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
            .collect(),
          ctx.db
            .query("staffs")
            .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", first.shopId).eq("isDeleted", false))
            .collect(),
          ctx.db
            .query("organizationAuditEvents")
            .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", organizationId))
            .first(),
        ]);
        return { organization, people, staffs, audit };
      });
      expect(created.organization).toMatchObject({
        billingEmail: "partial-legacy-contact@example.com",
        billingEmailNormalized: "partial-legacy-contact@example.com",
      });
      expect(created.people).toEqual([
        expect.objectContaining({ name: "移行途中管理者", email: "partial-legacy-contact@example.com" }),
      ]);
      expect(created.staffs).toEqual([
        expect.objectContaining({ name: "移行途中管理者", email: "partial-legacy-contact@example.com" }),
      ]);
      expect(created.audit?.fromState).toBe("managerProfile.legacySourceUserSnapshot");
    });

    it("canonical membershipが壊れている場合はlegacy所属が残っていてもusersへfallbackしない", async () => {
      const t = convexTest(schema, modules);
      const seed = await seedExistingManager(t, "create_org_broken_canonical_source");
      await t.run(async (ctx) => {
        await seedLegacyShopMembership(ctx, { userId: seed.userId, shopId: seed.shopId });
        await ctx.db.delete(seed.personId);
      });

      await expect(
        t
          .withIdentity({ subject: "create_org_broken_canonical_source" })
          .mutation(api.setup.mutations.createOrganization, {
            ...createArgs,
            sourceShopId: seed.shopId,
            requestId: "create-organization-broken-canonical-source",
          }),
      ).rejects.toThrow("Not found");

      const state = await t.run(async (ctx) => ({
        organizations: await ctx.db.query("organizations").collect(),
        shops: await ctx.db.query("shops").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.organizations).toHaveLength(1);
      expect(state.shops).toHaveLength(1);
      expect(state.scheduled).toEqual([]);
    });

    it("所属していないsourceShopIdを拒否し、新しい組織を作らない", async () => {
      const t = convexTest(schema, modules);
      await seedExistingManager(t, "create_org_source_actor");
      const other = await seedExistingManager(t, "create_org_source_other");

      await expect(
        t.withIdentity({ subject: "create_org_source_actor" }).mutation(api.setup.mutations.createOrganization, {
          ...createArgs,
          sourceShopId: other.shopId,
          requestId: "create-organization-invalid-source",
        }),
      ).rejects.toThrow("Not found");

      const state = await t.run(async (ctx) => ({
        organizations: await ctx.db.query("organizations").collect(),
        shops: await ctx.db.query("shops").collect(),
      }));
      expect(state.organizations).toHaveLength(2);
      expect(state.shops).toHaveLength(2);
    });

    it.each(sourceIntegrityCases)("$labelをsourceにした作成を拒否し、保護対象を変えない", async ({ key, corrupt }) => {
      const t = convexTest(schema, modules);
      const subject = `create_org_source_integrity_${key}`;
      const seed = await seedExistingManager(t, subject);
      await corrupt(t, seed);
      const readProtectedState = () =>
        t.run(async (ctx) => ({
          organizations: await ctx.db.query("organizations").collect(),
          shops: await ctx.db.query("shops").collect(),
          people: await ctx.db.query("organizationPeople").collect(),
          members: await ctx.db.query("organizationMembers").collect(),
          staffs: await ctx.db.query("staffs").collect(),
          billingStates: await ctx.db.query("organizationBillingStates").collect(),
          audits: await ctx.db.query("organizationAuditEvents").collect(),
          analyticsEvents: await ctx.db.query("analyticsSourceEvents").collect(),
          legalConsents: await ctx.db.query("legalConsentStates").collect(),
          positions: await ctx.db.query("positions").collect(),
          outbox: await ctx.db.query("notificationOutbox").collect(),
          scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        }));
      const beforeRejected = await readProtectedState();

      await expect(
        t.withIdentity({ subject }).mutation(api.setup.mutations.createOrganization, {
          ...createArgs,
          sourceShopId: seed.shopId,
          requestId: `create-organization-source-integrity-${key}`,
        }),
      ).rejects.toThrow("Not found");

      expect(await readProtectedState()).toEqual(beforeRejected);
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

    it("同じrequestIdの再実行は同じ店舗を返し、組織を増やさない", async () => {
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

    it.each([
      {
        label: "操作元のmanager authorityが失効した",
        expectedError: "Not found",
        invalidate: async (t: OrganizationCreationTest, seed: ExistingManagerSeed) => {
          await t.run(async (ctx) => ctx.db.patch(seed.memberId, { status: "removed", updatedAt: Date.now() }));
        },
      },
      {
        label: "アカウント削除が受付済みになった",
        expectedError: "無効になったアカウントでは、組織を作成できません。",
        invalidate: async (t: OrganizationCreationTest, seed: ExistingManagerSeed) => {
          await t.run(async (ctx) => ctx.db.patch(seed.userId, { accountDeletionRequestedAt: Date.now() }));
        },
      },
    ])("$label後は、成功済みrequestIdの再送でも現在の認可を迂回しない", async ({ expectedError, invalidate }) => {
      const t = convexTest(schema, modules);
      const seed = await seedExistingManager(t, "create_org_stale_idempotency_authority");
      const args = {
        ...createArgs,
        sourceShopId: seed.shopId,
        requestId: "create-organization-stale-idempotency-authority",
      };
      const asUser = t.withIdentity({ subject: "create_org_stale_idempotency_authority" });
      await expect(asUser.mutation(api.setup.mutations.createOrganization, args)).resolves.toMatchObject({
        created: true,
      });
      await invalidate(t, seed);
      const readProtectedState = () =>
        t.run(async (ctx) => ({
          organizations: await ctx.db.query("organizations").collect(),
          shops: await ctx.db.query("shops").collect(),
          people: await ctx.db.query("organizationPeople").collect(),
          members: await ctx.db.query("organizationMembers").collect(),
          billingStates: await ctx.db.query("organizationBillingStates").collect(),
          audits: await ctx.db.query("organizationAuditEvents").collect(),
          scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        }));
      const beforeRejected = await readProtectedState();

      await expect(asUser.mutation(api.setup.mutations.createOrganization, args)).rejects.toThrow(expectedError);

      expect(await readProtectedState()).toEqual(beforeRejected);
    });

    it("上限に達している場合は拒否し、組織・店舗・予約を増やさない", async () => {
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
      ).rejects.toThrow("作成できる組織は3つまでです");

      const state = await t.run(async (ctx) => ({
        organizations: await ctx.db.query("organizations").collect(),
        shops: await ctx.db.query("shops").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.organizations).toHaveLength(3);
      expect(state.shops).toHaveLength(1);
      expect(state.scheduled).toEqual([]);
    });

    it("削除済み組織は上限に数えず、招待で所属している組織も数えない", async () => {
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

    it("移行前の組織未所属店舗も上限に数える", async () => {
      const t = convexTest(schema, modules);
      const userId = await t.run(async (ctx) => {
        const userId = await seedUser(ctx, "create_org_legacy", "create-org-legacy@example.com");
        const legacyShopId = await seedLegacyShop(ctx, "移行前店舗");
        await seedLegacyShopMembership(ctx, { userId, shopId: legacyShopId });
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
      ).rejects.toThrow("作成できる組織は3つまでです");
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
      ).rejects.toThrow("組織の作成処理が進行中です。\n少し時間をおいてから、もう一度お試しください。");

      const state = await t.run(async (ctx) => ({
        organizations: await ctx.db.query("organizations").collect(),
        shops: await ctx.db.query("shops").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.organizations).toHaveLength(2);
      expect(state.shops).toHaveLength(2);
      expect(state.scheduled).toHaveLength(2);
    });

    it("日次budgetを10回使うと11回目を拒否し、副作用を増やさない", async () => {
      const t = convexTest(schema, modules);
      const startedAt = new Date("2026-07-25T10:00:00+09:00").getTime();
      vi.setSystemTime(startedAt);
      const seed = await seedExistingManager(t, "create_org_daily_limit");
      const asUser = t.withIdentity({ subject: "create_org_daily_limit" });
      const createdShopIds = [];

      for (let index = 0; index < 10; index += 1) {
        // 1分ごとに進めて短時間limitを回復させ、日次budgetだけを消費する。
        vi.setSystemTime(startedAt + index * 60_000);
        const created = await asUser.mutation(api.setup.mutations.createOrganization, {
          ...createArgs,
          sourceShopId: seed.shopId,
          requestId: `create-organization-daily-${index + 1}`,
        });
        createdShopIds.push(created.shopId);

        // 同時保持3件の上限と混同しないよう、作成済み組織を次の試行前に論理削除する。
        await t.run(async (ctx) => {
          const shop = await ctx.db.get(created.shopId);
          if (!shop?.organizationId) throw new Error("created organization not found");
          await ctx.db.patch(shop.organizationId, { isDeleted: true, updatedAt: Date.now() });
        });
      }
      expect(new Set(createdShopIds).size).toBe(10);

      // 最後の成功からさらに1分進めるため、11回目では短時間limitは回復済みである。
      vi.setSystemTime(startedAt + 10 * 60_000);
      const readProtectedState = () =>
        t.run(async (ctx) => ({
          organizations: await ctx.db.query("organizations").collect(),
          shops: await ctx.db.query("shops").collect(),
          people: await ctx.db.query("organizationPeople").collect(),
          members: await ctx.db.query("organizationMembers").collect(),
          staffs: await ctx.db.query("staffs").collect(),
          billingStates: await ctx.db.query("organizationBillingStates").collect(),
          audits: await ctx.db.query("organizationAuditEvents").collect(),
          outbox: await ctx.db.query("notificationOutbox").collect(),
          scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        }));
      const beforeRejected = await readProtectedState();
      expect(
        beforeRejected.organizations.filter(
          (organization) => organization.createdByUserId === seed.userId && !organization.isDeleted,
        ),
      ).toHaveLength(1);
      expect(beforeRejected.audits).toHaveLength(10);

      await expect(
        asUser.mutation(api.setup.mutations.createOrganization, {
          ...createArgs,
          sourceShopId: seed.shopId,
          requestId: "create-organization-daily-11",
        }),
      ).rejects.toThrow("組織の作成処理が進行中です。\n少し時間をおいてから、もう一度お試しください。");

      expect(await readProtectedState()).toEqual(beforeRejected);
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
  });
});
