import type { PaginationOptions } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

function page(numItems: number, cursor: string | null = null): PaginationOptions {
  return { numItems, cursor };
}

describe("appOrganization/manageQueries", () => {
  it("canonical組織の概要だけを返し、別組織IDをfail closedにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, {
        subject: "manage_overview_actor",
        shopName: "対象店舗",
        plan: "business",
      });
      const foreign = await seedOrganizationManagerShop(ctx, {
        subject: "manage_overview_foreign",
        shopName: "別組織店舗",
        plan: "business",
      });
      await ctx.db.patch(actor.organizationId, { name: "対象組織" });
      return { actor, foreign };
    });
    const actor = t.withIdentity({ subject: "manage_overview_actor" });

    await expect(
      actor.query(api.appOrganization.manageQueries.getManageOverview, {
        organizationId: ids.actor.organizationId,
      }),
    ).resolves.toMatchObject({
      organizationId: ids.actor.organizationId,
      organizationName: "対象組織",
      memberStatus: "active",
      usage: { state: "business", shopUsage: { current: 1 } },
      shopCounts: { active: 1, archived: 0, planSuspended: 0, hasOverflow: false },
      capabilities: { canAddShop: true, canCreateOrganization: true },
    });
    await expect(
      actor.query(api.appOrganization.manageQueries.getManageOverview, {
        organizationId: ids.actor.organizationId,
        planIdVersion: 2,
      }),
    ).resolves.toMatchObject({
      usage: {
        state: "pro",
        currentPlan: "pro",
        peopleUsage: { max: 50 },
      },
    });
    await expect(
      actor.query(api.appOrganization.manageQueries.getBillingOverview, {
        organizationId: ids.actor.organizationId,
        planIdVersion: 2,
      }),
    ).resolves.toMatchObject({
      billing: {
        state: "pro",
        currentPlan: "pro",
        isComplimentary: false,
        peopleUsage: { max: 50 },
      },
    });
    await expect(
      actor.query(api.appOrganization.manageQueries.getManageOverview, {
        organizationId: ids.foreign.organizationId,
      }),
    ).rejects.toThrow("Not found");
    await expect(
      actor.query(api.appOrganization.manageQueries.getBillingOverview, {
        organizationId: ids.foreign.organizationId,
      }),
    ).rejects.toThrow("Not found");
  });

  it("readOnly所属は閲覧できるがwrite capabilityを公開しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, {
        subject: "manage_overview_read_only",
        plan: "pro",
      });
      await ctx.db.patch(actor.memberId, { status: "readOnly", updatedAt: Date.now() });
      return actor;
    });

    const overview = await t
      .withIdentity({ subject: "manage_overview_read_only" })
      .query(api.appOrganization.manageQueries.getManageOverview, {
        organizationId: ids.organizationId,
      });
    expect(overview.memberStatus).toBe("readOnly");
    expect(overview.capabilities).toMatchObject({
      canUpdateOrganizationName: false,
      canAddShop: false,
      canDeleteOrganization: false,
      canCreateOrganization: false,
    });
  });

  it("未承認の管理者招待は実利用数へ加えず、招待中件数として分離する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, {
        subject: "manage_usage_pending_invitation",
        plan: "free",
      });
      const now = Date.now();
      await ctx.db.insert("organizationInvitations", {
        organizationId: actor.organizationId,
        email: "pending-manager@example.com",
        emailNormalized: "pending-manager@example.com",
        invitedName: "招待中の管理者",
        tokenDigest: "manage-usage-pending-invitation",
        status: "issued",
        purpose: "managerAddition",
        inviterMemberId: actor.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 60_000,
        createdAt: now,
        updatedAt: now,
      });
      return actor;
    });

    const overview = await t
      .withIdentity({ subject: "manage_usage_pending_invitation" })
      .query(api.appOrganization.manageQueries.getManageOverview, {
        organizationId: ids.organizationId,
      });

    expect(overview.usage).toMatchObject({
      peopleUsage: { current: 1, max: 5, pendingInvitations: 1 },
      managerUsage: { current: 1, max: 2, pendingInvitations: 1 },
    });
  });

  it("上限超過中は実プランを維持したまま通常の管理操作を閉じる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, {
        subject: "manage_usage_over_limit",
        plan: "free",
      });
      for (let index = 0; index < 5; index += 1) {
        await seedStaff(ctx, {
          shopId: actor.shopId,
          name: `上限超過スタッフ${index}`,
          email: `manage-over-limit-${index}@example.com`,
        });
      }
      return actor;
    });

    const overview = await t
      .withIdentity({ subject: "manage_usage_over_limit" })
      .query(api.appOrganization.manageQueries.getManageOverview, {
        organizationId: ids.organizationId,
      });

    expect(overview.usage).toMatchObject({
      state: "free",
      currentPlan: "free",
      peopleUsage: { current: 6, max: 5 },
    });
    expect(overview.capabilities).toMatchObject({
      canUpdateOrganizationName: false,
      canAddShop: false,
      updateOrganizationNameDisabledReason: expect.stringContaining("プラン上限を超過"),
      addShopDisabledReason: expect.stringContaining("プラン上限を超過"),
      canDeleteOrganization: true,
    });
  });

  it("activeとarchivedをcursor paginationし、5件を超える店舗も欠落させない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, {
        subject: "manage_shops_pagination",
        shopName: "利用中 1",
        plan: "business",
      });
      for (let index = 2; index <= 4; index += 1) {
        await ctx.db.insert("shops", {
          organizationId: actor.organizationId,
          operatingStatus: "active",
          name: `利用中 ${index}`,
          submissionPattern: { kind: "dateOnly" },
          regularClosedDays: [],
          isDeleted: false,
        });
      }
      for (let index = 1; index <= 4; index += 1) {
        await ctx.db.insert("shops", {
          organizationId: actor.organizationId,
          operatingStatus: "archived",
          name: `アーカイブ ${index}`,
          submissionPattern: { kind: "dateOnly" },
          regularClosedDays: [],
          isDeleted: false,
        });
      }
      return actor;
    });
    const actor = t.withIdentity({ subject: "manage_shops_pagination" });

    const first = await actor.query(api.appOrganization.manageQueries.listOrganizationShops, {
      organizationId: ids.organizationId,
      status: "all",
      paginationOpts: page(3),
    });
    const second = await actor.query(api.appOrganization.manageQueries.listOrganizationShops, {
      organizationId: ids.organizationId,
      status: "all",
      paginationOpts: page(3, first.continueCursor),
    });
    const third = await actor.query(api.appOrganization.manageQueries.listOrganizationShops, {
      organizationId: ids.organizationId,
      status: "all",
      paginationOpts: page(3, second.continueCursor),
    });
    const all = [...first.page, ...second.page, ...third.page];
    expect(all).toHaveLength(8);
    expect(new Set(all.map((shop) => shop.shopId)).size).toBe(8);
    expect(third.isDone).toBe(true);

    const archived = await actor.query(api.appOrganization.manageQueries.listOrganizationShops, {
      organizationId: ids.organizationId,
      status: "archived",
      paginationOpts: page(10),
    });
    expect(archived.page).toHaveLength(4);
    expect(archived.page.every((shop) => shop.operatingStatus === "archived")).toBe(true);
  });
});
