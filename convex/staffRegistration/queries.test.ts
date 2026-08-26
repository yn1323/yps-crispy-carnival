import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import {
  seedManagerShop,
  seedOrganizationManagerShop,
  seedOrganizationPersonLineLink,
  seedShop,
  seedUser,
} from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getLegalDocumentsForAudience } from "../legal/documents";

describe("staffRegistration/queries", () => {
  describe("getRegistrationPageData", () => {
    it("有効な登録tokenでは店舗名とスタッフ向け法務文書だけを返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "参加先店舗");
        await ctx.db.insert("shopRegistrationLinks", {
          shopId,
          token: "active-registration-token",
          createdAt: Date.now(),
        });
      });

      await expect(
        t.query(api.staffRegistration.queries.getRegistrationPageData, {
          token: "active-registration-token",
        }),
      ).resolves.toEqual({
        status: "ok",
        shopName: "参加先店舗",
        documents: getLegalDocumentsForAudience("staff"),
      });
    });

    it("同一tokenが異なる店舗に重複している場合は店舗情報を返さない", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        for (const index of [1, 2]) {
          const shopId = await seedShop(ctx, `重複登録token対象店舗${index}`);
          await ctx.db.insert("shopRegistrationLinks", {
            shopId,
            token: "duplicate-page-registration-token",
            createdAt: Date.now(),
          });
        }
      });

      await expect(
        t.query(api.staffRegistration.queries.getRegistrationPageData, {
          token: "duplicate-page-registration-token",
        }),
      ).resolves.toEqual({
        status: "expired",
        documents: getLegalDocumentsForAudience("staff"),
      });
    });

    it.each(["archived"] as const)("%s状態の店舗は登録ページに店舗情報を返さない", async (blockedState) => {
      const t = convexTest(schema, modules);
      const token = `blocked-registration-page-${blockedState}`;
      await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: `blocked_registration_page_${blockedState}`,
          plan: "pro",
        });
        await ctx.db.patch(seeded.shopId, { operatingStatus: blockedState });
        await ctx.db.insert("shopRegistrationLinks", {
          shopId: seeded.shopId,
          token,
          createdAt: Date.now(),
        });
      });

      await expect(t.query(api.staffRegistration.queries.getRegistrationPageData, { token })).resolves.toEqual({
        status: "expired",
        documents: getLegalDocumentsForAudience("staff"),
      });
    });

    it("存在しない・失効済みtokenと削除済み店舗はexpiredを返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const activeShopId = await seedShop(ctx, "有効店舗");
        const deletedShopId = await seedShop(ctx, "削除済み店舗");
        await ctx.db.patch(deletedShopId, { isDeleted: true });
        await ctx.db.insert("shopRegistrationLinks", {
          shopId: activeShopId,
          token: "revoked-registration-token",
          createdAt: Date.now(),
          revokedAt: Date.now(),
        });
        await ctx.db.insert("shopRegistrationLinks", {
          shopId: deletedShopId,
          token: "deleted-shop-registration-token",
          createdAt: Date.now(),
        });
      });

      for (const token of [
        "missing-registration-token",
        "revoked-registration-token",
        "deleted-shop-registration-token",
      ]) {
        await expect(t.query(api.staffRegistration.queries.getRegistrationPageData, { token })).resolves.toEqual({
          status: "expired",
          documents: getLegalDocumentsForAudience("staff"),
        });
      }
    });
  });

  describe("manager query", () => {
    it("自店舗の有効な登録linkだけを返し、未認証では返さない", async () => {
      const t = convexTest(schema, modules);
      const { ownShopId, ownLinkId, otherShopId } = await t.run(async (ctx) => {
        const own = await seedManagerShop(ctx, {
          subject: "registration_manager",
          email: "registration-manager@example.com",
          shopName: "自店舗",
        });
        const other = await seedManagerShop(ctx, {
          subject: "other_registration_manager",
          email: "other-registration-manager@example.com",
          shopName: "他店舗",
        });
        await ctx.db.insert("shopRegistrationLinks", {
          shopId: own.shopId,
          token: "revoked-own-token",
          createdAt: Date.now() - 1,
          revokedAt: Date.now(),
        });
        const ownLinkId = await ctx.db.insert("shopRegistrationLinks", {
          shopId: own.shopId,
          token: "active-own-token",
          createdAt: Date.now(),
        });
        await ctx.db.insert("shopRegistrationLinks", {
          shopId: other.shopId,
          token: "active-other-token",
          createdAt: Date.now(),
        });
        return { ownShopId: own.shopId, ownLinkId, otherShopId: other.shopId };
      });

      await expect(
        t.query(api.staffRegistration.queries.getActiveRegistrationLink, { shopId: ownShopId }),
      ).resolves.toBeNull();
      await expect(
        t
          .withIdentity({ subject: "registration_manager" })
          .query(api.staffRegistration.queries.getActiveRegistrationLink, { shopId: ownShopId }),
      ).resolves.toEqual({
        linkId: ownLinkId,
        token: "active-own-token",
        registrationUrl: expect.stringContaining("/staff/register?token=active-own-token"),
      });
      await expect(
        t
          .withIdentity({ subject: "registration_manager" })
          .query(api.staffRegistration.queries.getActiveRegistrationLink, { shopId: otherShopId }),
      ).resolves.toBeNull();
    });

    it("10件を超える失効履歴からactiveだけを返し、active重複時は情報を返さない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, activeLinkId } = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "registration_query_history_manager",
          email: "registration-query-history@example.com",
        });
        for (let index = 0; index < 12; index += 1) {
          await ctx.db.insert("shopRegistrationLinks", {
            shopId: seeded.shopId,
            token: `revoked-registration-query-link-${index}`,
            createdAt: index,
            revokedAt: index + 1,
          });
        }
        const activeLinkId = await ctx.db.insert("shopRegistrationLinks", {
          shopId: seeded.shopId,
          token: "active-registration-query-link",
          createdAt: Date.now(),
        });
        return { shopId: seeded.shopId, activeLinkId };
      });
      const asManager = t.withIdentity({ subject: "registration_query_history_manager" });

      await expect(
        asManager.query(api.staffRegistration.queries.getActiveRegistrationLink, { shopId }),
      ).resolves.toMatchObject({ linkId: activeLinkId, token: "active-registration-query-link" });

      await t.run(
        async (ctx) =>
          await ctx.db.insert("shopRegistrationLinks", {
            shopId,
            token: "duplicate-active-registration-query-link",
            createdAt: Date.now() + 1,
          }),
      );
      await expect(
        asManager.query(api.staffRegistration.queries.getActiveRegistrationLink, { shopId }),
      ).rejects.toThrow("登録リンクの状態を確認できません");
    });

    it("承認待ち申請は自店舗のpendingだけを最小DTOで返す", async () => {
      const t = convexTest(schema, modules);
      const ownShopId = await t.run(async (ctx) => {
        const own = await seedManagerShop(ctx, {
          subject: "pending_request_manager",
          email: "pending-request-manager@example.com",
          shopName: "申請確認店舗",
        });
        const otherShopId = await seedShop(ctx, "別店舗");
        const base = {
          termsConsentVersion: "terms-consent",
          privacyConsentVersion: "privacy-consent",
          termsDocumentVersion: "terms-document",
          privacyDocumentVersion: "privacy-document",
          consentedAt: Date.now(),
          createdAt: Date.now(),
        };
        await ctx.db.insert("staffRegistrationRequests", {
          ...base,
          shopId: own.shopId,
          name: "承認待ちスタッフ",
          email: "pending@example.com",
          emailNormalized: "pending@example.com",
          status: "pending",
        });
        await ctx.db.insert("staffRegistrationRequests", {
          ...base,
          shopId: own.shopId,
          name: "承認済みスタッフ",
          email: "approved@example.com",
          emailNormalized: "approved@example.com",
          status: "approved",
        });
        await ctx.db.insert("staffRegistrationRequests", {
          ...base,
          shopId: otherShopId,
          name: "別店舗スタッフ",
          email: "other@example.com",
          emailNormalized: "other@example.com",
          status: "pending",
        });
        return own.shopId;
      });

      const result = await t
        .withIdentity({ subject: "pending_request_manager" })
        .query(api.staffRegistration.queries.getPendingRequests, { shopId: ownShopId });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        _id: expect.any(String),
        name: "承認待ちスタッフ",
        email: "pending@example.com",
        createdAt: expect.any(Number),
        canApprove: true,
        approveDisabledReason: null,
      });
    });

    it("対象店舗の重複だけを承認不可にし、同じ人物の別稼働店舗所属は承認可能にする", async () => {
      const t = convexTest(schema, modules);
      const { targetShopId, activeOtherRequestId } = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: "registration_approval_visibility_manager",
          email: "registration-approval-visibility-manager@example.com",
          shopName: "申請対象店舗",
          complimentary: true,
        });
        const now = Date.now();
        const activeOtherShopId = await ctx.db.insert("shops", {
          organizationId: seeded.organizationId,
          operatingStatus: "active",
          name: "別の稼働店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        const archivedOtherShopId = await ctx.db.insert("shops", {
          organizationId: seeded.organizationId,
          operatingStatus: "archived",
          name: "別の終了店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });

        const createPerson = async (email: string) =>
          await ctx.db.insert("organizationPeople", {
            organizationId: seeded.organizationId,
            name: email,
            email,
            emailNormalized: email,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
        await createPerson("no-membership@example.com");
        const targetOnlyPersonId = await createPerson("target-only@example.com");
        const activeOtherPersonId = await createPerson("other-active@example.com");
        const archivedPersonId = await createPerson("other-archived@example.com");

        await ctx.db.insert("staffs", {
          shopId: seeded.shopId,
          organizationId: seeded.organizationId,
          organizationPersonId: targetOnlyPersonId,
          name: "対象店舗だけのスタッフ",
          email: "target-only@example.com",
          emailNormalized: "target-only@example.com",
          excludedFromShift: false,
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId: activeOtherShopId,
          organizationId: seeded.organizationId,
          organizationPersonId: activeOtherPersonId,
          name: "別の稼働店舗スタッフ",
          email: "other-active@example.com",
          emailNormalized: "other-active@example.com",
          excludedFromShift: false,
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId: archivedOtherShopId,
          organizationId: seeded.organizationId,
          organizationPersonId: archivedPersonId,
          name: "別の終了店舗スタッフ",
          email: "other-archived@example.com",
          emailNormalized: "other-archived@example.com",
          excludedFromShift: false,
          isDeleted: false,
        });

        const otherTenant = await seedOrganizationManagerShop(ctx, {
          subject: "registration_approval_visibility_other_tenant",
          email: "registration-approval-visibility-other@example.com",
          shopName: "別組織店舗",
          complimentary: true,
        });
        const otherTenantPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: otherTenant.organizationId,
          name: "別組織の同一メール人物",
          email: "cross-tenant@example.com",
          emailNormalized: "cross-tenant@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          shopId: otherTenant.shopId,
          organizationId: otherTenant.organizationId,
          organizationPersonId: otherTenantPersonId,
          name: "別組織スタッフ",
          email: "cross-tenant@example.com",
          emailNormalized: "cross-tenant@example.com",
          excludedFromShift: false,
          isDeleted: false,
        });

        const base = {
          shopId: seeded.shopId,
          termsConsentVersion: "terms-consent",
          privacyConsentVersion: "privacy-consent",
          termsDocumentVersion: "terms-document",
          privacyDocumentVersion: "privacy-document",
          consentedAt: now,
          createdAt: now,
          status: "pending" as const,
        };
        const requests = [
          { name: "新規人物", email: "new-person@example.com" },
          { name: "所属なし", email: "no-membership@example.com" },
          { name: "対象店舗だけ", email: "target-only@example.com" },
          { name: "別の稼働店舗", email: "other-active@example.com" },
          { name: "別の終了店舗", email: "other-archived@example.com" },
          { name: "別組織だけ", email: "cross-tenant@example.com" },
        ];
        const requestIds = new Map<string, string>();
        for (const request of requests) {
          const requestId = await ctx.db.insert("staffRegistrationRequests", {
            ...base,
            ...request,
            emailNormalized: request.email,
          });
          requestIds.set(request.name, requestId);
        }
        const activeOtherRequestId = requestIds.get("別の稼働店舗");
        if (!activeOtherRequestId) throw new Error("active other shop request fixture was not created");
        return { targetShopId: seeded.shopId, activeOtherRequestId };
      });

      const result = await t
        .withIdentity({ subject: "registration_approval_visibility_manager" })
        .query(api.staffRegistration.queries.getPendingRequests, { shopId: targetShopId });

      expect(
        result.map(({ _id, name, canApprove, approveDisabledReason }) => ({
          _id,
          name,
          canApprove,
          approveDisabledReason,
        })),
      ).toEqual([
        { _id: expect.any(String), name: "新規人物", canApprove: true, approveDisabledReason: null },
        { _id: expect.any(String), name: "所属なし", canApprove: true, approveDisabledReason: null },
        {
          _id: expect.any(String),
          name: "対象店舗だけ",
          canApprove: false,
          approveDisabledReason: "この申請は現在承認できません。不要な申請は却下できます。",
        },
        {
          _id: activeOtherRequestId,
          name: "別の稼働店舗",
          canApprove: true,
          approveDisabledReason: null,
        },
        { _id: expect.any(String), name: "別の終了店舗", canApprove: true, approveDisabledReason: null },
        { _id: expect.any(String), name: "別組織だけ", canApprove: true, approveDisabledReason: null },
      ]);
    });

    it("安全な削除済み人物と同じemailの申請は承認可能にする", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: "removed_registration_person",
          complimentary: true,
        });
        const now = Date.now();
        await ctx.db.insert("organizationPeople", {
          organizationId: seeded.organizationId,
          name: "削除済みスタッフ",
          email: "removed-registration@example.com",
          emailNormalized: "removed-registration@example.com",
          status: "removed",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffRegistrationRequests", {
          shopId: seeded.shopId,
          name: "削除済みスタッフ",
          email: "removed-registration@example.com",
          emailNormalized: "removed-registration@example.com",
          status: "pending",
          termsConsentVersion: "terms-consent",
          privacyConsentVersion: "privacy-consent",
          termsDocumentVersion: "terms-document",
          privacyDocumentVersion: "privacy-document",
          consentedAt: now,
          createdAt: now,
        });
        return seeded.shopId;
      });

      const result = await t
        .withIdentity({ subject: "removed_registration_person" })
        .query(api.staffRegistration.queries.getPendingRequests, { shopId });

      expect(result).toEqual([
        expect.objectContaining({
          name: "削除済みスタッフ",
          canApprove: true,
          approveDisabledReason: null,
        }),
      ]);
    });

    it.each([
      ["アカウント削除受付済み", "requested"],
      ["アカウント削除済み", "deleted"],
    ] as const)("%sの旧人物と同じemailの申請は新しい人物として承認可能にする", async (_label, userState) => {
      const t = convexTest(schema, modules);
      const { shopId, subject } = await t.run(async (ctx) => {
        const subject = `terminal_registration_person_${userState}`;
        const seeded = await seedOrganizationManagerShop(ctx, { subject, complimentary: true });
        const now = Date.now();
        const email = `terminal-registration-${userState}@example.com`;
        const userId = await seedUser(ctx, `${subject}_person`, email);
        await ctx.db.patch(
          userId,
          userState === "requested" ? { accountDeletionRequestedAt: now } : { isDeleted: true },
        );
        await ctx.db.insert("organizationPeople", {
          organizationId: seeded.organizationId,
          userId,
          name: "旧人物",
          email,
          emailNormalized: email,
          status: "removed",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffRegistrationRequests", {
          shopId: seeded.shopId,
          name: "再登録申請",
          email,
          emailNormalized: email,
          status: "pending",
          termsConsentVersion: "terms-consent",
          privacyConsentVersion: "privacy-consent",
          termsDocumentVersion: "terms-document",
          privacyDocumentVersion: "privacy-document",
          consentedAt: now,
          createdAt: now,
        });
        return { shopId: seeded.shopId, subject };
      });

      const result = await t.withIdentity({ subject }).query(api.staffRegistration.queries.getPendingRequests, {
        shopId,
      });
      expect(result).toEqual([
        expect.objectContaining({ name: "再登録申請", canApprove: true, approveDisabledReason: null }),
      ]);
    });

    it.each([
      ["activeな旧staffあり", "activeStaff"],
      ["activeな管理者所属あり", "activeManagerMembership"],
      ["activeなcanonical LINE連携あり", "activeCanonicalLine"],
    ] as const)("削除済み人物に%sの不整合がある申請は汎用理由で承認不可にする", async (_label, state) => {
      const t = convexTest(schema, modules);
      const { shopId, subject } = await t.run(async (ctx) => {
        const subject = `unsafe_removed_registration_${state}`;
        const seeded = await seedOrganizationManagerShop(ctx, { subject, complimentary: true });
        const now = Date.now();
        const email = `${state.toLowerCase()}@example.com`;
        const needsUser = state === "activeManagerMembership";
        const userId = needsUser ? await seedUser(ctx, `${subject}_person`, email) : undefined;
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: seeded.organizationId,
          ...(userId ? { userId } : {}),
          name: "状態不整合の削除済みスタッフ",
          email,
          emailNormalized: email,
          status: "removed",
          createdAt: now,
          updatedAt: now,
        });
        if (state === "activeStaff") {
          await ctx.db.insert("staffs", {
            shopId: seeded.shopId,
            organizationId: seeded.organizationId,
            organizationPersonId: personId,
            name: "残存staff",
            email,
            emailNormalized: email,
            isDeleted: false,
          });
        }
        if (state === "activeManagerMembership" && userId) {
          await ctx.db.insert("organizationMembers", {
            organizationId: seeded.organizationId,
            personId,
            userId,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
        }
        if (state === "activeCanonicalLine") {
          await seedOrganizationPersonLineLink(ctx, {
            organizationId: seeded.organizationId,
            organizationPersonId: personId,
            lineUserId: "U_unsafe_removed_registration",
          });
        }
        await ctx.db.insert("staffRegistrationRequests", {
          shopId: seeded.shopId,
          name: "状態不整合の削除済みスタッフ",
          email,
          emailNormalized: email,
          status: "pending",
          termsConsentVersion: "terms-consent",
          privacyConsentVersion: "privacy-consent",
          termsDocumentVersion: "terms-document",
          privacyDocumentVersion: "privacy-document",
          consentedAt: now,
          createdAt: now,
        });
        return { shopId: seeded.shopId, subject };
      });

      const result = await t.withIdentity({ subject }).query(api.staffRegistration.queries.getPendingRequests, {
        shopId,
      });

      expect(result).toEqual([
        expect.objectContaining({
          name: "状態不整合の削除済みスタッフ",
          canApprove: false,
          approveDisabledReason: "この申請は現在承認できません。不要な申請は却下できます。",
        }),
      ]);
    });

    it.each([
      ["canonical", true],
      ["legacy", false],
    ])("対象店舗に同emailの%s staffがいる申請は承認不可にする", async (_label, canonical) => {
      const t = convexTest(schema, modules);
      const { subject, shopId } = await t.run(async (ctx) => {
        const subject = `existing_registration_staff_${canonical ? "canonical" : "legacy"}`;
        const seeded = await seedOrganizationManagerShop(ctx, { subject, complimentary: true });
        const now = Date.now();
        const email = canonical ? "existing-registration@example.com" : "Legacy-Existing@Example.com";
        const emailNormalized = email.toLowerCase();
        const organizationPersonId = canonical
          ? await ctx.db.insert("organizationPeople", {
              organizationId: seeded.organizationId,
              name: "既存スタッフ",
              email,
              emailNormalized,
              status: "active",
              createdAt: now,
              updatedAt: now,
            })
          : undefined;
        await ctx.db.insert("staffs", {
          shopId: seeded.shopId,
          organizationId: seeded.organizationId,
          ...(organizationPersonId ? { organizationPersonId, emailNormalized } : {}),
          name: "既存スタッフ",
          email,
          excludedFromShift: false,
          isDeleted: false,
        });
        await ctx.db.insert("staffRegistrationRequests", {
          shopId: seeded.shopId,
          name: "承認待ちスタッフ",
          email: emailNormalized,
          emailNormalized,
          status: "pending",
          termsConsentVersion: "terms-consent",
          privacyConsentVersion: "privacy-consent",
          termsDocumentVersion: "terms-document",
          privacyDocumentVersion: "privacy-document",
          consentedAt: now,
          createdAt: now,
        });
        return { subject, shopId: seeded.shopId };
      });

      const result = await t.withIdentity({ subject }).query(api.staffRegistration.queries.getPendingRequests, {
        shopId,
      });

      expect(result).toEqual([
        expect.objectContaining({
          name: "承認待ちスタッフ",
          canApprove: false,
          approveDisabledReason: "この申請は現在承認できません。不要な申請は却下できます。",
        }),
      ]);
    });
  });
});
