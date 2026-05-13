import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import { seedManagerShop, seedShop, seedStaffLineAccount } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getLegalConsentVersions } from "./documents";

async function setupStaff(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const shopId = await seedShop(ctx, "テスト店舗");
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
    const token = "staff-consent-token";
    await t.run(async (ctx) => {
      await ctx.db.insert("legalConsentTokens", {
        staffId,
        shopId,
        token,
        method: "staff_email_link",
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });
    });

    const result = await t.mutation(api.legal.mutations.acceptStaffLegalConsent, {
      token,
      acceptedLegal: true,
    });
    expect(result.status).toBe("ok");

    const [state, events] = await t.run(async (ctx) => {
      const state = await ctx.db
        .query("legalConsentStates")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .first();
      const events = await ctx.db
        .query("legalConsentEvents")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .collect();
      return [state, events] as const;
    });

    expect(state?.termsConsentVersion).toBe("staff-terms-consent-2026-05-09");
    expect(state?.privacyConsentVersion).toBe("staff-privacy-consent-2026-05-09");
    expect(state?.termsDocumentVersion).toBe("staff-terms-doc-2026-05-09");
    expect(state?.privacyDocumentVersion).toBe("staff-privacy-doc-2026-05-09");
    expect(state?.method).toBe("staff_email_link");
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
    const token = "expired-staff-consent-token";
    await t.run(async (ctx) => {
      await ctx.db.insert("legalConsentTokens", {
        staffId,
        shopId,
        token,
        method: "staff_email_link",
        expiresAt: Date.now() - 1000,
      });
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
      const { userId, shopId } = await seedManagerShop(ctx, {
        subject: "manager_1",
        email: "manager@example.com",
        shopName: "テスト店舗",
      });
      await ctx.db.insert("legalConsentStates", {
        subjectType: "user",
        userId,
        shopId,
        termsConsentVersion: "old-terms",
        privacyConsentVersion: "old-privacy",
        termsDocumentVersion: "old-terms-doc",
        privacyDocumentVersion: "old-privacy-doc",
        consentedAt: Date.now() - 1000,
        method: "manager_setup",
      });
      return { shopId, userId };
    });

    const result = await t
      .withIdentity({ subject: "manager_1" })
      .mutation(api.legal.mutations.acceptManagerLegalConsent, { acceptedLegal: true });

    expect(result.status).toBe("ok");
    const [state, events] = await t.run(async (ctx) => {
      const state = await ctx.db
        .query("legalConsentStates")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      const events = await ctx.db
        .query("legalConsentEvents")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      return [state, events] as const;
    });

    expect(shopId).toBeDefined();
    expect(state?.termsConsentVersion).toBe("manager-terms-consent-2026-05-09");
    expect(state?.privacyConsentVersion).toBe("manager-privacy-consent-2026-05-09");
    expect(state?.termsDocumentVersion).toBe("manager-terms-doc-2026-05-09");
    expect(state?.privacyDocumentVersion).toBe("manager-privacy-doc-2026-05-09");
    expect(state?.method).toBe("manager_reconsent");
    expect(events).toHaveLength(1);
    expect(events[0].shopId).toBe(shopId);
    expect(events[0].method).toBe("manager_reconsent");
  });

  it("管理ユーザーの再同意要否は同意要求版で判定する", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const { userId, shopId } = await seedManagerShop(ctx, {
        subject: "manager_current",
        email: "manager@example.com",
        shopName: "テスト店舗",
      });
      await ctx.db.insert("legalConsentStates", {
        subjectType: "user",
        userId,
        shopId,
        termsConsentVersion: "manager-terms-consent-2026-05-09",
        privacyConsentVersion: "manager-privacy-consent-2026-05-09",
        termsDocumentVersion: "manager-terms-doc-old",
        privacyDocumentVersion: "manager-privacy-doc-old",
        consentedAt: Date.now() - 1000,
        method: "manager_setup",
      });
      return userId;
    });

    const currentResult = await t
      .withIdentity({ subject: "manager_current" })
      .query(api.legal.queries.getManagerConsentStatus, {});
    expect(currentResult.required).toBe(false);

    await t.run(async (ctx) => {
      const state = await ctx.db
        .query("legalConsentStates")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      if (!state) throw new Error("missing state");
      await ctx.db.patch(state._id, { termsConsentVersion: "old-terms", privacyConsentVersion: "old-privacy" });
    });

    const oldConsentResult = await t
      .withIdentity({ subject: "manager_current" })
      .query(api.legal.queries.getManagerConsentStatus, {});
    expect(oldConsentResult.required).toBe(true);
  });

  it("同意済みスタッフには同意依頼通知データを返さない", async () => {
    const t = convexTest(schema, modules);
    const versions = getLegalConsentVersions("staff");
    const { staffId } = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "テスト店舗");
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "田中 太郎",
        email: "tanaka@example.com",
        isDeleted: false,
      });
      await seedStaffLineAccount(ctx, { staffId, shopId, lineUserId: "U_staff", following: true });
      await ctx.db.insert("legalConsentStates", {
        subjectType: "staff",
        staffId,
        shopId,
        termsConsentVersion: versions.termsConsentVersion,
        privacyConsentVersion: versions.privacyConsentVersion,
        termsDocumentVersion: versions.termsDocumentVersion,
        privacyDocumentVersion: versions.privacyDocumentVersion,
        consentedAt: Date.now() - 1000,
        method: "staff_email_link",
      });
      return { staffId };
    });

    const data = await t.query(internal.legal.queries.getStaffConsentNotificationDataInternal, { staffId });

    expect(data).toBeNull();

    const guideData = await t.query(internal.legal.queries.getStaffConsentNotificationDataInternal, {
      staffId,
      includeConsented: true,
    });

    expect(guideData).toMatchObject({
      staffId,
      staffName: "田中 太郎",
      staffEmail: "tanaka@example.com",
      lineUserId: "U_staff",
      lineFollowing: true,
      shopName: "テスト店舗",
    });
  });
});
