import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { todayJST } from "../_lib/dateFormat";
import { seedManagerShop, seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getLegalConsentVersions } from "../legal/documents";

function dateFromToday(daysFromNow: number): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

describe("staff/mutations", () => {
  describe("addStaffs", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.staff.mutations.addStaffs, {
          entries: [{ name: "テスト", email: "test@example.com" }],
        }),
      ).rejects.toThrow();
    });

    it("スタッフを一括追加できる", async () => {
      const t = convexTest(schema, modules);

      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        return seeded.shopId;
      });

      const ids = await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
        entries: [
          { name: "田中太郎", email: "tanaka@example.com" },
          { name: "佐藤花子", email: "sato@example.com" },
        ],
      });

      expect(ids).toHaveLength(2);

      const staffs = await t.run(async (ctx) =>
        ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .collect(),
      );
      expect(staffs).toHaveLength(2);
      expect(staffs.every((s) => !s.isDeleted)).toBe(true);
    });

    it("追加スタッフ向けの同意依頼メールとLINE連携メールをスケジュールする", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await seedManagerShop(ctx, { subject: "user_mgr", email: "mgr@example.com", shopName: "テスト店舗" });
      });

      const [staffId] = await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
        entries: [{ name: "田中太郎", email: "tanaka@example.com" }],
      });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some((job) => job.name === "legal/actions:sendStaffConsentEmail" && job.args[0]?.staffId === staffId),
      ).toBe(true);
      expect(
        scheduled.some((job) => job.name === "line/actions:sendInviteEmail" && job.args[0]?.staffId === staffId),
      ).toBe(true);
    });

    it("空の name のエントリはスキップする", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await seedManagerShop(ctx, { subject: "user_mgr", email: "mgr@example.com", shopName: "テスト店舗" });
      });

      const ids = await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
        entries: [
          { name: "田中太郎", email: "tanaka@example.com" },
          { name: "", email: "" },
          { name: "  ", email: "" },
        ],
      });

      expect(ids).toHaveLength(1);
    });

    it("既存メールアドレスの重複はエラーにしてスタッフを追加しない", async () => {
      const t = convexTest(schema, modules);

      const shopId = await t.run(async (ctx) => {
        const { shopId: id } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        await ctx.db.insert("staffs", {
          shopId: id,
          name: "既存スタッフ",
          email: "existing@example.com",
          isDeleted: false,
        });
        return id;
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
          entries: [
            { name: "新規スタッフ", email: "new@example.com" },
            { name: "重複スタッフ", email: "existing@example.com" },
          ],
        }),
      ).rejects.toThrow("このメールアドレスはすでに登録されています");

      const allStaffs = await t.run(async (ctx) =>
        ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .collect(),
      );
      expect(allStaffs).toHaveLength(1);
    });

    it("同じメールの再実行ではエラーにしてスタッフと通知予約を増やさない", async () => {
      const t = convexTest(schema, modules);

      const shopId = await t.run(async (ctx) => {
        const { shopId: id } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        return id;
      });
      const asManager = t.withIdentity({ subject: "user_mgr" });

      const firstIds = await asManager.mutation(api.staff.mutations.addStaffs, {
        entries: [{ name: "田中太郎", email: "tanaka@example.com" }],
      });
      await expect(
        asManager.mutation(api.staff.mutations.addStaffs, {
          entries: [{ name: "田中太郎", email: "Tanaka@Example.com" }],
        }),
      ).rejects.toThrow("このメールアドレスはすでに登録されています");

      expect(firstIds).toHaveLength(1);
      const state = await t.run(async (ctx) => {
        const staffs = await ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .collect();
        const scheduled = await ctx.db.system.query("_scheduled_functions").collect();
        return { staffs, scheduled };
      });
      expect(state.staffs).toHaveLength(1);
      expect(state.scheduled.filter((job) => job.name === "legal/actions:sendStaffConsentEmail")).toHaveLength(1);
      expect(state.scheduled.filter((job) => job.name === "line/actions:sendInviteEmail")).toHaveLength(1);
      expect(
        state.scheduled.filter(
          (job) => job.name === "notification/actions:sendOpenRecruitmentNotificationEmailsForStaff",
        ),
      ).toHaveLength(1);
    });

    it("emailNormalizedがない既存スタッフもメール重複としてエラーにする", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "既存スタッフ",
          email: "legacy@example.com",
          isDeleted: false,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
          entries: [{ name: "新規スタッフ", email: "legacy@example.com" }],
        }),
      ).rejects.toThrow("このメールアドレスはすでに登録されています");
    });

    it("承認待ち申請と同じメールアドレスはエラーにする", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        const versions = getLegalConsentVersions("staff");
        const now = Date.now();
        await ctx.db.insert("staffRegistrationRequests", {
          shopId,
          name: "承認待ちスタッフ",
          email: "pending@example.com",
          emailNormalized: "pending@example.com",
          status: "pending",
          ...versions,
          consentedAt: now,
          createdAt: now,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
          entries: [{ name: "新規スタッフ", email: "Pending@Example.com" }],
        }),
      ).rejects.toThrow("このメールアドレスは承認待ちです");
    });

    it("追加スタッフ向け通知データは締切前のopen募集だけを返す", async () => {
      const t = convexTest(schema, modules);

      const ids = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "追加スタッフ",
          email: "added@example.com",
          isDeleted: false,
        });
        const openRecruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: dateFromToday(7),
          periodEnd: dateFromToday(13),
          deadline: todayJST(),
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: dateFromToday(14),
          periodEnd: dateFromToday(20),
          deadline: dateFromToday(5),
          shopClosedDates: [],
          status: "confirmed",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: dateFromToday(-14),
          periodEnd: dateFromToday(-8),
          deadline: dateFromToday(-15),
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: dateFromToday(21),
          periodEnd: dateFromToday(27),
          deadline: dateFromToday(10),
          shopClosedDates: [],
          status: "open",
          isDeleted: true,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return { staffId, openRecruitmentId };
      });

      const data = await t.query(internal.notification.queries.getOpenRecruitmentNotificationDataForStaff, {
        staffId: ids.staffId,
      });

      expect(data?.recruitments.map((r) => r.recruitmentId)).toEqual([ids.openRecruitmentId]);
    });

    it("募集通知の手動再送は対象募集がない場合に予約せず理由を返す", async () => {
      const t = convexTest(schema, modules);

      const staffId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "通知スタッフ",
          email: "notify@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: dateFromToday(7),
          periodEnd: dateFromToday(13),
          deadline: dateFromToday(-1),
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return staffId;
      });

      const result = await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.staff.mutations.sendOpenRecruitmentNotifications, { staffId });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(result).toEqual({ scheduled: false, reason: "noEligibleRecruitments" });
      expect(
        scheduled.some((job) => job.name === "notification/actions:sendOpenRecruitmentNotificationsForStaff"),
      ).toBe(false);
    });

    it("募集通知の手動再送は対象募集がある場合だけ予約する", async () => {
      const t = convexTest(schema, modules);

      const staffId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "通知スタッフ",
          email: "notify@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: dateFromToday(7),
          periodEnd: dateFromToday(13),
          deadline: todayJST(),
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return staffId;
      });

      const result = await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.staff.mutations.sendOpenRecruitmentNotifications, { staffId });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(result).toEqual({ scheduled: true });
      expect(
        scheduled.some((job) => job.name === "notification/actions:sendOpenRecruitmentNotificationsForStaff"),
      ).toBe(true);
    });
  });

  function setupShopWithStaff() {
    const t = convexTest(schema, modules);
    const data = t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "user_mgr",
        email: "mgr@example.com",
        shopName: "テスト店舗",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "田中太郎",
        email: "tanaka@example.com",
        isDeleted: false,
      });
      return { shopId, staffId };
    });
    return { t, data };
  }

  describe("editStaff", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("未認証の場合エラーをthrow", async () => {
      const { t, data } = setupShopWithStaff();
      const { staffId } = await data;
      await expect(
        t.mutation(api.staff.mutations.editStaff, { staffId, name: "更新後", email: "updated@example.com" }),
      ).rejects.toThrow();
    });

    it("スタッフ情報を更新できる", async () => {
      const { t, data } = setupShopWithStaff();
      const { staffId } = await data;

      await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.staff.mutations.editStaff, { staffId, name: "田中花子", email: "tanaka@example.com" });

      const staff = await t.run(async (ctx) => ctx.db.get(staffId));
      expect(staff?.name).toBe("田中花子");
      expect(staff?.email).toBe("tanaka@example.com");
    });

    it("メールアドレス変更時は募集中シフト通知の追送actionをスケジュールする", async () => {
      const { t, data } = setupShopWithStaff();
      const { staffId } = await data;

      await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.staff.mutations.editStaff, { staffId, name: "田中太郎", email: "updated@example.com" });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some(
          (job) =>
            job.name === "notification/actions:sendOpenRecruitmentNotificationEmailsForStaffEmailChange" &&
            job.args[0]?.staffId === staffId &&
            job.args[0]?.expectedEmailNormalized === "updated@example.com" &&
            typeof job.args[0]?.emailChangedAt === "number",
        ),
      ).toBe(true);
    });

    it("名前だけの変更では募集中シフト通知の追送actionをスケジュールしない", async () => {
      const { t, data } = setupShopWithStaff();
      const { staffId } = await data;

      await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.staff.mutations.editStaff, { staffId, name: "田中太郎 更新", email: "tanaka@example.com" });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some(
          (job) => job.name === "notification/actions:sendOpenRecruitmentNotificationEmailsForStaffEmailChange",
        ),
      ).toBe(false);
    });

    it("同一メールの大文字小文字・前後空白差分では募集中シフト通知の追送actionをスケジュールしない", async () => {
      const { t, data } = setupShopWithStaff();
      const { staffId } = await data;

      await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.staff.mutations.editStaff, { staffId, name: "田中太郎", email: "  Tanaka@Example.com  " });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some(
          (job) => job.name === "notification/actions:sendOpenRecruitmentNotificationEmailsForStaffEmailChange",
        ),
      ).toBe(false);
    });

    it("空メールへの変更では募集中シフト通知の追送actionをスケジュールしない", async () => {
      const { t, data } = setupShopWithStaff();
      const { staffId } = await data;

      await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.editStaff, {
        staffId,
        name: "田中太郎",
        email: "",
      });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some(
          (job) => job.name === "notification/actions:sendOpenRecruitmentNotificationEmailsForStaffEmailChange",
        ),
      ).toBe(false);
    });

    it("他店舗のスタッフは編集できない（IDOR）", async () => {
      const { t } = setupShopWithStaff();

      const otherStaffId = await t.run(async (ctx) => {
        const otherShopId = await seedShop(ctx, "他店舗");
        return await ctx.db.insert("staffs", {
          shopId: otherShopId,
          name: "他店スタッフ",
          email: "other@example.com",
          isDeleted: false,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.editStaff, {
          staffId: otherStaffId,
          name: "不正更新",
          email: "hack@example.com",
        }),
      ).rejects.toThrow("Not found");
    });

    it("削除済みスタッフは編集できない", async () => {
      const { t, data } = setupShopWithStaff();
      const { staffId } = await data;

      await t.run(async (ctx) => {
        await ctx.db.patch(staffId, { isDeleted: true });
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.editStaff, {
          staffId,
          name: "更新後",
          email: "updated@example.com",
        }),
      ).rejects.toThrow("Not found");
    });

    it("メールアドレスが他スタッフと重複する場合エラー", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;

      await t.run(async (ctx) => {
        await ctx.db.insert("staffs", {
          shopId,
          name: "佐藤花子",
          email: "sato@example.com",
          isDeleted: false,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.editStaff, {
          staffId,
          name: "田中太郎",
          email: "sato@example.com",
        }),
      ).rejects.toThrow("このメールアドレスは既に使用されています");
    });

    it("自分自身のメールアドレスはそのまま更新可能", async () => {
      const { t, data } = setupShopWithStaff();
      const { staffId } = await data;

      await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.staff.mutations.editStaff, { staffId, name: "田中太郎（更新）", email: "tanaka@example.com" });

      const staff = await t.run(async (ctx) => ctx.db.get(staffId));
      expect(staff?.name).toBe("田中太郎（更新）");
      expect(staff?.email).toBe("tanaka@example.com");
    });
  });

  describe("deleteStaff", () => {
    it("未認証の場合エラーをthrow", async () => {
      const { t, data } = setupShopWithStaff();
      const { staffId } = await data;
      await expect(t.mutation(api.staff.mutations.deleteStaff, { staffId })).rejects.toThrow();
    });

    it("スタッフを論理削除できる", async () => {
      const { t, data } = setupShopWithStaff();
      const { staffId } = await data;

      await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.deleteStaff, { staffId });

      const staff = await t.run(async (ctx) => ctx.db.get(staffId));
      expect(staff?.isDeleted).toBe(true);
    });

    it("他店舗のスタッフは削除できない（IDOR）", async () => {
      const { t } = setupShopWithStaff();

      const otherStaffId = await t.run(async (ctx) => {
        const otherShopId = await seedShop(ctx, "他店舗");
        return await ctx.db.insert("staffs", {
          shopId: otherShopId,
          name: "他店スタッフ",
          email: "other@example.com",
          isDeleted: false,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.deleteStaff, { staffId: otherStaffId }),
      ).rejects.toThrow("Not found");
    });

    it("管理者自身は削除できない", async () => {
      const t = convexTest(schema, modules);

      const adminStaffId = await t.run(async (ctx) => {
        const { userId, shopId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        return await ctx.db.insert("staffs", {
          shopId,
          name: "管理者",
          email: "mgr@example.com",
          userId,
          isDeleted: false,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.deleteStaff, { staffId: adminStaffId }),
      ).rejects.toThrow("自分のアカウントは削除できません");
    });
  });
});
