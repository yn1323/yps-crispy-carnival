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

    expect(staff?.legalTermsVersion).toBe("staff-terms-2026-05-09");
    expect(staff?.legalPrivacyVersion).toBe("staff-privacy-2026-05-09");
    expect(staff?.legalConsentMethod).toBe("staff_email_link");
    expect(events).toHaveLength(1);
    expect(events[0].method).toBe("staff_email_link");
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
});
