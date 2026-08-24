import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { createConvexTestWithMigrations, runMigrationToCompletion } from "../_test/migrations.test-helper";

const migration = internal.migrations.m044_dashboard_announcement_plan_ids_v2.migration;

describe("m044 dashboard announcement plan IDs v2 migration", () => {
  it("comma targetをcanonical化し、plan指定なしは変更しない", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const base = {
        title: "migration",
        bodyHtml: "<p>migration</p>",
        displayDate: "2026-08-24",
        isPublished: true,
        isDeleted: false,
      };
      return {
        legacy: await ctx.db.insert("dashboardAnnouncements", {
          ...base,
          organizationPlan: " pro, business,pro ",
        }),
        stable: await ctx.db.insert("dashboardAnnouncements", { ...base, organizationPlan: "trial,free" }),
        noTargets: await ctx.db.insert("dashboardAnnouncements", base),
      };
    });

    await runMigrationToCompletion(t, migration, { batchSize: 1 });

    const rows = await t.run(async (ctx) => ({
      legacy: await ctx.db.get(ids.legacy),
      stable: await ctx.db.get(ids.stable),
      noTargets: await ctx.db.get(ids.noTargets),
    }));
    expect(rows.legacy).toMatchObject({ organizationPlan: "standard,pro", planIdVersion: 2 });
    expect(rows.stable).toMatchObject({ organizationPlan: "trial,free", planIdVersion: 2 });
    expect(rows.noTargets?.organizationPlan).toBeUndefined();
    expect(rows.noTargets?.planIdVersion).toBeUndefined();
  });

  it("unknown、unversioned standard、v2 businessをconflictにして上書きしない", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const insert = async (organizationPlan: string, planIdVersion?: 2) =>
        await ctx.db.insert("dashboardAnnouncements", {
          organizationPlan,
          ...(planIdVersion ? { planIdVersion } : {}),
          title: "migration conflict",
          bodyHtml: "<p>migration conflict</p>",
          displayDate: "2026-08-24",
          isPublished: true,
          isDeleted: false,
        });
      return {
        unknown: await insert("enterprise"),
        standard: await insert("standard"),
        v2Business: await insert("business", 2),
      };
    });

    await runMigrationToCompletion(t, migration, { batchSize: 10 });

    const snapshot = await t.run(async (ctx) => ({
      rows: await Promise.all(Object.values(ids).map((id) => ctx.db.get(id))),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
    }));
    expect(snapshot.rows.map((row) => row?.organizationPlan).sort()).toEqual(
      ["enterprise", "standard", "business"].sort(),
    );
    expect(snapshot.conflicts.map((conflict) => conflict.code).sort()).toEqual([
      "dashboard_announcement_plan_ids_v2_canonical_target_without_version",
      "dashboard_announcement_plan_ids_v2_legacy_target_with_version",
      "dashboard_announcement_plan_ids_v2_unknown_target",
    ]);
    expect(snapshot.conflicts.every((conflict) => conflict.sourceType === "dashboardAnnouncement")).toBe(true);
  });
});
