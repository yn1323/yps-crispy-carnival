import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { createMigrationHistoryTestWithMigrations, runMigrationToCompletion } from "../_test/migrations.test-helper";

describe("m047 shop billing states cleanup", () => {
  it("canonical組織課金と一意に対応する旧rowだけを削除する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const now = 100;
      const createOrganization = async (name: string) =>
        await ctx.db.insert("organizations", { name, isDeleted: false, createdAt: now, updatedAt: now });
      const createShop = async (name: string, organizationId?: Awaited<ReturnType<typeof createOrganization>>) =>
        await ctx.db.insert("shops", {
          organizationId,
          operatingStatus: organizationId ? "active" : undefined,
          name,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
      const createLegacy = async (shopId: Awaited<ReturnType<typeof createShop>>) =>
        await ctx.db.insert("shopBillingStates", {
          shopId,
          planKey: "free",
          source: "system",
          createdAt: now,
          updatedAt: now,
        });
      const createCanonical = async (organizationId: Awaited<ReturnType<typeof createOrganization>>) =>
        await ctx.db.insert("organizationBillingStates", {
          organizationId,
          state: { kind: "complimentary", planIdVersion: 2, plan: "pro" },
          version: 1,
          createdAt: now,
          updatedAt: now,
        });

      const canonicalOrganizationId = await createOrganization("canonical");
      const canonicalShopId = await createShop("canonical", canonicalOrganizationId);
      await createCanonical(canonicalOrganizationId);
      const canonicalId = await createLegacy(canonicalShopId);

      const missingOrganizationShopId = await createShop("missing");
      const missingOrganizationId = await createLegacy(missingOrganizationShopId);

      const ambiguousOrganizationId = await createOrganization("ambiguous");
      const ambiguousShopId = await createShop("ambiguous", ambiguousOrganizationId);
      await createCanonical(ambiguousOrganizationId);
      await createCanonical(ambiguousOrganizationId);
      const ambiguousId = await createLegacy(ambiguousShopId);

      return { canonicalId, missingOrganizationId, ambiguousId };
    });

    await runMigrationToCompletion(t, internal.migrations.m047_shop_billing_states_cleanup.migration);
    const snapshot = await t.run(async (ctx) => ({
      canonical: await ctx.db.get(ids.canonicalId),
      missingOrganization: await ctx.db.get(ids.missingOrganizationId),
      ambiguous: await ctx.db.get(ids.ambiguousId),
      conflicts: (await ctx.db.query("organizationMigrationConflicts").collect()).map((row) => row.code).sort(),
    }));

    expect(snapshot.canonical).toBeNull();
    expect(snapshot.missingOrganization).not.toBeNull();
    expect(snapshot.ambiguous).not.toBeNull();
    expect(snapshot.conflicts).toEqual([
      "legacy_billing_ambiguous_canonical_billing_states",
      "legacy_billing_missing_organization_shop",
    ]);
  });
});
