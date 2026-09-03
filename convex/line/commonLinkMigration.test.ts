import type { WithoutSystemFields } from "convex/server";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { createMigrationHistoryTestWithMigrations, runMigrationToCompletion } from "../_test/migrations.test-helper";

async function seedLegacyLineScope(ctx: MutationCtx, suffix: string, lineUserId: string, following = true) {
  const now = Date.now();
  const organizationId = await ctx.db.insert("organizations", {
    name: `組織${suffix}`,
    billingEmail: `${suffix}@example.com`,
    billingEmailNormalized: `${suffix}@example.com`,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  });
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId,
    name: `人物${suffix}`,
    email: `${suffix}@example.com`,
    emailNormalized: `${suffix}@example.com`,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const shopId = await ctx.db.insert("shops", {
    organizationId,
    name: `店舗${suffix}`,
    regularClosedDays: [],
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
    isDeleted: false,
  });
  const staffId = await ctx.db.insert("staffs", {
    shopId,
    organizationId,
    organizationPersonId: personId,
    name: `スタッフ${suffix}`,
    email: `${suffix}@example.com`,
    emailNormalized: `${suffix}@example.com`,
    excludedFromShift: false,
    isDeleted: false,
  });
  const legacyAccountId = await ctx.db.insert("staffLineAccounts", {
    staffId,
    shopId,
    lineUserId,
    linkedAt: now,
    following,
    isDeleted: false,
  });
  return { legacyAccountId, organizationId, personId, shopId, staffId };
}

describe("m041 LINE common link backfill", () => {
  it("単店舗のactive legacy行を人物linkへ一対一変換し、別組織の同じLINEはproviderを共有する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => ({
      first: await seedLegacyLineScope(ctx, "first", "shared-line-user"),
      second: await seedLegacyLineScope(ctx, "second", "shared-line-user"),
    }));

    await runMigrationToCompletion(t, internal.migrations.m041_line_common_links.migration);

    const snapshot = async () =>
      await t.run(async (ctx) => ({
        providers: await ctx.db.query("lineProviderUsers").collect(),
        links: await ctx.db.query("organizationPersonLineLinks").collect(),
        firstPerson: await ctx.db.get(ids.first.personId),
        secondPerson: await ctx.db.get(ids.second.personId),
      }));
    const migrated = await snapshot();
    expect(migrated.providers).toHaveLength(1);
    expect(migrated.links).toHaveLength(2);
    expect(new Set(migrated.links.map((link) => link.lineProviderUserId))).toEqual(
      new Set([migrated.providers[0]._id]),
    );
    expect(migrated.links.map((link) => link.organizationId).sort()).toEqual(
      [ids.first.organizationId, ids.second.organizationId].sort(),
    );
    expect(migrated.firstPerson?.lineLinkGeneration).toBe(1);
    expect(migrated.secondPerson?.lineLinkGeneration).toBe(1);

    await runMigrationToCompletion(t, internal.migrations.m041_line_common_links.migration);
    const retried = await snapshot();
    expect(retried.providers).toHaveLength(1);
    expect(retried.links).toHaveLength(2);
  });

  it("deleted legacy行をcanonical linkへ復活させない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    await t.run(async (ctx) => {
      const ids = await seedLegacyLineScope(ctx, "deleted", "deleted-line-user");
      await ctx.db.patch(ids.legacyAccountId, { isDeleted: true, following: false });
    });

    await runMigrationToCompletion(t, internal.migrations.m041_line_common_links.migration);
    const state = await t.run(async (ctx) => ({
      providers: await ctx.db.query("lineProviderUsers").collect(),
      links: await ctx.db.query("organizationPersonLineLinks").collect(),
    }));
    expect(state).toEqual({ providers: [], links: [] });
  });

  it("削除済みstaffに残るactive legacy行を解除済みへ収束させてスキップする", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedLegacyLineScope(ctx, "deleted-staff", "deleted-staff-line-user");
      await ctx.db.patch(seeded.staffId, {
        organizationId: undefined,
        organizationPersonId: undefined,
        isDeleted: true,
      });
      return seeded;
    });

    await runMigrationToCompletion(t, internal.migrations.m041_line_common_links.migration);
    const state = await t.run(async (ctx) => ({
      legacy: await ctx.db.get(ids.legacyAccountId),
      providers: await ctx.db.query("lineProviderUsers").collect(),
      links: await ctx.db.query("organizationPersonLineLinks").collect(),
    }));
    expect(state.legacy).toMatchObject({ isDeleted: true, following: false });
    expect(state.providers).toEqual([]);
    expect(state.links).toEqual([]);
  });

  it("active staffのcanonical scope欠損はスキップせず停止する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedLegacyLineScope(ctx, "active-unscoped", "active-unscoped-line-user");
      await ctx.db.patch(seeded.staffId, {
        organizationId: undefined,
        organizationPersonId: undefined,
      });
      return seeded;
    });

    await expect(runMigrationToCompletion(t, internal.migrations.m041_line_common_links.migration)).rejects.toThrow(
      "line_common_link_migration:missing_canonical_staff_scope",
    );
    const state = await t.run(async (ctx) => ({
      legacy: await ctx.db.get(ids.legacyAccountId),
      providers: await ctx.db.query("lineProviderUsers").collect(),
      links: await ctx.db.query("organizationPersonLineLinks").collect(),
    }));
    expect(state.legacy).toMatchObject({ isDeleted: false, following: true });
    expect(state.providers).toEqual([]);
    expect(state.links).toEqual([]);
  });

  it("archived店舗のnondeleted所属履歴をactive membershipへ数えず変換する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const target = await t.run(async (ctx) => {
      const seeded = await seedLegacyLineScope(ctx, "active-with-history", "archived-history-line-user");
      const archivedShopId = await ctx.db.insert("shops", {
        organizationId: seeded.organizationId,
        operatingStatus: "archived",
        name: "旧archived店舗",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        isDeleted: false,
      } as unknown as WithoutSystemFields<Doc<"shops">>);
      await ctx.db.insert("staffs", {
        shopId: archivedShopId,
        organizationId: seeded.organizationId,
        organizationPersonId: seeded.personId,
        name: "停止所属",
        email: "archived-history@example.com",
        emailNormalized: "archived-history@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      return seeded;
    });

    await expect(
      runMigrationToCompletion(t, internal.migrations.m041_line_common_links.migration),
    ).resolves.toMatchObject({ isDone: true, state: "success" });
    const links = await t.run(async (ctx) => await ctx.db.query("organizationPersonLineLinks").collect());
    expect(links).toHaveLength(1);
    expect(links[0]?.organizationPersonId).toBe(target.personId);
  });

  it("同じ組織の別人物が同じLINEを所有する場合は推測せず停止する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    await t.run(async (ctx) => {
      const first = await seedLegacyLineScope(ctx, "owner", "conflicting-line-user");
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: first.organizationId,
        name: "別人物",
        email: "other-person@example.com",
        emailNormalized: "other-person@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: first.shopId,
        organizationId: first.organizationId,
        organizationPersonId: personId,
        name: "別人物",
        email: "other-person@example.com",
        emailNormalized: "other-person@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      await ctx.db.insert("staffLineAccounts", {
        staffId,
        shopId: first.shopId,
        lineUserId: "conflicting-line-user",
        linkedAt: now,
        following: true,
        isDeleted: false,
      });
    });

    await expect(runMigrationToCompletion(t, internal.migrations.m041_line_common_links.migration)).rejects.toThrow(
      /line_common_link_migration:/u,
    );
  });

  it("共有providerの同一friendship状態はlegacy行の処理順に依存せず最新証跡へmergeする", async () => {
    async function migrateInOrder(order: readonly ["older", "newer"] | readonly ["newer", "older"]) {
      const t = createMigrationHistoryTestWithMigrations();
      await t.run(async (ctx) => {
        for (const suffix of order) {
          const seeded = await seedLegacyLineScope(ctx, suffix, "shared-evidence-line-user", true);
          const isNewer = suffix === "newer";
          await ctx.db.patch(seeded.legacyAccountId, {
            linkedAt: isNewer ? 2_000 : 1_000,
            lastWebhookAt: isNewer ? 2_100 : 1_100,
            lastWebhookEventId: isNewer ? "event-newer" : "event-older",
            lastWebhookEventTimestamp: isNewer ? 2_000 : 1_000,
          });
        }
      });
      await runMigrationToCompletion(t, internal.migrations.m041_line_common_links.migration);
      return await t.run(async (ctx) => {
        const providers = await ctx.db.query("lineProviderUsers").collect();
        expect(providers).toHaveLength(1);
        const provider = providers[0];
        return {
          following: provider.following,
          friendshipObservedAt: provider.friendshipObservedAt,
          friendshipObservationSource: provider.friendshipObservationSource,
          lastWebhookAt: provider.lastWebhookAt,
          lastWebhookEventId: provider.lastWebhookEventId,
          lastWebhookEventTimestamp: provider.lastWebhookEventTimestamp,
        };
      });
    }

    const olderFirst = await migrateInOrder(["older", "newer"]);
    const newerFirst = await migrateInOrder(["newer", "older"]);
    expect(olderFirst).toEqual(newerFirst);
    expect(olderFirst).toEqual({
      following: true,
      friendshipObservedAt: 2_000,
      friendshipObservationSource: "webhook",
      lastWebhookAt: 2_100,
      lastWebhookEventId: "event-newer",
      lastWebhookEventTimestamp: 2_000,
    });
  });
});
