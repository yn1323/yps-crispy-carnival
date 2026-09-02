import type { WithoutSystemFields } from "convex/server";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { createMigrationHistoryTestWithMigrations, runMigrationToCompletion } from "../_test/migrations.test-helper";

const historicalComplimentaryBusinessState = () =>
  ({ kind: "complimentary", plan: "business" }) as unknown as Doc<"organizationBillingStates">["state"];

function legacyDocument<T>(document: unknown): T {
  return document as T;
}

describe("m028 shop billing Narrow preparation migration", () => {
  it("旧rowを削除せずcanonical対応の異常だけを記録し、再実行でconflictを重複させない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const createOrganization = async (name: string) =>
        await ctx.db.insert(
          "organizations",
          legacyDocument<WithoutSystemFields<Doc<"organizations">>>({
            name,
            isDeleted: false,
            createdAt: now,
            updatedAt: now,
          }),
        );
      const createShop = async (name: string, organizationId?: Awaited<ReturnType<typeof createOrganization>>) =>
        await ctx.db.insert(
          "shops",
          legacyDocument<WithoutSystemFields<Doc<"shops">>>({
            organizationId,
            operatingStatus: organizationId ? "active" : undefined,
            name,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
            regularClosedDays: [],
            isDeleted: false,
          }),
        );
      const createLegacyBilling = async (shopId: Awaited<ReturnType<typeof createShop>>) =>
        await ctx.db.insert("shopBillingStates", {
          shopId,
          planKey: "premium",
          source: "manual",
          createdAt: now,
          updatedAt: now,
        });
      const createCanonicalBilling = async (organizationId: Awaited<ReturnType<typeof createOrganization>>) =>
        await ctx.db.insert("organizationBillingStates", {
          organizationId,
          state: historicalComplimentaryBusinessState(),
          version: 1,
          createdAt: now,
          updatedAt: now,
        });

      const canonicalOrganizationId = await createOrganization("canonical");
      const canonicalShopId = await createShop("canonical", canonicalOrganizationId);
      await createCanonicalBilling(canonicalOrganizationId);
      const canonicalId = await createLegacyBilling(canonicalShopId);

      const legacyShopId = await createShop("legacy");
      const legacyId = await createLegacyBilling(legacyShopId);

      const ambiguousOrganizationId = await createOrganization("ambiguous");
      const ambiguousShopId = await createShop("ambiguous", ambiguousOrganizationId);
      await createCanonicalBilling(ambiguousOrganizationId);
      await createCanonicalBilling(ambiguousOrganizationId);
      const ambiguousId = await createLegacyBilling(ambiguousShopId);

      return { ambiguousId, canonicalId, legacyId };
    });

    const runMigration = async (reset = false) =>
      await runMigrationToCompletion(t, internal.migrations.m028_shop_billing_states_narrow_prep.migration, {
        batchSize: 1,
        cursor: null,
        ...(reset ? { reset: true } : {}),
      });
    expect((await runMigration()).processed).toBe(3);

    const snapshot = async () =>
      await t.run(async (ctx) => ({
        legacyRows: (await ctx.db.query("shopBillingStates").collect()).map((row) => row._id).sort(),
        conflicts: (await ctx.db.query("organizationMigrationConflicts").collect())
          .map((conflict) => conflict.code)
          .sort(),
      }));
    expect(await snapshot()).toEqual({
      legacyRows: [ids.ambiguousId, ids.canonicalId, ids.legacyId].sort(),
      conflicts: ["legacy_billing_ambiguous_canonical_billing_states", "legacy_billing_missing_organization_shop"],
    });

    const rerun = await t.mutation(internal.migrations.m028_shop_billing_states_narrow_prep.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
      reset: true,
    });
    expect(rerun.processed).toBe(3);
    expect((await snapshot()).legacyRows).toEqual([ids.ambiguousId, ids.canonicalId, ids.legacyId].sort());
    expect((await snapshot()).conflicts).toHaveLength(2);
  });
});
