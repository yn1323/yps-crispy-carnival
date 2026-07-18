import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { modules, schema } from "../_test/setup.test-helper";

describe("deletion cleanup backfill migrations", () => {
  it("m016とm017は決定的なrequest IDで一件だけ作り、削除済み親組織のshopをskipする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const activeOrganizationId = await seedOrganization(ctx, "有効組織", false);
      const deletedOrganizationId = await seedOrganization(ctx, "削除済み組織", true);
      const activeShopId = await seedShop(ctx, "有効店舗", false);
      const deletedStandaloneShopId = await seedShop(ctx, "削除済み単独店舗", true);
      const deletedActiveOrganizationShopId = await seedShop(ctx, "削除済み有効組織店舗", true, activeOrganizationId);
      const deletedParentShopId = await seedShop(ctx, "削除済み親組織店舗", true, deletedOrganizationId);
      return {
        activeOrganizationId,
        deletedOrganizationId,
        activeShopId,
        deletedStandaloneShopId,
        deletedActiveOrganizationShopId,
        deletedParentShopId,
      };
    });

    for (let run = 0; run < 2; run += 1) {
      await t.mutation(internal.migrations.m016_deleted_shops_enqueue_cleanup_jobs.migration, {
        cursor: null,
        dryRun: false,
      });
      await t.mutation(internal.migrations.m017_deleted_organizations_enqueue_cleanup_jobs.migration, {
        cursor: null,
        dryRun: false,
      });
    }

    const jobs = await t.run(async (ctx) => await ctx.db.query("deletionCleanupJobs").collect());
    expect(
      jobs
        .map(({ scope, shopId, organizationId, requestId, status, phase }) => ({
          scope,
          shopId,
          organizationId,
          requestId,
          status,
          phase,
        }))
        .sort((left, right) => left.requestId.localeCompare(right.requestId)),
    ).toEqual(
      [
        {
          scope: "shop",
          shopId: ids.deletedStandaloneShopId,
          organizationId: undefined,
          requestId: `migration:m016:${ids.deletedStandaloneShopId}`,
          status: "queued",
          phase: "shopCore",
        },
        {
          scope: "shop",
          shopId: ids.deletedActiveOrganizationShopId,
          organizationId: ids.activeOrganizationId,
          requestId: `migration:m016:${ids.deletedActiveOrganizationShopId}`,
          status: "queued",
          phase: "shopCore",
        },
        {
          scope: "organization",
          shopId: undefined,
          organizationId: ids.deletedOrganizationId,
          requestId: `migration:m017:${ids.deletedOrganizationId}`,
          status: "queued",
          phase: "organizationCore",
        },
      ].sort((left, right) => left.requestId.localeCompare(right.requestId)),
    );
    expect(jobs.some((job) => job.shopId === ids.activeShopId)).toBe(false);
    expect(jobs.some((job) => job.shopId === ids.deletedParentShopId)).toBe(false);
    expect(jobs.some((job) => job.organizationId === ids.activeOrganizationId && job.scope === "organization")).toBe(
      false,
    );
  });
});

async function seedOrganization(ctx: MutationCtx, name: string, isDeleted: boolean) {
  const now = Date.now();
  return await ctx.db.insert("organizations", {
    name,
    billingEmail: `${name}@example.com`,
    billingEmailNormalized: `${name}@example.com`,
    isDeleted,
    createdAt: now,
    updatedAt: now,
  });
}

async function seedShop(
  ctx: MutationCtx,
  name: string,
  isDeleted: boolean,
  organizationId?: Awaited<ReturnType<typeof seedOrganization>>,
) {
  return await ctx.db.insert("shops", {
    ...(organizationId ? { organizationId, operatingStatus: "active" as const } : {}),
    name,
    regularClosedDays: [],
    submissionPattern: { kind: "dateOnly" },
    isDeleted,
  });
}
