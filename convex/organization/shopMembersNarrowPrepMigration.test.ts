import type { WithoutSystemFields } from "convex/server";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { createMigrationHistoryTestWithMigrations, runMigrationToCompletion } from "../_test/migrations.test-helper";

function legacyDocument<T>(document: unknown): T {
  return document as T;
}

describe("m029 shopMembers Narrow preparation migration", () => {
  it("canonical所属へ収束した旧rowだけ失効し、未移行rowと再実行結果を保全する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const createUser = async (suffix: string) =>
        await ctx.db.insert("users", {
          authTokenIdentifier: `https://convex.test|${suffix}`,
          name: suffix,
          email: `${suffix}@example.com`,
          emailNormalized: `${suffix}@example.com`,
          role: "manager",
          isDeleted: false,
        });
      const createShop = async (name: string, organizationId?: Id<"organizations">) =>
        await ctx.db.insert(
          "shops",
          legacyDocument<WithoutSystemFields<Doc<"shops">>>({
            ...(organizationId ? { organizationId, operatingStatus: "active" as const } : {}),
            name,
            submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
            regularClosedDays: [],
            isDeleted: false,
          }),
        );
      const createOrganization = async (name: string) =>
        await ctx.db.insert(
          "organizations",
          legacyDocument<WithoutSystemFields<Doc<"organizations">>>({
            name,
            isDeleted: false,
            createdAt: now,
            updatedAt: now,
          }),
        );
      const createLegacyMembership = async (userId: Id<"users">, shopId: Id<"shops">) =>
        await ctx.db.insert("shopMembers", { userId, shopId, role: "manager", isDeleted: false });

      const canonicalUserId = await createUser("canonical");
      const canonicalOrganizationId = await createOrganization("canonical");
      const canonicalShopId = await createShop("canonical", canonicalOrganizationId);
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: canonicalOrganizationId,
        userId: canonicalUserId,
        name: "canonical",
        email: "canonical@example.com",
        emailNormalized: "canonical@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: canonicalOrganizationId,
        personId,
        userId: canonicalUserId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const removableId = await createLegacyMembership(canonicalUserId, canonicalShopId);

      const ambiguousUserId = await createUser("ambiguous");
      const ambiguousOrganizationId = await createOrganization("ambiguous");
      const ambiguousShopId = await createShop("ambiguous", ambiguousOrganizationId);
      const ambiguousPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: ambiguousOrganizationId,
        userId: ambiguousUserId,
        name: "ambiguous",
        email: "ambiguous@example.com",
        emailNormalized: "ambiguous@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      for (let index = 0; index < 2; index += 1) {
        await ctx.db.insert("organizationMembers", {
          organizationId: ambiguousOrganizationId,
          personId: ambiguousPersonId,
          userId: ambiguousUserId,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
      }
      const ambiguousId = await createLegacyMembership(ambiguousUserId, ambiguousShopId);

      const legacyUserId = await createUser("legacy");
      const legacyShopId = await createShop("legacy");
      const preservedId = await createLegacyMembership(legacyUserId, legacyShopId);
      return { ambiguousId, preservedId, removableId };
    });

    const runMigration = async (reset = false) =>
      await runMigrationToCompletion(t, internal.migrations.m029_shop_members_narrow_prep.migration, {
        batchSize: 1,
        cursor: null,
        ...(reset ? { reset: true } : {}),
      });
    expect((await runMigration()).processed).toBe(3);

    const snapshot = async () =>
      await t.run(async (ctx) => {
        const unresolvedConflicts = await ctx.db
          .query("organizationMigrationConflicts")
          .filter((q) => q.eq(q.field("resolvedAt"), undefined))
          .collect();
        return {
          ambiguous: await ctx.db.get(ids.ambiguousId),
          preserved: await ctx.db.get(ids.preservedId),
          removable: await ctx.db.get(ids.removableId),
          unresolvedConflictKeys: unresolvedConflicts.map((conflict) => `${conflict.sourceId}:${conflict.code}`).sort(),
        };
      });
    const first = await snapshot();
    expect(first.removable?.isDeleted).toBe(true);
    expect(first.ambiguous?.isDeleted).toBe(false);
    expect(first.preserved?.isDeleted).toBe(false);
    expect(first.unresolvedConflictKeys).toEqual(
      [
        `${ids.ambiguousId}:active_legacy_membership_ambiguous_canonical_member`,
        `${ids.preservedId}:active_legacy_membership_missing_organization_shop`,
      ].sort(),
    );

    const rerun = await t.mutation(internal.migrations.m029_shop_members_narrow_prep.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
      reset: true,
    });
    expect(rerun.processed).toBe(3);
    expect(await snapshot()).toEqual(first);
  });

  it("m026再実行はm014所有の未解消conflictを完了扱いにしない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|owned_conflict",
        name: "管理者",
        email: "owned-conflict@example.com",
        emailNormalized: "owned-conflict@example.com",
        role: "manager",
        isDeleted: false,
      });
      const organizationId = await ctx.db.insert(
        "organizations",
        legacyDocument<WithoutSystemFields<Doc<"organizations">>>({
          name: "事業者",
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
          name: "店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        }),
      );
      const shopMemberId = await ctx.db.insert("shopMembers", {
        userId,
        shopId,
        role: "manager",
        isDeleted: false,
      });
      const foreignConflictId = await ctx.db.insert("organizationMigrationConflicts", {
        organizationId,
        sourceType: "shopMember",
        sourceId: shopMemberId,
        code: "removed_member_legacy_membership_ambiguous_canonical_member",
        createdAt: now,
      });
      return { foreignConflictId };
    });

    await runMigrationToCompletion(t, internal.migrations.m026_shop_members_narrow_prep.migration);

    const foreignConflict = await t.run(async (ctx) => await ctx.db.get(ids.foreignConflictId));
    expect(foreignConflict).not.toBeNull();
    expect(foreignConflict?.resolvedAt).toBeUndefined();
  });
});
