import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { createMigrationHistoryTestWithMigrations, runMigrationToCompletion } from "../_test/migrations.test-helper";

const migration = internal.migrations.m048_shops_unset_operating_status.migration;
const firstPage = { cursor: null, numItems: 100 };

async function seedOrganization(t: ReturnType<typeof createMigrationHistoryTestWithMigrations>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("organizations", {
      name: "店舗status移行確認事業者",
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("m048 shops operatingStatus removal", () => {
  it("activeだけを削除済み店舗を含めてunsetし、未設定値を保持して再実行できる", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const organizationId = await seedOrganization(t);
    const ids = await t.run(async (ctx) => {
      const activeShopId = await ctx.db.insert("shops", {
        organizationId,
        operatingStatus: "active",
        name: "移行対象店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const deletedActiveShopId = await ctx.db.insert("shops", {
        organizationId,
        operatingStatus: "active",
        name: "削除済み移行対象店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: true,
      });
      const unsetShopId = await ctx.db.insert("shops", {
        organizationId,
        name: "移行済み店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      return { activeShopId, deletedActiveShopId, unsetShopId };
    });

    await expect(
      t.query(internal.narrowReadiness.queries.verifyShops, { paginationOpts: firstPage }),
    ).resolves.toMatchObject({
      anomalies: { archivedOperatingStatus: 0, unknownOperatingStatus: 0 },
      observations: { operatingStatusPresent: 2 },
    });

    await runMigrationToCompletion(t, migration);

    const snapshot = async () =>
      await t.run(async (ctx) => ({
        activeShop: await ctx.db.get(ids.activeShopId),
        deletedActiveShop: await ctx.db.get(ids.deletedActiveShopId),
        unsetShop: await ctx.db.get(ids.unsetShopId),
      }));
    const migrated = await snapshot();
    expect(migrated.activeShop?.operatingStatus).toBeUndefined();
    expect(migrated.deletedActiveShop?.operatingStatus).toBeUndefined();
    expect(migrated.unsetShop?.operatingStatus).toBeUndefined();

    await runMigrationToCompletion(t, migration, { cursor: null });
    expect(await snapshot()).toEqual(migrated);
    await expect(
      t.query(internal.narrowReadiness.queries.verifyShops, { paginationOpts: firstPage }),
    ).resolves.toMatchObject({
      anomalies: { archivedOperatingStatus: 0, unknownOperatingStatus: 0 },
      observations: { operatingStatusPresent: 0 },
    });
  });

  it("archivedを削除状態へ変換せず停止し、同じbatchのactiveも更新しない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const organizationId = await seedOrganization(t);
    const ids = await t.run(async (ctx) => {
      const activeShopId = await ctx.db.insert("shops", {
        organizationId,
        operatingStatus: "active",
        name: "rollback確認店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const archivedShopId = await ctx.db.insert("shops", {
        organizationId,
        operatingStatus: "archived",
        name: "想定外アーカイブ店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      return { activeShopId, archivedShopId };
    });

    await expect(runMigrationToCompletion(t, migration)).rejects.toThrow(
      "shops_operating_status_removal:archived_not_allowed",
    );
    const result = await t.run(async (ctx) => ({
      activeShop: await ctx.db.get(ids.activeShopId),
      archivedShop: await ctx.db.get(ids.archivedShopId),
    }));
    expect(result.activeShop?.operatingStatus).toBe("active");
    expect(result.archivedShop).toMatchObject({ operatingStatus: "archived", isDeleted: false });
    await expect(
      t.query(internal.narrowReadiness.queries.verifyShops, { paginationOpts: firstPage }),
    ).resolves.toMatchObject({
      anomalies: { archivedOperatingStatus: 1, unknownOperatingStatus: 0 },
      observations: { operatingStatusPresent: 2 },
    });
  });

  it("未知のstatusを推測変換せず停止し、readinessでも別異常として数える", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const organizationId = await seedOrganization(t);
    const shopId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("shops", {
        organizationId,
        operatingStatus: "active",
        name: "未知status確認店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      await ctx.db.patch(id, { operatingStatus: "paused" as never });
      return id;
    });

    await expect(runMigrationToCompletion(t, migration)).rejects.toThrow(
      "shops_operating_status_removal:unknown_status",
    );
    expect((await t.run(async (ctx) => await ctx.db.get(shopId)))?.operatingStatus).toBe("paused");
    await expect(
      t.query(internal.narrowReadiness.queries.verifyShops, { paginationOpts: firstPage }),
    ).resolves.toMatchObject({
      anomalies: { archivedOperatingStatus: 0, unknownOperatingStatus: 1 },
      observations: { operatingStatusPresent: 1 },
    });
  });
});
