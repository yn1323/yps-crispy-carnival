import type { WithoutSystemFields } from "convex/server";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { createMigrationHistoryTestWithMigrations } from "../_test/migrations.test-helper";

const pageSize = 2;

function legacyDocument<T>(document: unknown): T {
  return document as T;
}

describe("shop lifecycle legacy readiness", () => {
  it("監査actionの旧archive表現を全pageで種類別に数える", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert(
        "organizations",
        legacyDocument<WithoutSystemFields<Doc<"organizations">>>({
          name: "店舗ライフサイクルreadiness事業者",
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        }),
      );
      const shopId = await ctx.db.insert(
        "shops",
        legacyDocument<WithoutSystemFields<Doc<"shops">>>({
          organizationId,
          operatingStatus: "active",
          name: "店舗ライフサイクルreadiness店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
          regularClosedDays: [],
          isDeleted: false,
        }),
      );

      for (const [index, action] of [
        "organization.shop_archived",
        "organization.shop_reactivated",
        "organization.shop_deleted",
      ].entries()) {
        await ctx.db.insert("organizationAuditEvents", {
          organizationId,
          action,
          targetKind: "shop",
          targetId: shopId,
          occurredAt: now + index,
        });
      }
    });

    let auditCursor: string | null = null;
    const auditTotals = { shopArchivedActions: 0, shopReactivatedActions: 0 };
    let auditDone = false;
    while (!auditDone) {
      const result: {
        anomalies: { shopArchivedActions: number; shopReactivatedActions: number };
        continueCursor: string;
        isDone: boolean;
      } = await t.query(internal.narrowReadiness.queries.verifyOrganizationAuditShopLifecycle, {
        paginationOpts: { cursor: auditCursor, numItems: pageSize },
      });
      auditTotals.shopArchivedActions += result.anomalies.shopArchivedActions;
      auditTotals.shopReactivatedActions += result.anomalies.shopReactivatedActions;
      auditCursor = result.continueCursor;
      auditDone = result.isDone;
    }

    expect(auditTotals).toEqual({ shopArchivedActions: 1, shopReactivatedActions: 1 });
  });
});
