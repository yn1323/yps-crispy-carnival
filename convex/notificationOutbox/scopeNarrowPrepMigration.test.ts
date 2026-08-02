import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createMigrationHistoryTestWithMigrations, runMigrationToCompletion } from "../_test/migrations.test-helper";
import { seedLegacyShop, seedShop } from "../_test/seed";

function createTest() {
  return createMigrationHistoryTestWithMigrations();
}

async function runM037(t: ReturnType<typeof createTest>, batchSize = 1) {
  return await runMigrationToCompletion(t, internal.migrations.m037_notification_outbox_scope_narrow_prep.migration, {
    batchSize,
    cursor: null,
  });
}

describe("notification outbox scope narrow prep migration", () => {
  it("店舗からorganizationIdを一意に導ける旧rowだけを補完し、矛盾scopeはconflictへ保持する", async () => {
    const t = createTest();
    const ids = await t.run(async (ctx) => {
      const canonicalShopId = await seedShop(ctx, "Outbox scope店舗A");
      const otherShopId = await seedShop(ctx, "Outbox scope店舗B");
      const canonicalShop = await ctx.db.get(canonicalShopId);
      const otherShop = await ctx.db.get(otherShopId);
      if (!canonicalShop?.organizationId || !otherShop?.organizationId) {
        throw new Error("canonical shop fixture is incomplete");
      }

      const legacyShopId = await seedLegacyShop(ctx, "organization未設定店舗");
      const danglingShopId = await seedLegacyShop(ctx, "削除済み店舗");
      await ctx.db.delete(danglingShopId);

      const now = Date.now();
      const danglingOrganizationId = await ctx.db.insert("organizations", {
        name: "削除済み事業者",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.delete(danglingOrganizationId);
      const shopWithDanglingOrganizationId = await ctx.db.insert("shops", {
        organizationId: danglingOrganizationId,
        operatingStatus: "active",
        name: "dangling事業者参照店舗",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        isDeleted: false,
      });

      const insertOutbox = async (
        suffix: string,
        scope: { shopId?: Id<"shops">; organizationId?: Id<"organizations"> },
      ) =>
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "pending",
          dedupeKey: `email:m037:${suffix}`,
          ...scope,
          purpose: "business",
          notificationContext: "notification.m037",
          deliverySuppressed: false,
          payload: {
            kind: "email",
            from: "sender@example.com",
            to: "recipient@example.com",
            subject: suffix,
            html: suffix,
            context: "notification.m037",
          },
          attemptCount: 0,
          nextRunAt: now,
          createdAt: now,
          updatedAt: now,
        });

      return {
        canonicalShopId,
        canonicalOrganizationId: canonicalShop.organizationId,
        backfillId: await insertOutbox("backfill", { shopId: canonicalShopId }),
        organizationOnlyId: await insertOutbox("organization-only", {
          organizationId: canonicalShop.organizationId,
        }),
        canonicalBothId: await insertOutbox("canonical-both", {
          shopId: canonicalShopId,
          organizationId: canonicalShop.organizationId,
        }),
        missingScopeId: await insertOutbox("missing-scope", {}),
        danglingOrganizationId: await insertOutbox("dangling-organization", {
          organizationId: danglingOrganizationId,
        }),
        danglingShopId: await insertOutbox("dangling-shop", { shopId: danglingShopId }),
        shopMissingOrganizationId: await insertOutbox("shop-missing-organization", { shopId: legacyShopId }),
        shopDanglingOrganizationId: await insertOutbox("shop-dangling-organization", {
          shopId: shopWithDanglingOrganizationId,
        }),
        mismatchId: await insertOutbox("mismatch", {
          shopId: canonicalShopId,
          organizationId: otherShop.organizationId,
        }),
      };
    });

    await expect(
      t.query(internal.narrowReadiness.queries.verifyNotificationOutbox, {
        paginationOpts: { cursor: null, numItems: 100 },
      }),
    ).resolves.toMatchObject({
      anomalies: {
        missingNotificationContext: 0,
        missingDeliverySuppressed: 0,
        missingPurpose: 0,
        missingOrganizationId: 5,
        missingScope: 1,
        danglingOrganizationId: 1,
        danglingShopId: 1,
        shopMissingOrganizationId: 1,
        shopDanglingOrganizationId: 1,
        shopOrganizationMismatch: 1,
      },
    });

    const progress = await runM037(t);
    expect(progress.processed).toBe(9);

    const snapshot = await scopeSnapshot(t);
    expect(snapshot.outbox.find((row) => row._id === ids.backfillId)).toMatchObject({
      shopId: ids.canonicalShopId,
      organizationId: ids.canonicalOrganizationId,
    });
    const organizationOnly = snapshot.outbox.find((row) => row._id === ids.organizationOnlyId);
    expect(organizationOnly).toBeDefined();
    expect(organizationOnly).toMatchObject({
      organizationId: ids.canonicalOrganizationId,
    });
    expect(organizationOnly?.shopId).toBeUndefined();
    expect(snapshot.outbox.find((row) => row._id === ids.canonicalBothId)).toMatchObject({
      organizationId: ids.canonicalOrganizationId,
    });

    const conflictsBySource = new Map<string, string[]>();
    for (const conflict of snapshot.conflicts) {
      const codes = conflictsBySource.get(conflict.sourceId) ?? [];
      codes.push(conflict.code);
      conflictsBySource.set(conflict.sourceId, codes.sort());
      expect(conflict.sourceType).toBe("notificationOutbox");
      expect(conflict.resolvedAt).toBeUndefined();
    }
    expect(Object.fromEntries(conflictsBySource)).toEqual({
      [ids.missingScopeId]: ["notification_outbox_missing_scope"],
      [ids.danglingOrganizationId]: ["notification_outbox_dangling_organization"],
      [ids.danglingShopId]: ["notification_outbox_dangling_shop"],
      [ids.shopMissingOrganizationId]: ["notification_outbox_shop_missing_organization"],
      [ids.shopDanglingOrganizationId]: ["notification_outbox_shop_dangling_organization"],
      [ids.mismatchId]: ["notification_outbox_shop_organization_mismatch"],
    });
    await expect(
      t.query(internal.narrowReadiness.queries.verifyOrganizationMigrationConflicts, {
        paginationOpts: { cursor: null, numItems: 100 },
      }),
    ).resolves.toMatchObject({ unresolvedRows: 6, unresolvedNotificationOutboxScopeRows: 6 });

    const beforeRerun = await scopeSnapshot(t);
    const rerun = await t.mutation(internal.migrations.m037_notification_outbox_scope_narrow_prep.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
      reset: true,
    });
    expect(rerun.processed).toBe(9);
    expect(await scopeSnapshot(t)).toEqual(beforeRerun);
  });

  it("conflict修復後の限定再実行で補完し、所有するconflictだけをresolveする", async () => {
    const t = createTest();
    const ids = await t.run(async (ctx) => {
      const canonicalShopId = await seedShop(ctx, "Outbox scope修復先");
      const canonicalShop = await ctx.db.get(canonicalShopId);
      if (!canonicalShop?.organizationId) throw new Error("canonical shop fixture is incomplete");
      const legacyShopId = await seedLegacyShop(ctx, "Outbox scope修復対象");
      const outboxId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "pending",
        dedupeKey: "email:m037:repair",
        shopId: legacyShopId,
        purpose: "business",
        notificationContext: "notification.m037",
        deliverySuppressed: false,
        payload: {
          kind: "email",
          from: "sender@example.com",
          to: "recipient@example.com",
          subject: "repair",
          html: "repair",
          context: "notification.m037",
        },
        attemptCount: 0,
        nextRunAt: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      const unrelatedConflictId = await ctx.db.insert("organizationMigrationConflicts", {
        sourceType: "notificationOutbox",
        sourceId: outboxId,
        code: "unrelated_conflict",
        createdAt: 1,
      });
      return {
        canonicalOrganizationId: canonicalShop.organizationId,
        legacyShopId,
        outboxId,
        unrelatedConflictId,
      };
    });

    await runM037(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.legacyShopId, { organizationId: ids.canonicalOrganizationId, operatingStatus: "active" });
    });
    await t.mutation(internal.migrations.m037_notification_outbox_scope_narrow_prep.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
      reset: true,
    });

    const snapshot = await scopeSnapshot(t);
    expect(snapshot.outbox.find((row) => row._id === ids.outboxId)).toMatchObject({
      organizationId: ids.canonicalOrganizationId,
    });
    const ownedConflict = snapshot.conflicts.find(
      (conflict) =>
        conflict.sourceId === ids.outboxId && conflict.code === "notification_outbox_shop_missing_organization",
    );
    expect(ownedConflict).toBeDefined();
    expect(ownedConflict?.resolvedAt).toEqual(expect.any(Number));
    expect(snapshot.conflicts.find((conflict) => conflict._id === ids.unrelatedConflictId)?.resolvedAt).toBeUndefined();
  });
});

async function scopeSnapshot(t: ReturnType<typeof createTest>) {
  return await t.run(async (ctx) => ({
    outbox: (await ctx.db.query("notificationOutbox").collect()).sort((a, b) => a._id.localeCompare(b._id)),
    conflicts: (await ctx.db.query("organizationMigrationConflicts").collect()).sort((a, b) =>
      a._id.localeCompare(b._id),
    ),
  }));
}
