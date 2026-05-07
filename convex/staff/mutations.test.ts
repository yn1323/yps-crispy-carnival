import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { todayJST } from "../_lib/dateFormat";
import { modules, schema } from "../_test/setup.test-helper";

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
        await ctx.db.insert("users", {
          clerkId: "user_mgr",
          name: "管理者",
          email: "mgr@example.com",
          role: "manager",
          isDeleted: false,
        });
        return await ctx.db.insert("shops", {
          name: "テスト店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_mgr",
          isDeleted: false,
        });
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

    it("空の name のエントリはスキップする", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "user_mgr",
          name: "管理者",
          email: "mgr@example.com",
          role: "manager",
          isDeleted: false,
        });
        await ctx.db.insert("shops", {
          name: "テスト店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_mgr",
          isDeleted: false,
        });
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

    it("既存メールアドレスの重複はスキップする", async () => {
      const t = convexTest(schema, modules);

      const shopId = await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "user_mgr",
          name: "管理者",
          email: "mgr@example.com",
          role: "manager",
          isDeleted: false,
        });
        const id = await ctx.db.insert("shops", {
          name: "テスト店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_mgr",
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId: id,
          name: "既存スタッフ",
          email: "existing@example.com",
          isDeleted: false,
        });
        return id;
      });

      const ids = await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
        entries: [
          { name: "新規スタッフ", email: "new@example.com" },
          { name: "重複スタッフ", email: "existing@example.com" },
        ],
      });

      expect(ids).toHaveLength(1);

      const allStaffs = await t.run(async (ctx) =>
        ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .collect(),
      );
      expect(allStaffs).toHaveLength(2);
    });

    it("追加スタッフ向け通知データは締切前のopen募集だけを返す", async () => {
      const t = convexTest(schema, modules);

      const ids = await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "user_mgr",
          name: "管理者",
          email: "mgr@example.com",
          role: "manager",
          isDeleted: false,
        });
        const shopId = await ctx.db.insert("shops", {
          name: "テスト店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_mgr",
          isDeleted: false,
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
          status: "open",
          isDeleted: false,
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: dateFromToday(14),
          periodEnd: dateFromToday(20),
          deadline: dateFromToday(5),
          status: "confirmed",
          isDeleted: false,
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: dateFromToday(-14),
          periodEnd: dateFromToday(-8),
          deadline: dateFromToday(-15),
          status: "open",
          isDeleted: false,
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: dateFromToday(21),
          periodEnd: dateFromToday(27),
          deadline: dateFromToday(10),
          status: "open",
          isDeleted: true,
        });
        return { staffId, openRecruitmentId };
      });

      const data = await t.query(internal.email.queries.getOpenRecruitmentNotificationDataForStaff, {
        staffId: ids.staffId,
      });

      expect(data?.recruitments.map((r) => r.recruitmentId)).toEqual([ids.openRecruitmentId]);
    });
  });

  function setupShopWithStaff() {
    const t = convexTest(schema, modules);
    const data = t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "user_mgr",
        name: "管理者",
        email: "mgr@example.com",
        role: "manager",
        isDeleted: false,
      });
      const shopId = await ctx.db.insert("shops", {
        name: "テスト店舗",
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
        ownerId: "user_mgr",
        isDeleted: false,
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
        .mutation(api.staff.mutations.editStaff, { staffId, name: "田中花子", email: "hanako@example.com" });

      const staff = await t.run(async (ctx) => ctx.db.get(staffId));
      expect(staff?.name).toBe("田中花子");
      expect(staff?.email).toBe("hanako@example.com");
    });

    it("他店舗のスタッフは編集できない（IDOR）", async () => {
      const { t } = setupShopWithStaff();

      const otherStaffId = await t.run(async (ctx) => {
        const otherShopId = await ctx.db.insert("shops", {
          name: "他店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "other_owner",
          isDeleted: false,
        });
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
        const otherShopId = await ctx.db.insert("shops", {
          name: "他店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "other_owner",
          isDeleted: false,
        });
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
        const userId = await ctx.db.insert("users", {
          clerkId: "user_mgr",
          name: "管理者",
          email: "mgr@example.com",
          role: "manager",
          isDeleted: false,
        });
        const shopId = await ctx.db.insert("shops", {
          name: "テスト店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_mgr",
          isDeleted: false,
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
