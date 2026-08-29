import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedStaff } from "../_test/scenarioBuilders";
import {
  seedCanonicalStaffLineRecipient,
  seedLegacyShopMembership,
  seedManagerShop,
  seedShop,
  seedStaffLineAccount,
  seedUser,
} from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { DAY_MS, HOUR_MS } from "../constants";

async function insertPendingRequest(
  ctx: MutationCtx,
  args: { shopId: Id<"shops">; status?: "pending" | "approved" | "rejected"; email?: string; createdAt?: number },
) {
  const email = args.email ?? `${args.status ?? "pending"}@example.com`;
  return await ctx.db.insert("staffRegistrationRequests", {
    shopId: args.shopId,
    name: "申請スタッフ",
    email,
    emailNormalized: email,
    status: args.status ?? "pending",
    termsConsentVersion: "terms-v1",
    privacyConsentVersion: "privacy-v1",
    termsDocumentVersion: "terms-doc-v1",
    privacyDocumentVersion: "privacy-doc-v1",
    consentedAt: Date.now(),
    createdAt: args.createdAt ?? Date.now(),
  });
}

async function insertCanonicalManagerStaff(
  ctx: MutationCtx,
  args: {
    shopId: Id<"shops">;
    organizationId: Id<"organizations">;
    personId: Id<"organizationPeople">;
    userId: Id<"users">;
    email: string;
    isDeleted?: boolean;
  },
) {
  return await ctx.db.insert("staffs", {
    shopId: args.shopId,
    organizationId: args.organizationId,
    organizationPersonId: args.personId,
    userId: args.userId,
    name: "管理スタッフ",
    email: args.email,
    emailNormalized: args.email,
    isDeleted: args.isDeleted ?? false,
  });
}

describe("staffRegistration/notificationQueries", () => {
  describe("listPendingRequestShopIdsPage", () => {
    it("pending申請がある店舗だけを返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const pending = await seedManagerShop(ctx, { subject: "pending_shop", shopName: "Pending" });
        const approved = await seedManagerShop(ctx, { subject: "approved_shop", shopName: "Approved" });
        const rejected = await seedManagerShop(ctx, { subject: "rejected_shop", shopName: "Rejected" });
        await insertPendingRequest(ctx, { shopId: pending.shopId, status: "pending" });
        await insertPendingRequest(ctx, { shopId: approved.shopId, status: "approved" });
        await insertPendingRequest(ctx, { shopId: rejected.shopId, status: "rejected" });
        return idsToStrings({
          pendingShopId: pending.shopId,
          approvedShopId: approved.shopId,
          rejectedShopId: rejected.shopId,
        });
      });

      const result = await t.query(internal.staffRegistration.notificationQueries.listPendingRequestShopIdsPage, {
        paginationOpts: { numItems: 10, cursor: null },
      });

      expect(result.page.map(String)).toEqual([ids.pendingShopId]);
      expect(result.page.map(String)).not.toContain(ids.approvedShopId);
      expect(result.page.map(String)).not.toContain(ids.rejectedShopId);
    });

    it("最新のpending申請が24時間を超えた店舗は返さない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const recent = await seedManagerShop(ctx, { subject: "recent_shop", shopName: "Recent" });
        const stale = await seedManagerShop(ctx, { subject: "stale_shop", shopName: "Stale" });
        await insertPendingRequest(ctx, {
          shopId: recent.shopId,
          createdAt: Date.now() - DAY_MS + HOUR_MS,
        });
        await insertPendingRequest(ctx, {
          shopId: stale.shopId,
          createdAt: Date.now() - DAY_MS - HOUR_MS,
        });
        return idsToStrings({ recentShopId: recent.shopId, staleShopId: stale.shopId });
      });

      const result = await t.query(internal.staffRegistration.notificationQueries.listPendingRequestShopIdsPage, {
        paginationOpts: { numItems: 10, cursor: null },
      });

      expect(result.page.map(String)).toEqual([ids.recentShopId]);
      expect(result.page.map(String)).not.toContain(ids.staleShopId);
    });

    it("24時間超の申請と24時間以内の申請が混在する店舗は返す（最新申請基準）", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const mixed = await seedManagerShop(ctx, { subject: "mixed_shop", shopName: "Mixed" });
        await insertPendingRequest(ctx, {
          shopId: mixed.shopId,
          email: "old@example.com",
          createdAt: Date.now() - DAY_MS - HOUR_MS,
        });
        await insertPendingRequest(ctx, {
          shopId: mixed.shopId,
          email: "new@example.com",
          createdAt: Date.now() - HOUR_MS,
        });
        return idsToStrings({ mixedShopId: mixed.shopId });
      });

      const result = await t.query(internal.staffRegistration.notificationQueries.listPendingRequestShopIdsPage, {
        paginationOpts: { numItems: 10, cursor: null },
      });

      expect(result.page.map(String)).toEqual([ids.mixedShopId]);
    });
  });

  describe("getOwnerDigestTargetForShop", () => {
    it("canonical管理者はpersonの連絡先を使い、personのないlegacy管理者は通知対象にしない", async () => {
      const t = convexTest(schema, modules);
      const { organizationId, shopId } = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "owner_line",
          email: "owner-login@example.com",
          shopName: "通知店舗",
        });
        await ctx.db.patch(seeded.userId, { name: "ログイン表示名" });
        await ctx.db.patch(seeded.personId, {
          name: "シフト連絡先名",
          email: "owner-contact@example.com",
          emailNormalized: "owner-contact@example.com",
        });
        const managerStaffId = await ctx.db.insert("staffs", {
          shopId: seeded.shopId,
          organizationId: seeded.organizationId,
          organizationPersonId: seeded.personId,
          name: "管理スタッフ",
          email: "owner-contact@example.com",
          emailNormalized: "owner-contact@example.com",
          isDeleted: false,
        });
        await seedCanonicalStaffLineRecipient(ctx, {
          staffId: managerStaffId,
          lineUserId: "U_owner_line",
          following: true,
        });

        const secondUserId = await seedUser(ctx, "owner_email", "owner-email@example.com");
        await seedLegacyShopMembership(ctx, { shopId: seeded.shopId, userId: secondUserId });
        await insertPendingRequest(ctx, { shopId: seeded.shopId, status: "pending" });
        return { organizationId: seeded.organizationId, shopId: seeded.shopId };
      });

      const result = await t.query(internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop, {
        shopId,
      });

      expect(result).toMatchObject({
        shopId,
        shopName: "通知店舗",
      });
      expect(result).not.toBeNull();
      if (!result) return;
      const dashboardUrl = new URL(result.dashboardUrl);
      expect(dashboardUrl.pathname).toBe("/dashboard");
      expect([...dashboardUrl.searchParams.entries()]).toEqual([
        ["org", String(organizationId)],
        ["shop", String(shopId)],
      ]);
      expect(
        result.recipients
          .map(({ name, email, lineUserId, lineFollowing }) => ({ name, email, lineUserId, lineFollowing }))
          .sort((left, right) => left.email.localeCompare(right.email)),
      ).toEqual([
        {
          name: "シフト連絡先名",
          email: "owner-contact@example.com",
          lineUserId: "U_owner_line",
          lineFollowing: true,
        },
      ]);
    });

    it("person作成後でorganizationMember作成前の管理者もperson連絡先とLINEを使う", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "owner_partial_person",
          email: "owner-login@example.com",
          shopName: "移行途中店舗",
        });
        await ctx.db.delete(seeded.memberId);
        await seedLegacyShopMembership(ctx, { shopId: seeded.shopId, userId: seeded.userId });
        await ctx.db.patch(seeded.personId, {
          name: "移行途中連絡先",
          email: "owner-contact@example.com",
          emailNormalized: "owner-contact@example.com",
        });
        const staffId = await ctx.db.insert("staffs", {
          shopId: seeded.shopId,
          organizationId: seeded.organizationId,
          organizationPersonId: seeded.personId,
          userId: seeded.userId,
          name: "移行途中連絡先",
          email: "owner-contact@example.com",
          emailNormalized: "owner-contact@example.com",
          isDeleted: false,
        });
        await seedCanonicalStaffLineRecipient(ctx, {
          staffId,
          lineUserId: "U_owner_partial_person",
          following: true,
        });
        await insertPendingRequest(ctx, { shopId: seeded.shopId, status: "pending" });
        return seeded;
      });

      const result = await t.query(internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop, {
        shopId: ids.shopId,
      });

      expect(result?.recipients).toEqual([
        expect.objectContaining({
          userId: ids.userId,
          name: "移行途中連絡先",
          email: "owner-contact@example.com",
          lineUserId: "U_owner_partial_person",
          lineFollowing: true,
        }),
      ]);
    });

    it("他店舗managerと同店舗の一般スタッフは通知対象にしない", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "target_manager",
          email: "target-manager@example.com",
          shopName: "対象店舗",
        });
        await insertCanonicalManagerStaff(ctx, {
          shopId: seeded.shopId,
          organizationId: seeded.organizationId,
          personId: seeded.personId,
          userId: seeded.userId,
          email: "target-manager@example.com",
        });
        await seedStaff(ctx, {
          shopId: seeded.shopId,
          name: "一般スタッフ",
          email: "staff-only@example.com",
        });
        await seedManagerShop(ctx, {
          subject: "other_manager",
          email: "other-manager@example.com",
          shopName: "別店舗",
        });
        await insertPendingRequest(ctx, { shopId: seeded.shopId, status: "pending" });
        return { shopId: seeded.shopId };
      });

      const result = await t.query(internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop, {
        shopId,
      });

      expect(result?.recipients.map((recipient) => recipient.email)).toEqual(["target-manager@example.com"]);
      expect(result?.recipients.map((recipient) => recipient.email)).not.toContain("staff-only@example.com");
      expect(result?.recipients.map((recipient) => recipient.email)).not.toContain("other-manager@example.com");
    });

    it("対象店舗のstaffではないactive管理者には送らない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "digest_manager_without_shop_staff",
          email: "manager-without-shop-staff@example.com",
        });
        await insertPendingRequest(ctx, { shopId: seeded.shopId });
        return seeded.shopId;
      });

      await expect(
        t.query(internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop, { shopId }),
      ).resolves.toBeNull();
    });

    it("同じmanager userが複数店舗に所属していても対象店舗のmanager staffだけでLINE連携を判定する", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "multi_shop_manager",
          email: "multi-shop@example.com",
          shopName: "対象店舗",
        });
        await insertCanonicalManagerStaff(ctx, {
          shopId: seeded.shopId,
          organizationId: seeded.organizationId,
          personId: seeded.personId,
          userId: seeded.userId,
          email: "multi-shop@example.com",
        });
        const otherShopId = await seedShop(ctx, "別店舗");
        await seedLegacyShopMembership(ctx, { shopId: otherShopId, userId: seeded.userId });
        const otherShopManagerStaffId = await seedStaff(ctx, {
          shopId: otherShopId,
          userId: seeded.userId,
          name: "別店舗の管理スタッフ",
          email: "multi-shop@example.com",
        });
        await seedCanonicalStaffLineRecipient(ctx, {
          staffId: otherShopManagerStaffId,
          lineUserId: "U_other_shop",
          following: true,
        });
        await insertPendingRequest(ctx, { shopId: seeded.shopId, status: "pending" });
        return { shopId: seeded.shopId };
      });

      const result = await t.query(internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop, {
        shopId,
      });

      expect(result?.recipients).toEqual([expect.objectContaining({ email: "multi-shop@example.com" })]);
      expect(result?.recipients[0]).not.toHaveProperty("lineUserId");
      expect(result?.recipients[0]).not.toHaveProperty("lineFollowing");
    });

    it.each(["duplicate", "organizationMismatch", "personMismatch", "userMismatch"] as const)(
      "canonical管理者のstaffが%sなら任意の1件を選ばず通知対象外にする",
      async (kind) => {
        const t = convexTest(schema, modules);
        const shopId = await t.run(async (ctx) => {
          const seeded = await seedManagerShop(ctx, {
            subject: `line_conflict_${kind}`,
            email: `line-conflict-${kind}@example.com`,
          });
          let organizationId = seeded.organizationId;
          let organizationPersonId = seeded.personId;
          let userId = seeded.userId;

          if (kind === "organizationMismatch") {
            const otherShopId = await seedShop(ctx, "別グループ店舗");
            const otherShop = await ctx.db.get(otherShopId);
            if (!otherShop?.organizationId) throw new Error("organization not found");
            organizationId = otherShop.organizationId;
          }
          if (kind === "personMismatch") {
            organizationPersonId = await ctx.db.insert("organizationPeople", {
              organizationId: seeded.organizationId,
              name: "別人物",
              email: `line-conflict-person-${kind}@example.com`,
              emailNormalized: `line-conflict-person-${kind}@example.com`,
              status: "active",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          }
          if (kind === "userMismatch") {
            userId = await seedUser(ctx, `line_conflict_other_${kind}`);
          }

          const managerStaffId = await ctx.db.insert("staffs", {
            shopId: seeded.shopId,
            organizationId,
            organizationPersonId,
            userId,
            name: "管理スタッフ",
            email: `line-conflict-${kind}@example.com`,
            emailNormalized: `line-conflict-${kind}@example.com`,
            isDeleted: false,
          });
          await seedStaffLineAccount(ctx, {
            shopId: seeded.shopId,
            staffId: managerStaffId,
            lineUserId: `U_line_conflict_${kind}`,
            following: true,
          });
          if (kind === "duplicate") {
            await ctx.db.insert("staffs", {
              shopId: seeded.shopId,
              organizationId: seeded.organizationId,
              organizationPersonId: seeded.personId,
              name: "重複管理スタッフ",
              email: `line-conflict-duplicate@example.com`,
              emailNormalized: `line-conflict-duplicate@example.com`,
              isDeleted: false,
            });
          }
          await insertPendingRequest(ctx, { shopId: seeded.shopId });
          return seeded.shopId;
        });

        const result = await t.query(internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop, {
          shopId,
        });

        expect(result).toBeNull();
      },
    );

    it("承認待ちがない店舗、削除済み店舗、削除済みmanager/memberは対象外にする", async () => {
      const t = convexTest(schema, modules);
      const { noPendingShopId, deletedShopId, deletedUserShopId, deletedMemberShopId } = await t.run(async (ctx) => {
        const noPending = await seedManagerShop(ctx, { subject: "no_pending" });
        const deletedShop = await seedManagerShop(ctx, { subject: "deleted_shop", shopDeleted: true });
        await insertPendingRequest(ctx, { shopId: deletedShop.shopId });

        const deletedUser = await seedManagerShop(ctx, { subject: "deleted_user" });
        await ctx.db.patch(deletedUser.userId, { isDeleted: true });
        await insertPendingRequest(ctx, { shopId: deletedUser.shopId });

        const deletedMember = await seedManagerShop(ctx, { subject: "deleted_member", membershipDeleted: true });
        await insertPendingRequest(ctx, { shopId: deletedMember.shopId });

        return {
          noPendingShopId: noPending.shopId,
          deletedShopId: deletedShop.shopId,
          deletedUserShopId: deletedUser.shopId,
          deletedMemberShopId: deletedMember.shopId,
        };
      });

      await expect(
        t.query(internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop, {
          shopId: noPendingShopId,
        }),
      ).resolves.toBeNull();
      await expect(
        t.query(internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop, {
          shopId: deletedShopId,
        }),
      ).resolves.toBeNull();
      await expect(
        t.query(internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop, {
          shopId: deletedUserShopId,
        }),
      ).resolves.toBeNull();
      await expect(
        t.query(internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop, {
          shopId: deletedMemberShopId,
        }),
      ).resolves.toBeNull();
    });

    it("連携解除済みのmanager staffはメール対象に残し、削除済みstaffは対象外にする", async () => {
      const t = convexTest(schema, modules);
      const { deletedLineShopId, deletedStaffShopId } = await t.run(async (ctx) => {
        const deletedLine = await seedManagerShop(ctx, {
          subject: "deleted_line",
          email: "deleted-line@example.com",
        });
        const managerStaffId = await insertCanonicalManagerStaff(ctx, {
          shopId: deletedLine.shopId,
          organizationId: deletedLine.organizationId,
          personId: deletedLine.personId,
          userId: deletedLine.userId,
          email: "deleted-line@example.com",
        });
        const lineRecipient = await seedCanonicalStaffLineRecipient(ctx, {
          staffId: managerStaffId,
          lineUserId: "U_deleted_line",
          following: true,
        });
        await ctx.db.patch(lineRecipient.organizationPersonLineLinkId, {
          isDeleted: true,
          unlinkedAt: Date.now(),
        });
        await insertPendingRequest(ctx, { shopId: deletedLine.shopId });

        const deletedStaff = await seedManagerShop(ctx, {
          subject: "deleted_staff",
          email: "deleted-staff@example.com",
        });
        const deletedStaffId = await insertCanonicalManagerStaff(ctx, {
          shopId: deletedStaff.shopId,
          organizationId: deletedStaff.organizationId,
          personId: deletedStaff.personId,
          userId: deletedStaff.userId,
          email: "deleted-staff@example.com",
        });
        await seedCanonicalStaffLineRecipient(ctx, {
          staffId: deletedStaffId,
          lineUserId: "U_deleted_staff",
          following: true,
        });
        await ctx.db.patch(deletedStaffId, { isDeleted: true });
        await insertPendingRequest(ctx, { shopId: deletedStaff.shopId });

        return { deletedLineShopId: deletedLine.shopId, deletedStaffShopId: deletedStaff.shopId };
      });

      const deletedLineResult = await t.query(
        internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop,
        {
          shopId: deletedLineShopId,
        },
      );
      const deletedStaffResult = await t.query(
        internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop,
        {
          shopId: deletedStaffShopId,
        },
      );

      expect(deletedLineResult?.recipients).toEqual([expect.objectContaining({ email: "deleted-line@example.com" })]);
      expect(deletedLineResult?.recipients[0]).not.toHaveProperty("lineUserId");
      expect(deletedLineResult?.recipients[0]).not.toHaveProperty("lineFollowing");
      expect(deletedStaffResult).toBeNull();
    });
  });
});

function idsToStrings<T extends Record<string, unknown>>(ids: T) {
  return Object.fromEntries(Object.entries(ids).map(([key, value]) => [key, String(value)])) as {
    [K in keyof T]: string;
  };
}
