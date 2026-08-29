import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import {
  createMigrationHistoryTestWithMigrations,
  legacyStaffDocumentForMigrationHistory,
  runMigrationToCompletion,
} from "../_test/migrations.test-helper";
import { ensureDefaultPosition } from "../position/service";

describe("pre-2026-06 narrow preparation migrations", () => {
  it("users/staffsの派生メールを現行の正規化規則へ収束させ、再実行しても変えない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|legacy_email",
        name: "旧管理者",
        email: " Legacy-Manager@Example.COM ",
        role: "admin",
        isDeleted: false,
      });
      const staffId = await ctx.db.insert(
        "staffs",
        legacyStaffDocumentForMigrationHistory({
          shopId: await ctx.db.insert("shops", {
            name: "旧メール店舗",
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
            regularClosedDays: [],
            isDeleted: false,
          }),
          name: "旧スタッフ",
          email: " Legacy-Staff@Example.COM ",
          emailNormalized: "stale@example.com",
          isDeleted: false,
        }),
      );
      return { userId, staffId };
    });

    await runMigrationToCompletion(t, internal.migrations.m031_users_email_normalized_narrow_prep.migration);
    await runMigrationToCompletion(t, internal.migrations.m032_staffs_email_normalized_narrow_prep.migration);
    const migrated = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.userId),
      staff: await ctx.db.get(ids.staffId),
    }));
    expect(migrated.user?.emailNormalized).toBe("legacy-manager@example.com");
    expect(migrated.user?.role).toBe("admin");
    expect(migrated.staff?.emailNormalized).toBe("legacy-staff@example.com");

    await t.mutation(internal.migrations.m031_users_email_normalized_narrow_prep.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
      reset: true,
    });
    await t.mutation(internal.migrations.m032_staffs_email_normalized_narrow_prep.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
      reset: true,
    });
    expect(
      await t.run(async (ctx) => ({
        user: (await ctx.db.get(ids.userId))?.emailNormalized,
        userRole: (await ctx.db.get(ids.userId))?.role,
        staff: (await ctx.db.get(ids.staffId))?.emailNormalized,
      })),
    ).toEqual({ user: "legacy-manager@example.com", userRole: "admin", staff: "legacy-staff@example.com" });
  });

  it("firstSubmittedAt欠損だけをsubmittedAtで補完し、既存の初回時刻を保持する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const shopId = await ctx.db.insert("shops", {
        name: "初回提出移行店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const staffId = await ctx.db.insert(
        "staffs",
        legacyStaffDocumentForMigrationHistory({
          shopId,
          name: "提出スタッフ",
          email: "submit@example.com",
          emailNormalized: "submit@example.com",
          isDeleted: false,
        }),
      );
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-05-11",
        periodEnd: "2026-05-17",
        deadline: "2026-05-10",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
      });
      const legacyId = await ctx.db.insert("shiftSubmissions", { recruitmentId, staffId, submittedAt: 2000 });
      const canonicalId = await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId,
        firstSubmittedAt: 1000,
        submittedAt: 3000,
      });
      return { legacyId, canonicalId };
    });

    await runMigrationToCompletion(
      t,
      internal.migrations.m033_shift_submissions_first_submitted_at_narrow_prep.migration,
    );
    await t.mutation(internal.migrations.m033_shift_submissions_first_submitted_at_narrow_prep.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
      reset: true,
    });
    expect(
      await t.run(async (ctx) => ({
        legacy: (await ctx.db.get(ids.legacyId))?.firstSubmittedAt,
        canonical: (await ctx.db.get(ids.canonicalId))?.firstSubmittedAt,
      })),
    ).toEqual({ legacy: 2000, canonical: 1000 });
  });

  it("isDefaultを現行readerの選択結果へ明示化し、複数の明示trueは推測変更しない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const createShop = async (name: string) =>
        await ctx.db.insert("shops", {
          name,
          submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "18:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
      const fallbackShopId = await createShop("fallback店舗");
      const fallbackFirstId = await ctx.db.insert("positions", {
        shopId: fallbackShopId,
        name: "先頭",
        color: "#111111",
        sortOrder: 0,
        isDefault: false,
        isDeleted: false,
      });
      const fallbackSecondId = await ctx.db.insert("positions", {
        shopId: fallbackShopId,
        name: "二番目",
        color: "#222222",
        sortOrder: 1,
        isDeleted: false,
      });

      const explicitShopId = await createShop("explicit店舗");
      const explicitFirstId = await ctx.db.insert("positions", {
        shopId: explicitShopId,
        name: "先頭",
        color: "#333333",
        sortOrder: 0,
        isDeleted: false,
      });
      const explicitDefaultId = await ctx.db.insert("positions", {
        shopId: explicitShopId,
        name: "明示default",
        color: "#444444",
        sortOrder: 1,
        isDefault: true,
        isDeleted: false,
      });

      const duplicateShopId = await createShop("duplicate店舗");
      const duplicateFirstId = await ctx.db.insert("positions", {
        shopId: duplicateShopId,
        name: "default A",
        color: "#555555",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const duplicateSecondId = await ctx.db.insert("positions", {
        shopId: duplicateShopId,
        name: "default B",
        color: "#666666",
        sortOrder: 1,
        isDefault: true,
        isDeleted: false,
      });
      const deletedId = await ctx.db.insert("positions", {
        shopId: duplicateShopId,
        name: "削除済み",
        color: "#777777",
        sortOrder: 2,
        isDeleted: true,
      });
      return {
        fallbackFirstId,
        fallbackSecondId,
        explicitFirstId,
        explicitDefaultId,
        duplicateFirstId,
        duplicateSecondId,
        deletedId,
      };
    });

    await runMigrationToCompletion(t, internal.migrations.m034_positions_is_default_narrow_prep.migration);
    await t.mutation(internal.migrations.m034_positions_is_default_narrow_prep.migration, {
      batchSize: 10,
      cursor: null,
      dryRun: false,
      reset: true,
    });
    expect(
      await t.run(async (ctx) => {
        const entries = await Promise.all(
          Object.entries(ids).map(async ([key, id]) => [key, await ctx.db.get(id)] as const),
        );
        return Object.fromEntries(entries.map(([key, position]) => [key, position?.isDefault]));
      }),
    ).toEqual({
      fallbackFirstId: true,
      fallbackSecondId: false,
      explicitFirstId: false,
      explicitDefaultId: true,
      duplicateFirstId: true,
      duplicateSecondId: true,
      deletedId: false,
    });
  });

  it("ensureDefaultPositionはmigration完走前でも現行fallback先を明示defaultへ収束させる", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const state = await t.run(async (ctx) => {
      const shopId = await ctx.db.insert("shops", {
        name: "writer convergence店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const positionId = await ctx.db.insert("positions", {
        shopId,
        name: "旧default",
        color: "#123456",
        sortOrder: 0,
        isDefault: false,
        isDeleted: false,
      });
      const selectedId = await ensureDefaultPosition(ctx, shopId);
      return { positionId, selectedId, position: await ctx.db.get(positionId) };
    });
    expect(state.selectedId).toBe(state.positionId);
    expect(state.position?.isDefault).toBe(true);
  });

  it("accessKind欠損をsubmitだけへ補完し、明示viewを保持する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const shopId = await ctx.db.insert("shops", {
        name: "access kind移行店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const staffId = await ctx.db.insert(
        "staffs",
        legacyStaffDocumentForMigrationHistory({
          shopId,
          name: "access staff",
          email: "access@example.com",
          emailNormalized: "access@example.com",
          isDeleted: false,
        }),
      );
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-05-11",
        periodEnd: "2026-05-17",
        deadline: "2026-05-10",
        shopClosedDates: [],
        status: "confirmed",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
      });
      const legacyLinkId = await ctx.db.insert("magicLinks", {
        token: "legacy-submit-link",
        staffId,
        shopId,
        recruitmentId,
        expiresAt: Date.now() + 60_000,
      });
      const viewLinkId = await ctx.db.insert("magicLinks", {
        token: "canonical-view-link",
        staffId,
        shopId,
        recruitmentId,
        accessKind: "view",
        notificationOperationKey: "canonical-view-operation",
        expiresAt: Date.now() + 60_000,
      });
      const legacySessionId = await ctx.db.insert("sessions", {
        sessionToken: "legacy-submit-session",
        staffId,
        shopId,
        recruitmentId,
        expiresAt: Date.now() + 60_000,
      });
      const viewSessionId = await ctx.db.insert("sessions", {
        sessionToken: "canonical-view-session",
        staffId,
        shopId,
        recruitmentId,
        accessKind: "view",
        expiresAt: Date.now() + 60_000,
      });
      return { legacyLinkId, viewLinkId, legacySessionId, viewSessionId };
    });

    await runMigrationToCompletion(t, internal.migrations.m035_magic_links_access_kind_narrow_prep.migration);
    await runMigrationToCompletion(t, internal.migrations.m036_sessions_access_kind_narrow_prep.migration);
    await t.mutation(internal.migrations.m035_magic_links_access_kind_narrow_prep.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
      reset: true,
    });
    await t.mutation(internal.migrations.m036_sessions_access_kind_narrow_prep.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
      reset: true,
    });
    expect(
      await t.run(async (ctx) => ({
        legacyLink: (await ctx.db.get(ids.legacyLinkId))?.accessKind,
        viewLink: (await ctx.db.get(ids.viewLinkId))?.accessKind,
        viewNotificationOperationKey: (await ctx.db.get(ids.viewLinkId))?.notificationOperationKey,
        legacySession: (await ctx.db.get(ids.legacySessionId))?.accessKind,
        viewSession: (await ctx.db.get(ids.viewSessionId))?.accessKind,
      })),
    ).toEqual({
      legacyLink: "submit",
      viewLink: "view",
      viewNotificationOperationKey: "canonical-view-operation",
      legacySession: "submit",
      viewSession: "view",
    });
  });
});
