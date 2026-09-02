import type { WithoutSystemFields } from "convex/server";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { createMigrationHistoryTestWithMigrations, runMigrationToCompletion } from "../_test/migrations.test-helper";

function legacyDocument<T>(document: unknown): T {
  return document as T;
}

describe("recruitment fields Narrow preparation migrations", () => {
  it("旧募集と店舗を現行fallback値へ補完し、条件付きoptionalと既存値を保持して再実行できる", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert(
        "organizations",
        legacyDocument<WithoutSystemFields<Doc<"organizations">>>({
        name: "募集field移行事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        }),
      );
      const legacyShopId = await ctx.db.insert("shops", legacyDocument<WithoutSystemFields<Doc<"shops">>>({
        organizationId,
        name: "旧店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        isDeleted: false,
      }));
      const canonicalShopId = await ctx.db.insert("shops", {
        organizationId,
        name: "現行店舗",
        regularClosedDays: ["sun"],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        isDeleted: false,
      });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "移行対象スタッフ",
        email: "migration@example.com",
        emailNormalized: "migration@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: legacyShopId,
        organizationId,
        organizationPersonId: personId,
        name: "移行対象スタッフ",
        email: "migration@example.com",
        emailNormalized: "migration@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      const positionId = await ctx.db.insert("positions", {
        shopId: legacyShopId,
        name: "通常",
        color: "#123456",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const createRecruitment = async (fields: { shopClosedDates?: string[]; draftSavedAt?: number }) =>
        await ctx.db.insert("recruitments", legacyDocument<WithoutSystemFields<Doc<"recruitments">>>({
          shopId: legacyShopId,
          periodStart: "2026-08-03",
          periodEnd: "2026-08-09",
          deadline: "2026-08-02",
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "18:00" },
          ...fields,
        }));

      const legacyWithAssignmentsId = await createRecruitment({});
      const legacyWithoutAssignmentsId = await createRecruitment({});
      const canonicalRecruitmentId = await createRecruitment({
        shopClosedDates: ["2026-08-05"],
        draftSavedAt: 12345,
      });
      const firstAssignmentId = await ctx.db.insert("shiftAssignments", {
        recruitmentId: legacyWithAssignmentsId,
        staffId,
        date: "2026-08-03",
        startTime: "09:00",
        endTime: "12:00",
        positionId,
      });
      const secondAssignmentId = await ctx.db.insert("shiftAssignments", {
        recruitmentId: legacyWithAssignmentsId,
        staffId,
        date: "2026-08-04",
        startTime: "13:00",
        endTime: "18:00",
        positionId,
      });

      return {
        legacyShopId,
        canonicalShopId,
        legacyWithAssignmentsId,
        legacyWithoutAssignmentsId,
        canonicalRecruitmentId,
        firstAssignmentId,
        secondAssignmentId,
      };
    });

    await expect(
      t.query(internal.narrowReadiness.queries.verifyShops, {
        paginationOpts: { cursor: null, numItems: 100 },
      }),
    ).resolves.toMatchObject({ anomalies: { missingRegularClosedDays: 1 } });
    await expect(
      t.query(internal.narrowReadiness.queries.verifyRecruitments, {
        paginationOpts: { cursor: null, numItems: 100 },
      }),
    ).resolves.toMatchObject({
      anomalies: { missingShopClosedDates: 2, assignmentsWithoutDraftSavedAt: 1 },
    });

    const expectedDraftSavedAt = await t.run(async (ctx) => {
      const assignments = await Promise.all([ctx.db.get(ids.firstAssignmentId), ctx.db.get(ids.secondAssignmentId)]);
      return Math.max(...assignments.map((assignment) => assignment?._creationTime ?? Number.NEGATIVE_INFINITY));
    });

    await runMigrationToCompletion(t, internal.migrations.m038_recruitments_draft_saved_at_narrow_prep.migration);
    await runMigrationToCompletion(t, internal.migrations.m039_shops_regular_closed_days_narrow_prep.migration);
    await runMigrationToCompletion(t, internal.migrations.m040_recruitments_shop_closed_dates_narrow_prep.migration);

    const snapshot = async () =>
      await t.run(async (ctx) => ({
        legacyShop: await ctx.db.get(ids.legacyShopId),
        canonicalShop: await ctx.db.get(ids.canonicalShopId),
        legacyWithAssignments: await ctx.db.get(ids.legacyWithAssignmentsId),
        legacyWithoutAssignments: await ctx.db.get(ids.legacyWithoutAssignmentsId),
        canonicalRecruitment: await ctx.db.get(ids.canonicalRecruitmentId),
      }));
    const migrated = await snapshot();
    expect(migrated.legacyShop?.regularClosedDays).toEqual([]);
    expect(migrated.canonicalShop?.regularClosedDays).toEqual(["sun"]);
    expect(migrated.legacyWithAssignments).toMatchObject({
      draftSavedAt: expectedDraftSavedAt,
      shopClosedDates: [],
    });
    expect(migrated.legacyWithoutAssignments?.draftSavedAt).toBeUndefined();
    expect(migrated.legacyWithoutAssignments?.shopClosedDates).toEqual([]);
    expect(migrated.canonicalRecruitment).toMatchObject({
      draftSavedAt: 12345,
      shopClosedDates: ["2026-08-05"],
    });

    await t.mutation(internal.migrations.m038_recruitments_draft_saved_at_narrow_prep.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
      reset: true,
    });
    await t.mutation(internal.migrations.m039_shops_regular_closed_days_narrow_prep.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
      reset: true,
    });
    await t.mutation(internal.migrations.m040_recruitments_shop_closed_dates_narrow_prep.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
      reset: true,
    });
    expect(await snapshot()).toEqual(migrated);

    await expect(
      t.query(internal.narrowReadiness.queries.verifyShops, {
        paginationOpts: { cursor: null, numItems: 100 },
      }),
    ).resolves.toMatchObject({ anomalies: { missingRegularClosedDays: 0 } });
    await expect(
      t.query(internal.narrowReadiness.queries.verifyRecruitments, {
        paginationOpts: { cursor: null, numItems: 100 },
      }),
    ).resolves.toMatchObject({
      anomalies: { missingShopClosedDates: 0, assignmentsWithoutDraftSavedAt: 0 },
    });
  });
});
