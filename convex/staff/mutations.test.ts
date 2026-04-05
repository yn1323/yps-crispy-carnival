import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";

describe("staff/mutations", () => {
  describe("addStaffs", () => {
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
  });
});
