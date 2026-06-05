import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedManagerShop, seedShopMembership, seedStaffLineAccount, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

async function insertPendingRequest(
  ctx: MutationCtx,
  args: { shopId: Id<"shops">; status?: "pending" | "approved" | "rejected"; email?: string },
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
    createdAt: Date.now(),
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
  });

  describe("getOwnerDigestTargetForShop", () => {
    it("店舗のmanager usersを通知対象にし、manager staffのLINE連携を付与する", async () => {
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
        await insertPendingRequest(ctx, { shopId: seeded.shopId, status: "pending" });
        return { shopId: seeded.shopId };
      });

      const result = await t.query(internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop, {
        shopId,
      });

      expect(result).toMatchObject({
        shopId,
        shopName: "通知店舗",
      });
      expect(result?.dashboardUrl).toMatch(/\/dashboard$/);
      expect(result?.recipients).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            email: "owner-line@example.com",
            lineUserId: "U_owner_line",
            lineFollowing: true,
          }),
          expect.objectContaining({
            email: "owner-email@example.com",
          }),
        ]),
      );
      const emailRecipient = result?.recipients.find((recipient) => recipient.email === "owner-email@example.com");
      expect(emailRecipient).not.toHaveProperty("lineUserId");
      expect(emailRecipient).not.toHaveProperty("lineFollowing");
    });

    it("他店舗managerと同店舗の一般スタッフは通知対象にしない", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "target_manager",
          email: "target-manager@example.com",
          shopName: "対象店舗",
        });
        await ctx.db.insert("staffs", {
          shopId: seeded.shopId,
          name: "一般スタッフ",
          email: "staff-only@example.com",
          emailNormalized: "staff-only@example.com",
          isDeleted: false,
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

    it("manager staffやLINE連携が削除済みならメール候補として返す", async () => {
      const t = convexTest(schema, modules);
      const { deletedLineShopId, deletedStaffShopId } = await t.run(async (ctx) => {
        const deletedLine = await seedManagerShop(ctx, {
          subject: "deleted_line",
          email: "deleted-line@example.com",
        });
        const managerStaffId = await ctx.db.insert("staffs", {
          shopId: deletedLine.shopId,
          userId: deletedLine.userId,
          name: "削除LINE担当",
          email: "deleted-line@example.com",
          emailNormalized: "deleted-line@example.com",
          isDeleted: false,
        });
        const lineAccountId = await seedStaffLineAccount(ctx, {
          shopId: deletedLine.shopId,
          staffId: managerStaffId,
          lineUserId: "U_deleted_line",
          following: true,
        });
        await ctx.db.patch(lineAccountId, { isDeleted: true });
        await insertPendingRequest(ctx, { shopId: deletedLine.shopId });

        const deletedStaff = await seedManagerShop(ctx, {
          subject: "deleted_staff",
          email: "deleted-staff@example.com",
        });
        const deletedStaffId = await ctx.db.insert("staffs", {
          shopId: deletedStaff.shopId,
          userId: deletedStaff.userId,
          name: "削除スタッフ担当",
          email: "deleted-staff@example.com",
          emailNormalized: "deleted-staff@example.com",
          isDeleted: true,
        });
        await seedStaffLineAccount(ctx, {
          shopId: deletedStaff.shopId,
          staffId: deletedStaffId,
          lineUserId: "U_deleted_staff",
          following: true,
        });
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
      expect(deletedStaffResult?.recipients).toEqual([expect.objectContaining({ email: "deleted-staff@example.com" })]);
      expect(deletedStaffResult?.recipients[0]).not.toHaveProperty("lineUserId");
      expect(deletedStaffResult?.recipients[0]).not.toHaveProperty("lineFollowing");
    });
  });
});

function idsToStrings<T extends Record<string, unknown>>(ids: T) {
  return Object.fromEntries(Object.entries(ids).map(([key, value]) => [key, String(value)])) as {
    [K in keyof T]: string;
  };
}
