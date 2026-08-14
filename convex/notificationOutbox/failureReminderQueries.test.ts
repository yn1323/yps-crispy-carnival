import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedCanonicalStaffLineRecipient, seedLegacyShopMembership, seedManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { DAY_MS, HOUR_MS } from "../constants";

async function insertFailure(
  ctx: MutationCtx,
  args: {
    shopId: Id<"shops">;
    status?: "open" | "retrying" | "resolved";
    lastFailedAt?: number;
    dedupeKey?: string;
    notificationContext?: string;
    recruitmentId?: Id<"recruitments">;
  },
) {
  const now = Date.now();
  const lastFailedAt = args.lastFailedAt ?? now;
  return await ctx.db.insert("notificationFailureInbox", {
    failureKey: `test:${args.dedupeKey ?? `${args.shopId}:${lastFailedAt}`}`,
    sourceType: "outbox",
    status: args.status ?? "open",
    shopId: args.shopId,
    ...(args.recruitmentId ? { recruitmentId: args.recruitmentId } : {}),
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
        const closed = await seedManagerShop(ctx, { subject: "closed_shop", shopName: "Closed" });
        await insertFailure(ctx, { shopId: open.shopId, status: "open" });
        await insertFailure(ctx, { shopId: retrying.shopId, status: "retrying" });
        await insertFailure(ctx, { shopId: resolved.shopId, status: "resolved" });
        const closedRecruitmentId = await ctx.db.insert("recruitments", {
          shopId: closed.shopId,
          periodStart: "2026-07-01",
          periodEnd: "2026-07-15",
          deadline: "2026-06-25",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await insertFailure(ctx, {
          shopId: closed.shopId,
          status: "open",
          recruitmentId: closedRecruitmentId,
        });
        return idsToStrings({
          openShopId: open.shopId,
          retryingShopId: retrying.shopId,
          resolvedShopId: resolved.shopId,
          closedShopId: closed.shopId,
        });
      });

      const result = await t.query(
        internal.notificationOutbox.failureReminderQueries.listShopIdsWithRecentOpenFailuresPage,
        { paginationOpts: { numItems: 10, cursor: null } },
      );

      expect(result.page.map(String)).toEqual([ids.openShopId]);
      expect(result.page.map(String)).not.toContain(ids.retryingShopId);
      expect(result.page.map(String)).not.toContain(ids.resolvedShopId);
      expect(result.page.map(String)).not.toContain(ids.closedShopId);
    });

    it("最新の失敗が24時間を超えた店舗は返さない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const recent = await seedManagerShop(ctx, { subject: "recent_shop", shopName: "Recent" });
        const stale = await seedManagerShop(ctx, { subject: "stale_shop", shopName: "Stale" });
        await insertFailure(ctx, {
          shopId: recent.shopId,
          lastFailedAt: Date.now() - DAY_MS + HOUR_MS,
        });
        await insertFailure(ctx, {
          shopId: stale.shopId,
          lastFailedAt: Date.now() - DAY_MS - HOUR_MS,
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

    it("募集終了済み失敗を挟んでも対応可能な店舗を欠落なくページングする", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const actionable = await seedManagerShop(ctx, { subject: "actionable_pagination_shop" });
        const olderActionable = await seedManagerShop(ctx, { subject: "older_actionable_pagination_shop" });
        const closed = await seedManagerShop(ctx, { subject: "closed_pagination_shop" });
        const closedRecruitmentId = await ctx.db.insert("recruitments", {
          shopId: closed.shopId,
          periodStart: "2026-07-01",
          periodEnd: "2026-07-15",
          deadline: "2026-06-25",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await insertFailure(ctx, {
          shopId: closed.shopId,
          recruitmentId: closedRecruitmentId,
          lastFailedAt: Date.now() - (3 * HOUR_MS) / 2,
        });
        await insertFailure(ctx, {
          shopId: actionable.shopId,
          lastFailedAt: Date.now() - HOUR_MS,
        });
        await insertFailure(ctx, {
          shopId: olderActionable.shopId,
          lastFailedAt: Date.now() - 2 * HOUR_MS,
        });
        return idsToStrings({
          actionableShopId: actionable.shopId,
          olderActionableShopId: olderActionable.shopId,
          closedShopId: closed.shopId,
        });
      });

      const first = await t.query(
        internal.notificationOutbox.failureReminderQueries.listShopIdsWithRecentOpenFailuresPage,
        { paginationOpts: { numItems: 1, cursor: null } },
      );

      expect(first.page.map(String)).toEqual([ids.olderActionableShopId]);
      expect(first.page.map(String)).not.toContain(ids.closedShopId);
      expect(first.isDone).toBe(false);

      const second = await t.query(
        internal.notificationOutbox.failureReminderQueries.listShopIdsWithRecentOpenFailuresPage,
        { paginationOpts: { numItems: 1, cursor: first.continueCursor } },
      );

      expect(second.page.map(String)).toEqual([ids.actionableShopId]);
      expect(second.page.map(String)).not.toContain(ids.closedShopId);
      expect(second.isDone).toBe(false);

      const last = await t.query(
        internal.notificationOutbox.failureReminderQueries.listShopIdsWithRecentOpenFailuresPage,
        { paginationOpts: { numItems: 1, cursor: second.continueCursor } },
      );

      expect(last.page).toEqual([]);
      expect(last.isDone).toBe(true);
    });

    it("古い失敗と24時間以内の失敗が混在する店舗は返す（最新失敗基準）", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const mixed = await seedManagerShop(ctx, { subject: "mixed_shop", shopName: "Mixed" });
        await insertFailure(ctx, {
          shopId: mixed.shopId,
          dedupeKey: "old",
          lastFailedAt: Date.now() - DAY_MS - HOUR_MS,
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
          organizationId: seeded.organizationId,
          organizationPersonId: seeded.personId,
          userId: seeded.userId,
          name: "管理スタッフ",
          email: "owner-line@example.com",
          emailNormalized: "owner-line@example.com",
          isDeleted: false,
        });
        await seedCanonicalStaffLineRecipient(ctx, {
          staffId: managerStaffId,
          lineUserId: "U_owner_line",
          following: true,
        });

        const secondUserId = await seedUser(ctx, "owner_email", "owner-email@example.com");
        await seedLegacyShopMembership(ctx, { shopId: seeded.shopId, userId: secondUserId });
        await ctx.db.insert("staffs", {
          shopId: seeded.shopId,
          userId: secondUserId,
          name: "メール通知管理者",
          email: "owner-email@example.com",
          emailNormalized: "owner-email@example.com",
          isDeleted: false,
        });
        await insertFailure(ctx, { shopId: seeded.shopId, status: "open" });
        return { shopId: seeded.shopId };
      });

      const result = await t.query(internal.notificationOutbox.failureReminderQueries.getFailureReminderTargetForShop, {
        shopId,
      });

      expect(result).toMatchObject({ shopId, shopName: "通知店舗" });
      expect(result).not.toBeNull();
      if (!result) return;
      const dashboardUrl = new URL(result.dashboardUrl);
      expect(dashboardUrl.pathname).toBe("/dashboard");
      expect([...dashboardUrl.searchParams.entries()]).toEqual([["shop", String(shopId)]]);
      expect(result?.recipients).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            email: "owner-line@example.com",
            lineUserId: "U_owner_line",
            lineFollowing: true,
            lineRecipient: expect.objectContaining({ lineUserId: "U_owner_line", following: true }),
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

    it("対象店舗のstaffではないactive管理者には送らない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "failure_manager_without_shop_staff",
          email: "manager-without-shop-staff@example.com",
        });
        await insertFailure(ctx, { shopId: seeded.shopId, status: "open" });
        return seeded.shopId;
      });

      await expect(
        t.query(internal.notificationOutbox.failureReminderQueries.getFailureReminderTargetForShop, { shopId }),
      ).resolves.toBeNull();
    });

    it("募集終了した不達しかない店舗は null を返す", async () => {
      const t = convexTest(schema, modules);
      const { closedShopId } = await t.run(async (ctx) => {
        const closed = await seedManagerShop(ctx, { subject: "closed_target" });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId: closed.shopId,
          periodStart: "2026-07-01",
          periodEnd: "2026-07-15",
          deadline: "2026-06-25",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await insertFailure(ctx, { shopId: closed.shopId, status: "open", recruitmentId });
        return { closedShopId: closed.shopId };
      });

      await expect(
        t.query(internal.notificationOutbox.failureReminderQueries.getFailureReminderTargetForShop, {
          shopId: closedShopId,
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
