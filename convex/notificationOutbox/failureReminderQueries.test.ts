import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedManagerShop, seedShopMembership, seedStaffLineAccount, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { HOUR_MS, NOTIFICATION_FAILURE_REMINDER_WINDOW_MS } from "../constants";

async function insertFailure(
  ctx: MutationCtx,
  args: {
    shopId: Id<"shops">;
    status?: "open" | "retrying" | "resolved";
    lastFailedAt?: number;
    dedupeKey?: string;
    notificationContext?: string;
  },
) {
  const now = Date.now();
  const lastFailedAt = args.lastFailedAt ?? now;
  return await ctx.db.insert("notificationFailureInbox", {
    failureKey: `test:${args.dedupeKey ?? `${args.shopId}:${lastFailedAt}`}`,
    sourceType: "outbox",
    status: args.status ?? "open",
    shopId: args.shopId,
    dedupeKey: args.dedupeKey ?? `email:test:${args.shopId}`,
    notificationContext: args.notificationContext ?? "notification.sendRecruitmentNotificationEmails",
    firstFailedAt: lastFailedAt,
    lastFailedAt,
    lastError: "boom",
    createdAt: now,
    updatedAt: now,
  });
}

describe("notificationOutbox/failureReminderQueries", () => {
  describe("listShopIdsWithRecentOpenFailuresPage", () => {
    it("open failure がある店舗だけを返す（retrying/resolved は除外）", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const open = await seedManagerShop(ctx, { subject: "open_shop", shopName: "Open" });
        const retrying = await seedManagerShop(ctx, { subject: "retrying_shop", shopName: "Retrying" });
        const resolved = await seedManagerShop(ctx, { subject: "resolved_shop", shopName: "Resolved" });
        await insertFailure(ctx, { shopId: open.shopId, status: "open" });
        await insertFailure(ctx, { shopId: retrying.shopId, status: "retrying" });
        await insertFailure(ctx, { shopId: resolved.shopId, status: "resolved" });
        return idsToStrings({
          openShopId: open.shopId,
          retryingShopId: retrying.shopId,
          resolvedShopId: resolved.shopId,
        });
      });

      const result = await t.query(
        internal.notificationOutbox.failureReminderQueries.listShopIdsWithRecentOpenFailuresPage,
        { paginationOpts: { numItems: 10, cursor: null } },
      );

      expect(result.page.map(String)).toEqual([ids.openShopId]);
      expect(result.page.map(String)).not.toContain(ids.retryingShopId);
      expect(result.page.map(String)).not.toContain(ids.resolvedShopId);
    });

    it("最新の失敗が3日を超えた店舗は返さない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const recent = await seedManagerShop(ctx, { subject: "recent_shop", shopName: "Recent" });
        const stale = await seedManagerShop(ctx, { subject: "stale_shop", shopName: "Stale" });
        await insertFailure(ctx, {
          shopId: recent.shopId,
          lastFailedAt: Date.now() - NOTIFICATION_FAILURE_REMINDER_WINDOW_MS + HOUR_MS,
        });
        await insertFailure(ctx, {
          shopId: stale.shopId,
          lastFailedAt: Date.now() - NOTIFICATION_FAILURE_REMINDER_WINDOW_MS - HOUR_MS,
        });
        return idsToStrings({ recentShopId: recent.shopId, staleShopId: stale.shopId });
      });

      const result = await t.query(
        internal.notificationOutbox.failureReminderQueries.listShopIdsWithRecentOpenFailuresPage,
        { paginationOpts: { numItems: 10, cursor: null } },
      );

      expect(result.page.map(String)).toEqual([ids.recentShopId]);
      expect(result.page.map(String)).not.toContain(ids.staleShopId);
    });

    it("種別「通知」(other) しかない店舗は返さない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const actionable = await seedManagerShop(ctx, { subject: "actionable_shop", shopName: "Actionable" });
        const otherKind = await seedManagerShop(ctx, { subject: "other_kind_shop", shopName: "OtherKind" });
        await insertFailure(ctx, { shopId: actionable.shopId, status: "open" });
        await insertFailure(ctx, { shopId: otherKind.shopId, status: "open", notificationContext: "test.email" });
        return idsToStrings({ actionableShopId: actionable.shopId, otherKindShopId: otherKind.shopId });
      });

      const result = await t.query(
        internal.notificationOutbox.failureReminderQueries.listShopIdsWithRecentOpenFailuresPage,
        { paginationOpts: { numItems: 10, cursor: null } },
      );

      expect(result.page.map(String)).toEqual([ids.actionableShopId]);
      expect(result.page.map(String)).not.toContain(ids.otherKindShopId);
    });

    it("古い失敗と3日以内の失敗が混在する店舗は返す（最新失敗基準）", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const mixed = await seedManagerShop(ctx, { subject: "mixed_shop", shopName: "Mixed" });
        await insertFailure(ctx, {
          shopId: mixed.shopId,
          dedupeKey: "old",
          lastFailedAt: Date.now() - NOTIFICATION_FAILURE_REMINDER_WINDOW_MS - HOUR_MS,
        });
        await insertFailure(ctx, {
          shopId: mixed.shopId,
          dedupeKey: "new",
          lastFailedAt: Date.now() - HOUR_MS,
        });
        return idsToStrings({ mixedShopId: mixed.shopId });
      });

      const result = await t.query(
        internal.notificationOutbox.failureReminderQueries.listShopIdsWithRecentOpenFailuresPage,
        { paginationOpts: { numItems: 10, cursor: null } },
      );

      expect(result.page.map(String)).toContain(ids.mixedShopId);
    });
  });

  describe("getFailureReminderTargetForShop", () => {
    it("open failure があると manager 受信者を返し、manager staff の LINE 連携を付与する", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "owner_line",
          email: "owner-line@example.com",
          shopName: "通知店舗",
        });
        const managerStaffId = await ctx.db.insert("staffs", {
          shopId: seeded.shopId,
          userId: seeded.userId,
          name: "管理スタッフ",
          email: "owner-line@example.com",
          emailNormalized: "owner-line@example.com",
          isDeleted: false,
        });
        await seedStaffLineAccount(ctx, {
          shopId: seeded.shopId,
          staffId: managerStaffId,
          lineUserId: "U_owner_line",
          following: true,
        });

        const secondUserId = await seedUser(ctx, "owner_email", "owner-email@example.com");
        await seedShopMembership(ctx, { shopId: seeded.shopId, userId: secondUserId });
        await insertFailure(ctx, { shopId: seeded.shopId, status: "open" });
        return { shopId: seeded.shopId };
      });

      const result = await t.query(internal.notificationOutbox.failureReminderQueries.getFailureReminderTargetForShop, {
        shopId,
      });

      expect(result).toMatchObject({ shopId, shopName: "通知店舗" });
      expect(result?.dashboardUrl).toMatch(/\/dashboard$/);
      expect(result?.recipients).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            email: "owner-line@example.com",
            lineUserId: "U_owner_line",
            lineFollowing: true,
          }),
          expect.objectContaining({ email: "owner-email@example.com" }),
        ]),
      );
    });

    it("種別「通知」(other) しかない店舗は null を返す", async () => {
      const t = convexTest(schema, modules);
      const { otherKindShopId } = await t.run(async (ctx) => {
        const otherKind = await seedManagerShop(ctx, { subject: "other_kind_target" });
        await insertFailure(ctx, { shopId: otherKind.shopId, status: "open", notificationContext: "test.email" });
        return { otherKindShopId: otherKind.shopId };
      });

      await expect(
        t.query(internal.notificationOutbox.failureReminderQueries.getFailureReminderTargetForShop, {
          shopId: otherKindShopId,
        }),
      ).resolves.toBeNull();
    });

    it("open failure がない店舗・削除済み店舗は null を返す", async () => {
      const t = convexTest(schema, modules);
      const { noFailureShopId, resolvedOnlyShopId, deletedShopId } = await t.run(async (ctx) => {
        const noFailure = await seedManagerShop(ctx, { subject: "no_failure" });

        const resolvedOnly = await seedManagerShop(ctx, { subject: "resolved_only" });
        await insertFailure(ctx, { shopId: resolvedOnly.shopId, status: "resolved" });

        const deleted = await seedManagerShop(ctx, { subject: "deleted_shop", shopDeleted: true });
        await insertFailure(ctx, { shopId: deleted.shopId, status: "open" });

        return {
          noFailureShopId: noFailure.shopId,
          resolvedOnlyShopId: resolvedOnly.shopId,
          deletedShopId: deleted.shopId,
        };
      });

      await expect(
        t.query(internal.notificationOutbox.failureReminderQueries.getFailureReminderTargetForShop, {
          shopId: noFailureShopId,
        }),
      ).resolves.toBeNull();
      await expect(
        t.query(internal.notificationOutbox.failureReminderQueries.getFailureReminderTargetForShop, {
          shopId: resolvedOnlyShopId,
        }),
      ).resolves.toBeNull();
      await expect(
        t.query(internal.notificationOutbox.failureReminderQueries.getFailureReminderTargetForShop, {
          shopId: deletedShopId,
        }),
      ).resolves.toBeNull();
    });
  });
});

function idsToStrings<T extends Record<string, unknown>>(ids: T) {
  return Object.fromEntries(Object.entries(ids).map(([key, value]) => [key, String(value)])) as {
    [K in keyof T]: string;
  };
}
