import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { createConvexTestWithMigrations, runMigrationToCompletion } from "../_test/migrations.test-helper";
import { seedOrganizationManagerShop } from "../_test/seed";

const migration = internal.migrations.m043_analytics_plan_ids_v2.migration;

describe("m043 analytics plan IDs v2 migration", () => {
  it("legacy sourceのproをstandard、businessをproへ変換し、v2へ上げる", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "m043_analytics" });
      const base = {
        schemaVersion: 1,
        occurredAt: 100,
        organizationId: seeded.organizationId,
        payloadVersion: 1,
        createdAt: 100,
      };
      const legacyPro = await ctx.db.insert("analyticsSourceEvents", {
        ...base,
        eventKey: "m043:legacy-pro",
        eventType: "organization.changed",
        payload: { kind: "organization", change: "updated", currentPlan: "pro" },
      });
      const legacyBusiness = await ctx.db.insert("analyticsSourceEvents", {
        ...base,
        eventKey: "m043:legacy-business",
        eventType: "plan.changed",
        payload: { kind: "plan", plan: "business", billingVersion: 1, effectiveAt: 100, statusDeltas: [] },
      });
      const noPlan = await ctx.db.insert("analyticsSourceEvents", {
        ...base,
        eventKey: "m043:no-plan",
        eventType: "shop.changed",
        shopId: seeded.shopId,
        payload: { kind: "shop", change: "updated" },
      });
      return { legacyBusiness, legacyPro, noPlan };
    });

    await runMigrationToCompletion(t, migration, { batchSize: 1 });

    const rows = await t.run(async (ctx) => ({
      legacyPro: await ctx.db.get(ids.legacyPro),
      legacyBusiness: await ctx.db.get(ids.legacyBusiness),
      noPlan: await ctx.db.get(ids.noPlan),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
    }));
    expect(rows.legacyPro).toMatchObject({
      schemaVersion: 2,
      payloadVersion: 2,
      payload: { kind: "organization", currentPlan: "standard" },
    });
    expect(rows.legacyBusiness).toMatchObject({
      schemaVersion: 2,
      payloadVersion: 2,
      payload: { kind: "plan", plan: "pro" },
    });
    expect(rows.noPlan).toMatchObject({ schemaVersion: 2, payloadVersion: 2 });
    expect(rows.conflicts).toEqual([]);
  });

  it("未知version、legacy standard、v2 businessを上書きせずconflictへ残す", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "m043_conflicts" });
      const insert = async (
        eventKey: string,
        schemaVersion: number,
        payloadVersion: number,
        plan: "standard" | "business",
      ) =>
        await ctx.db.insert("analyticsSourceEvents", {
          schemaVersion,
          eventKey,
          eventType: "plan.changed",
          occurredAt: 100,
          organizationId: seeded.organizationId,
          payloadVersion,
          payload: { kind: "plan", plan, billingVersion: 1, effectiveAt: 100, statusDeltas: [] },
          createdAt: 100,
        });
      return {
        unknown: await insert("m043:unknown", 3, 3, "business"),
        legacyStandard: await insert("m043:legacy-standard", 1, 1, "standard"),
        v2Business: await insert("m043:v2-business", 2, 2, "business"),
      };
    });

    await runMigrationToCompletion(t, migration, { batchSize: 10 });

    const snapshot = await t.run(async (ctx) => ({
      rows: await Promise.all(Object.values(ids).map((id) => ctx.db.get(id))),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
    }));
    expect(snapshot.rows.map((row) => [row?.schemaVersion, row?.payloadVersion]).sort()).toEqual(
      [
        [1, 1],
        [2, 2],
        [3, 3],
      ].sort(),
    );
    expect(snapshot.conflicts.map((conflict) => conflict.code).sort()).toEqual([
      "analytics_plan_ids_v2_canonical_plan_in_legacy_payload",
      "analytics_plan_ids_v2_legacy_plan_in_v2_payload",
      "analytics_plan_ids_v2_version_mismatch",
    ]);
    expect(snapshot.conflicts.every((conflict) => conflict.sourceType === "analyticsSourceEvent")).toBe(true);
  });
});
