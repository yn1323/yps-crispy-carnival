import type { WithoutSystemFields } from "convex/server";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { createMigrationHistoryTestWithMigrations, runMigrationToCompletion } from "../_test/migrations.test-helper";

const migration = internal.migrations.m049_notification_outbox_shop_deleted_reason.migration;
const firstPage = { cursor: null, numItems: 100 };

describe("m049 notification outbox shop deletion reason", () => {
  it("旧shop_inactiveだけをshop_deletedへ置換し、再実行できる", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const insertOutbox = async (dedupeKey: string, cancelReason?: "shop_inactive" | "shop_deleted") =>
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "cancelled",
          dedupeKey,
          payload: {
            kind: "email",
            from: "sender@example.com",
            to: "recipient@example.com",
            subject: "migration test",
            html: "<p>migration test</p>",
            context: "m049.test",
          },
          attemptCount: 0,
          nextRunAt: now,
          cancelledAt: now,
          terminalAt: now,
          ...(cancelReason ? { cancelReason } : {}),
          createdAt: now,
          updatedAt: now,
        } as unknown as WithoutSystemFields<Doc<"notificationOutbox">>);
      return {
        legacyId: await insertOutbox("m049:legacy", "shop_inactive"),
        canonicalId: await insertOutbox("m049:canonical", "shop_deleted"),
        unrelatedId: await insertOutbox("m049:unrelated"),
      };
    });

    await expect(
      t.query(internal.narrowReadiness.queries.verifyNotificationOutbox, { paginationOpts: firstPage }),
    ).resolves.toMatchObject({ anomalies: { legacyShopInactiveCancelReason: 1 } });

    await runMigrationToCompletion(t, migration);
    const snapshot = async () =>
      await t.run(async (ctx) => ({
        legacy: await ctx.db.get(ids.legacyId),
        canonical: await ctx.db.get(ids.canonicalId),
        unrelated: await ctx.db.get(ids.unrelatedId),
      }));
    const migrated = await snapshot();
    expect(migrated.legacy?.cancelReason).toBe("shop_deleted");
    expect(migrated.canonical?.cancelReason).toBe("shop_deleted");
    expect(migrated.unrelated?.cancelReason).toBeUndefined();

    await runMigrationToCompletion(t, migration, { cursor: null });
    expect(await snapshot()).toEqual(migrated);
    await expect(
      t.query(internal.narrowReadiness.queries.verifyNotificationOutbox, { paginationOpts: firstPage }),
    ).resolves.toMatchObject({ anomalies: { legacyShopInactiveCancelReason: 0 } });
  });
});
