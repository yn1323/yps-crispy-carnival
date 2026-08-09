import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { modules, schema } from "./_test/setup.test-helper";

const DATES = {
  periodStart: "2037-04-07",
  periodEnd: "2037-04-13",
  deadline: "2037-04-06",
  dates: ["2037-04-07", "2037-04-08", "2037-04-09", "2037-04-10", "2037-04-11", "2037-04-12", "2037-04-13"],
};

describe("E2E testing helpers", () => {
  beforeEach(() => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://e2e-test.convex.cloud");
    vi.stubEnv("E2E_TESTING_DEPLOYMENT_URL", "https://e2e-test.convex.cloud");
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    vi.stubEnv("NOTIFICATION_DELIVERY_MODE", "dry-run");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("明示enableがないdeploymentでは破壊的helperを拒否する", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "");
    const t = convexTest(schema, modules);

    await expect(t.mutation(internal.testing.clearAllTables, {})).rejects.toThrow(
      "E2E testing helpers are disabled for this deployment.",
    );
  });

  it("許可URLと現在deploymentが一致しない場合もhelperを拒否する", async () => {
    vi.stubEnv("E2E_TESTING_DEPLOYMENT_URL", "https://another.convex.cloud");
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(internal.testing.seedNotificationSubmitScenario, {
        managerAuthTokenIdentifier: "issuer|mismatch",
        managerEmail: "mismatch@example.com",
        dates: DATES,
      }),
    ).rejects.toThrow("E2E testing helpers are disabled for this deployment.");
  });

  it("clearAllTablesは指定tableをbounded batchで削除する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        authTokenIdentifier: "issuer|clear",
        name: "Clear Target",
        email: "clear@example.com",
        emailNormalized: "clear@example.com",
        role: "manager",
        isDeleted: false,
      });
    });

    const result = await t.mutation(internal.testing.clearAllTables, { tableName: "users" });

    expect(result).toMatchObject({ cleared: ["users"], deleted: 1 });
  });

  it("通常manager seedはowner graphを再利用せず、通知をdry-runへ閉じる", async () => {
    const t = convexTest(schema, modules);
    const args = {
      managerAuthTokenIdentifier: "issuer|core-owner",
      managerEmail: "core-owner@example.com",
      dates: DATES,
    };

    const first = await t.mutation(internal.testing.seedNotificationSubmitScenario, args);
    const second = await t.mutation(internal.testing.seedNotificationSubmitScenario, args);
    const safety = await t.query(internal.testing.getE2EShopSafetyState, { shopId: second.shopId });
    const state = await t.run(async (ctx) => ({
      activeOrganizations: (await ctx.db.query("organizations").collect()).filter(
        (organization) => !organization.isDeleted,
      ),
      firstShop: await ctx.db.get(first.shopId),
      secondShop: await ctx.db.get(second.shopId),
    }));

    expect(safety).toEqual({ notificationDeliverySuppressed: true });
    expect(state.activeOrganizations).toHaveLength(1);
    expect(state.firstShop).toBeNull();
    expect(state.secondShop?.isDeleted).toBe(false);
  });

  it("resetは指定owner graphだけを回収する", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.testing.seedNotificationSubmitScenario, {
      managerAuthTokenIdentifier: "issuer|owner-a",
      managerEmail: "owner-a@example.com",
      dates: DATES,
    });
    const ownerB = await t.mutation(internal.testing.seedNotificationSubmitScenario, {
      managerAuthTokenIdentifier: "issuer|owner-b",
      managerEmail: "owner-b@example.com",
      dates: DATES,
    });

    await t.mutation(internal.testing.resetManagerScenarioData, {
      managerAuthTokenIdentifier: "issuer|owner-a",
    });

    const state = await t.run(async (ctx) => ({
      ownerA: await ctx.db
        .query("users")
        .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", "issuer|owner-a"))
        .unique(),
      ownerB: await ctx.db
        .query("users")
        .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", "issuer|owner-b"))
        .unique(),
      ownerBShop: await ctx.db.get(ownerB.shopId),
    }));
    expect(state.ownerA).toBeNull();
    expect(state.ownerB?.isDeleted).toBe(false);
    expect(state.ownerBShop?.isDeleted).toBe(false);
  });

  it("single actor tenant seedは2組織を再実行可能に作る", async () => {
    const t = convexTest(schema, modules);
    const args = {
      actorAManagerAuthTokenIdentifier: "issuer|tenant-a",
      actorAManagerEmail: "tenant-a@example.com",
      actorBManagerAuthTokenIdentifier: "issuer|tenant-marker-b",
      actorBManagerEmail: "tenant-marker-b@example.com",
      actorCManagerAuthTokenIdentifier: "issuer|tenant-marker-c",
    };

    await t.mutation(internal.testing.seedFreeManagerMultiOrganizationScenario, args);
    const second = await t.mutation(internal.testing.seedFreeManagerMultiOrganizationScenario, args);
    const state = await t.run(async (ctx) => ({
      organizations: (await ctx.db.query("organizations").collect()).filter((organization) => !organization.isDeleted),
      targetShop: await ctx.db.get(second.targetShopId),
      alternateShop: await ctx.db.get(second.alternateShopId),
    }));

    expect(state.organizations).toHaveLength(2);
    expect(state.targetShop?.organizationId).not.toBe(state.alternateShop?.organizationId);
  });

  it("capability helperは最新募集へ最小DTOのtokenを発行する", async () => {
    const t = convexTest(schema, modules);
    const managerEmail = "capability-owner@example.com";
    const seed = await t.mutation(internal.testing.seedOpenRecruitmentNotificationScenario, {
      managerAuthTokenIdentifier: "issuer|capability-owner",
      managerEmail,
      dates: DATES,
    });

    const created = await t.mutation(internal.testing.createMagicLinkTokenForLatestRecruitment, {
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: managerEmail,
      purpose: "submit",
    });
    const latest = await t.query(internal.testing.getLatestMagicLinkToken, {
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: managerEmail,
      purpose: "submit",
    });

    expect(Object.keys(created).sort()).toEqual(["recruitmentId", "staffId", "token"]);
    expect(latest).toMatchObject({
      token: created.token,
      recruitmentId: seed.recruitmentId,
      staffId: seed.staffId,
      usedAt: null,
    });
  });

  it("capability helperの失敗messageへemailを含めない", async () => {
    const t = convexTest(schema, modules);
    const missingEmail = "missing-person@example.com";

    let caught: unknown;
    try {
      await t.mutation(internal.testing.createMagicLinkTokenForLatestRecruitment, {
        staffEmail: missingEmail,
        purpose: "submit",
      });
    } catch (error) {
      caught = error;
    }

    expect(String(caught)).toContain("staff-not-found");
    expect(String(caught)).not.toContain(missingEmail);
  });

  it("recipient safety probeは個人情報を返さず抑止状態だけを返す", async () => {
    const t = convexTest(schema, modules);

    const result = await t.query(internal.testing.getE2ERecipientSafetyState, {
      email: "recipient@example.com",
    });

    expect(result).toEqual({ notificationDeliverySuppressed: true });
  });
});
