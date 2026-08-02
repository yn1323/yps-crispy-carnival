import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { createMigrationHistoryTestWithMigrations, runMigrationToCompletion } from "../_test/migrations.test-helper";

describe("m030 notification fanout operations narrow preparation", () => {
  it("旧operationだけをsupersede=trueへ補完し、再実行しても値を変えない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const shopId = await ctx.db.insert("shops", {
        name: "fanout narrow店舗",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-08-01",
        periodEnd: "2026-08-02",
        deadline: "2026-07-31",
        shopClosedDates: [],
        status: "confirmed",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
      });
      const base = {
        kind: "confirmation" as const,
        purpose: "confirmation" as const,
        recruitmentId,
        shopId,
        targetStaffIds: [],
        cursor: 0,
        status: "completed" as const,
        dedupeSuffix: "confirm",
        createdAt: now,
        updatedAt: now,
      };
      const legacyId = await ctx.db.insert("notificationFanoutOperations", {
        operationKey: "fanout:narrow:legacy",
        ...base,
      });
      const supplementalId = await ctx.db.insert("notificationFanoutOperations", {
        operationKey: "fanout:narrow:supplemental",
        ...base,
        purpose: "confirmation_resend",
        supersedesActiveOperations: false,
        confirmationOperationKeyAtOrigin: null,
        recruitmentDraftSavedAtAtOrigin: null,
      });
      return { legacyId, supplementalId };
    });

    await runMigrationToCompletion(t, internal.migrations.m030_notification_fanout_operations_narrow_prep.migration);
    await t.mutation(internal.migrations.m030_notification_fanout_operations_narrow_prep.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
      reset: true,
    });

    const result = await t.run(async (ctx) => ({
      legacy: await ctx.db.get(ids.legacyId),
      supplemental: await ctx.db.get(ids.supplementalId),
    }));
    expect(result.legacy?.supersedesActiveOperations).toBe(true);
    expect(result.supplemental).toMatchObject({
      supersedesActiveOperations: false,
      confirmationOperationKeyAtOrigin: null,
      recruitmentDraftSavedAtAtOrigin: null,
    });
  });
});
