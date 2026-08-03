import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import { seedOrganizationManagerShop, testAuthTokenIdentifier } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const REQUEST_KEY = "a".repeat(64);
const OLD_EMAIL = "account-email-before@example.com";
const NEW_EMAIL = "account-email-after@example.com";

describe("account email mutations", () => {
  it("Clerk primaryをusers・全所属person・userId欠損staffへ同期し、再実行では副作用を増やさない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const first = await seedOrganizationManagerShop(ctx, {
        subject: "account_email_actor",
        email: OLD_EMAIL,
        plan: "pro",
      });
      const now = Date.now();
      const firstStaffId = await ctx.db.insert("staffs", {
        shopId: first.shopId,
        organizationId: first.organizationId,
        organizationPersonId: first.personId,
        name: "管理者",
        email: OLD_EMAIL,
        emailNormalized: OLD_EMAIL,
        isDeleted: false,
      });
      const deletedStaffId = await ctx.db.insert("staffs", {
        shopId: first.shopId,
        organizationId: first.organizationId,
        organizationPersonId: first.personId,
        userId: first.userId,
        name: "削除済み",
        email: OLD_EMAIL,
        emailNormalized: OLD_EMAIL,
        isDeleted: true,
      });
      const secondOrganizationId = await ctx.db.insert("organizations", {
        name: "第二グループ",
        billingEmail: OLD_EMAIL,
        billingEmailNormalized: OLD_EMAIL,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const secondPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: secondOrganizationId,
        userId: first.userId,
        name: "管理者",
        email: OLD_EMAIL,
        emailNormalized: OLD_EMAIL,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: secondOrganizationId,
        operatingStatus: "active",
        name: "第二店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const secondStaffId = await ctx.db.insert("staffs", {
        shopId: secondShopId,
        organizationId: secondOrganizationId,
        organizationPersonId: secondPersonId,
        userId: first.userId,
        name: "管理者",
        email: OLD_EMAIL,
        emailNormalized: OLD_EMAIL,
        isDeleted: false,
      });
      return {
        ...first,
        firstStaffId,
        deletedStaffId,
        secondOrganizationId,
        secondPersonId,
        secondStaffId,
      };
    });

    const first = await t.mutation(internal.accountEmail.mutations.syncPrimary, {
      authTokenIdentifier: testAuthTokenIdentifier("account_email_actor"),
      email: `  ${NEW_EMAIL.toUpperCase()}  `,
      requestKey: REQUEST_KEY,
    });
    const second = await t.mutation(internal.accountEmail.mutations.syncPrimary, {
      authTokenIdentifier: testAuthTokenIdentifier("account_email_actor"),
      email: NEW_EMAIL,
      requestKey: REQUEST_KEY,
    });

    expect(first).toEqual({ status: "synced", changed: true });
    expect(second).toEqual({ status: "synced", changed: false });
    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.userId),
      people: await Promise.all([ctx.db.get(ids.personId), ctx.db.get(ids.secondPersonId)]),
      staffs: await Promise.all([ctx.db.get(ids.firstStaffId), ctx.db.get(ids.secondStaffId)]),
      deletedStaff: await ctx.db.get(ids.deletedStaffId),
      organizations: await Promise.all([ctx.db.get(ids.organizationId), ctx.db.get(ids.secondOrganizationId)]),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.user).toMatchObject({ email: NEW_EMAIL, emailNormalized: NEW_EMAIL });
    expect(state.people).toEqual([
      expect.objectContaining({ email: NEW_EMAIL, emailNormalized: NEW_EMAIL }),
      expect.objectContaining({ email: NEW_EMAIL, emailNormalized: NEW_EMAIL }),
    ]);
    expect(state.staffs).toEqual([
      expect.objectContaining({ email: NEW_EMAIL, emailNormalized: NEW_EMAIL }),
      expect.objectContaining({ email: NEW_EMAIL, emailNormalized: NEW_EMAIL }),
    ]);
    expect(state.deletedStaff).toMatchObject({ email: OLD_EMAIL, emailNormalized: OLD_EMAIL });
    expect(state.organizations).toEqual([
      expect.objectContaining({ billingEmail: OLD_EMAIL }),
      expect.objectContaining({ billingEmail: OLD_EMAIL }),
    ]);
    expect(state.audits).toHaveLength(2);
    expect(state.audits.every((audit) => audit.action === "organization.account_email_synced")).toBe(true);
    expect(JSON.stringify(state.audits)).not.toContain(NEW_EMAIL);
    expect(state.scheduled).toHaveLength(2);
  });

  it("別personまたは別staffとの競合ではtransaction全体をrollbackする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "account_email_conflict",
        email: OLD_EMAIL,
        plan: "pro",
      });
      const now = Date.now();
      const actorStaffId = await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: base.personId,
        userId: base.userId,
        name: "管理者",
        email: OLD_EMAIL,
        emailNormalized: OLD_EMAIL,
        isDeleted: false,
      });
      await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "競合人物",
        email: NEW_EMAIL,
        emailNormalized: NEW_EMAIL,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, actorStaffId };
    });

    await expect(
      t.mutation(internal.accountEmail.mutations.syncPrimary, {
        authTokenIdentifier: testAuthTokenIdentifier("account_email_conflict"),
        email: NEW_EMAIL,
        requestKey: REQUEST_KEY,
      }),
    ).rejects.toThrow("このメールアドレスは、グループ内の別のユーザーが使用しています。");

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.userId),
      person: await ctx.db.get(ids.personId),
      staff: await ctx.db.get(ids.actorStaffId),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.user).toMatchObject({ email: OLD_EMAIL });
    expect(state.person).toMatchObject({ email: OLD_EMAIL });
    expect(state.staff).toMatchObject({ email: OLD_EMAIL });
    expect(state.audits).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });

  it("preflightは未認証と別personの重複を拒否する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "account_email_preflight",
        email: OLD_EMAIL,
        plan: "pro",
      });
      const now = Date.now();
      await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "競合人物",
        email: NEW_EMAIL,
        emailNormalized: NEW_EMAIL,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(t.mutation(api.accountEmail.mutations.preflight, { email: NEW_EMAIL })).rejects.toBeInstanceOf(
      ConvexError,
    );
    await expect(
      t.withIdentity({ subject: "account_email_preflight" }).mutation(api.accountEmail.mutations.preflight, {
        email: NEW_EMAIL,
      }),
    ).rejects.toThrow("このメールアドレスは、グループ内の別のユーザーが使用しています。");
  });
});
