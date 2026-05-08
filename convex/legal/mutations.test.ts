import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";

async function setupStaff(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const shopId = await ctx.db.insert("shops", {
      name: "テスト店舗",
      shiftStartTime: "09:00",
      shiftEndTime: "22:00",
      ownerId: "owner",
      isDeleted: false,
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "田中 太郎",
      email: "tanaka@example.com",
      isDeleted: false,
    });
    return { shopId, staffId };
  });
}

describe("legal/mutations", () => {
  it("スタッフ同意トークンは30日有効で発行される", async () => {
    const t = convexTest(schema, modules);
    const { shopId, staffId } = await setupStaff(t);
    const before = Date.now();

    const { token, expiresAt } = await t.mutation(internal.legal.mutations.createStaffConsentToken, {
      staffId,
      shopId,
    });

    expect(token).toBeTruthy();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 30 * 24 * 60 * 60 * 1000 - 1000);
  });

  it("スタッフ同意リンクで最新バージョンを保存する", async () => {
    const t = convexTest(schema, modules);
    const { shopId, staffId } = await setupStaff(t);
    const { token } = await t.mutation(internal.legal.mutations.createStaffConsentToken, { staffId, shopId });

    const result = await t.mutation(api.legal.mutations.acceptStaffLegalConsent, {
      token,
      acceptedLegal: true,
    });
    expect(result.status).toBe("ok");

    const [staff, events] = await t.run(async (ctx) => {
      const staff = await ctx.db.get(staffId);
      const events = await ctx.db
        .query("legalConsentEvents")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .collect();
      return [staff, events] as const;
    });

    expect(staff?.legalTermsConsentVersion).toBe("staff-terms-consent-2026-05-09");
    expect(staff?.legalPrivacyConsentVersion).toBe("staff-privacy-consent-2026-05-09");
    expect(staff?.legalTermsDocumentVersion).toBe("staff-terms-doc-2026-05-09");
    expect(staff?.legalPrivacyDocumentVersion).toBe("staff-privacy-doc-2026-05-09");
    expect(staff?.legalConsentMethod).toBe("staff_email_link");
    expect(events).toHaveLength(1);
    expect(events[0].method).toBe("staff_email_link");
    expect(events[0].termsConsentVersion).toBe("staff-terms-consent-2026-05-09");
    expect(events[0].privacyConsentVersion).toBe("staff-privacy-consent-2026-05-09");
    expect(events[0].termsDocumentVersion).toBe("staff-terms-doc-2026-05-09");
    expect(events[0].privacyDocumentVersion).toBe("staff-privacy-doc-2026-05-09");
  });

  it("期限切れトークンでは同意できない", async () => {
    const t = convexTest(schema, modules);
    const { shopId, staffId } = await setupStaff(t);
    const { token } = await t.mutation(internal.legal.mutations.createStaffConsentToken, {
      staffId,
      shopId,
      expiresAt: Date.now() - 1000,
    });

    const result = await t.mutation(api.legal.mutations.acceptStaffLegalConsent, {
      token,
      acceptedLegal: true,
    });

    expect(result.status).toBe("expired");
  });

  it("管理ユーザーの再同意を記録する", async () => {
    const t = convexTest(schema, modules);
    const { shopId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkId: "manager_1",
        name: "管理者",
        email: "manager@example.com",
        role: "manager",
        legalTermsConsentVersion: "old-terms",
        legalPrivacyConsentVersion: "old-privacy",
        legalTermsDocumentVersion: "old-terms-doc",
        legalPrivacyDocumentVersion: "old-privacy-doc",
        legalConsentedAt: Date.now() - 1000,
        legalConsentMethod: "manager_setup",
        isDeleted: false,
      });
      const shopId = await ctx.db.insert("shops", {
        name: "テスト店舗",
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
        ownerId: "manager_1",
        isDeleted: false,
      });
      return { shopId, userId };
    });

    const result = await t
      .withIdentity({ subject: "manager_1" })
      .mutation(api.legal.mutations.acceptManagerLegalConsent, { acceptedLegal: true });

    expect(result.status).toBe("ok");
    const [user, events] = await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      const events = await ctx.db
        .query("legalConsentEvents")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      return [user, events] as const;
    });

    expect(shopId).toBeDefined();
    expect(user?.legalTermsConsentVersion).toBe("manager-terms-consent-2026-05-09");
    expect(user?.legalPrivacyConsentVersion).toBe("manager-privacy-consent-2026-05-09");
    expect(user?.legalTermsDocumentVersion).toBe("manager-terms-doc-2026-05-09");
    expect(user?.legalPrivacyDocumentVersion).toBe("manager-privacy-doc-2026-05-09");
    expect(user?.legalConsentMethod).toBe("manager_reconsent");
    expect(events).toHaveLength(1);
    expect(events[0].shopId).toBe(shopId);
    expect(events[0].method).toBe("manager_reconsent");
  });

  it("管理ユーザーの再同意要否は同意要求版で判定する", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkId: "manager_current",
        name: "管理者",
        email: "manager@example.com",
        role: "manager",
        legalTermsConsentVersion: "manager-terms-consent-2026-05-09",
        legalPrivacyConsentVersion: "manager-privacy-consent-2026-05-09",
        legalTermsDocumentVersion: "manager-terms-doc-old",
        legalPrivacyDocumentVersion: "manager-privacy-doc-old",
        legalConsentedAt: Date.now() - 1000,
        legalConsentMethod: "manager_setup",
        isDeleted: false,
      });
      await ctx.db.insert("shops", {
        name: "テスト店舗",
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
        ownerId: "manager_current",
        isDeleted: false,
      });
      return userId;
    });

    const currentResult = await t
      .withIdentity({ subject: "manager_current" })
      .query(api.legal.queries.getManagerConsentStatus, {});
    expect(currentResult.required).toBe(false);

    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        legalTermsConsentVersion: "old-terms",
        legalPrivacyConsentVersion: "old-privacy",
      });
    });

    const oldConsentResult = await t
      .withIdentity({ subject: "manager_current" })
      .query(api.legal.queries.getManagerConsentStatus, {});
    expect(oldConsentResult.required).toBe(true);
  });
});
