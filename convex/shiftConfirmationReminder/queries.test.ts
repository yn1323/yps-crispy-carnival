import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedManagerShop, seedShopMembership, seedStaffLineAccount, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

async function insertRecruitment(
  ctx: MutationCtx,
  args: { shopId: Id<"shops">; status?: "open" | "confirmed"; isDeleted?: boolean },
) {
  return await ctx.db.insert("recruitments", {
    shopId: args.shopId,
    periodStart: "2026-02-02",
    periodEnd: "2026-02-08",
    deadline: "2026-01-30",
    shopClosedDates: [],
    status: args.status ?? "open",
    isDeleted: args.isDeleted ?? false,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  });
}

describe("shiftConfirmationReminder/queries", () => {
  describe("getManagerConfirmationReminderTarget", () => {
    it("open募集では店舗のmanager全員を対象にし、manager staffのLINE連携を付与する", async () => {
      const t = convexTest(schema, modules);
      const recruitmentId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "reminder_line",
          email: "owner-line@example.com",
          shopName: "確定催促店舗",
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

        const secondUserId = await seedUser(ctx, "reminder_email", "owner-email@example.com");
        await seedShopMembership(ctx, { shopId: seeded.shopId, userId: secondUserId });

        return await insertRecruitment(ctx, { shopId: seeded.shopId, status: "open" });
      });

      const result = await t.query(internal.shiftConfirmationReminder.queries.getManagerConfirmationReminderTarget, {
        recruitmentId,
      });

      expect(result).toMatchObject({
        shopName: "確定催促店舗",
        periodLabel: expect.stringContaining("〜"),
      });
      expect(result?.deadlineLabel).toContain("23:59");
      expect(result?.dashboardUrl).toMatch(/\/dashboard$/);
      expect(result?.recipients).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: "owner-line@example.com", lineUserId: "U_owner_line", lineFollowing: true }),
          expect.objectContaining({ email: "owner-email@example.com" }),
        ]),
      );
      const emailRecipient = result?.recipients.find((recipient) => recipient.email === "owner-email@example.com");
      expect(emailRecipient).not.toHaveProperty("lineUserId");
    });

    it("確定済み・削除済みの募集はnullを返す", async () => {
      const t = convexTest(schema, modules);
      const { confirmedId, deletedId } = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, { subject: "reminder_guard", email: "guard@example.com" });
        const confirmedId = await insertRecruitment(ctx, { shopId: seeded.shopId, status: "confirmed" });
        const deletedId = await insertRecruitment(ctx, { shopId: seeded.shopId, status: "open", isDeleted: true });
        return { confirmedId, deletedId };
      });

      await expect(
        t.query(internal.shiftConfirmationReminder.queries.getManagerConfirmationReminderTarget, {
          recruitmentId: confirmedId,
        }),
      ).resolves.toBeNull();
      await expect(
        t.query(internal.shiftConfirmationReminder.queries.getManagerConfirmationReminderTarget, {
          recruitmentId: deletedId,
        }),
      ).resolves.toBeNull();
    });

    it("email未設定のmanagerや削除済みmanagerは対象外、対象が居なければnull", async () => {
      const t = convexTest(schema, modules);
      const { emptyShopRecruitmentId } = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, { subject: "reminder_empty", membershipDeleted: true });
        const emptyShopRecruitmentId = await insertRecruitment(ctx, { shopId: seeded.shopId, status: "open" });
        return { emptyShopRecruitmentId };
      });

      await expect(
        t.query(internal.shiftConfirmationReminder.queries.getManagerConfirmationReminderTarget, {
          recruitmentId: emptyShopRecruitmentId,
        }),
      ).resolves.toBeNull();
    });
  });
});
