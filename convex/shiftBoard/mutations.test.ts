import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { modules, schema } from "../_test/setup.test-helper";

/** テスト用にshop + user + recruitment + staffsをセットアップ */
// biome-ignore lint/suspicious/noExplicitAny: convex-test の型がジェネリクスで複雑なため
async function setupTestData(t: any) {
  let shopId: Id<"shops">;
  let recruitmentId: Id<"recruitments">;
  let staffId1: Id<"staffs">;
  let staffId2: Id<"staffs">;

  // biome-ignore lint/suspicious/noExplicitAny: t.run の ctx 型推論が効かないため
  await t.run(async (ctx: any) => {
    shopId = await ctx.db.insert("shops", {
      name: "テスト店舗",
      shiftStartTime: "09:00",
      shiftEndTime: "22:00",
      ownerId: "user_owner",
      isDeleted: false,
    });
    await ctx.db.insert("users", {
      clerkId: "user_owner",
      name: "オーナー",
      email: "owner@example.com",
      role: "manager",
      isDeleted: false,
    });
    recruitmentId = await ctx.db.insert("recruitments", {
      shopId: shopId!,
      periodStart: "2026-01-20",
      periodEnd: "2026-01-26",
      deadline: "2026-01-17",
      status: "open",
      isDeleted: false,
    });
    staffId1 = await ctx.db.insert("staffs", {
      shopId: shopId!,
      name: "鈴木太郎",
      email: "suzuki@example.com",
      isDeleted: false,
    });
    staffId2 = await ctx.db.insert("staffs", {
      shopId: shopId!,
      name: "佐藤花子",
      email: "sato@example.com",
      isDeleted: false,
    });
  });

  return { shopId: shopId!, recruitmentId: recruitmentId!, staffId1: staffId1!, staffId2: staffId2! };
}

describe("shiftBoard/mutations", () => {
  describe("saveShiftAssignments", () => {
    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId: "invalid" as Id<"recruitments">,
          assignments: [],
        }),
      ).rejects.toThrow();
    });

    it("他店舗のrecruitmentではNot foundエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      // 別のshop+userを作成
      await t.run(async (ctx) => {
        const otherShopId = await ctx.db.insert("shops", {
          name: "他店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_other",
          isDeleted: false,
        });
        await ctx.db.insert("users", {
          clerkId: "user_other",
          name: "他人",
          email: "other@example.com",
          role: "manager",
          isDeleted: false,
        });
        return otherShopId;
      });

      await expect(
        t.withIdentity({ subject: "user_other" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [],
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("正常にシフト割当を保存できる", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);
      const asOwner = t.withIdentity({ subject: "user_owner" });

      await asOwner.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        recruitmentId,
        assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "18:00" }],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      );
      expect(assignments).toHaveLength(1);
      expect(assignments[0].staffId).toBe(staffId1);
      expect(assignments[0].startTime).toBe("10:00");
    });

    it("空のassignmentsで保存できる（全員休み）", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);
      const asOwner = t.withIdentity({ subject: "user_owner" });

      await asOwner.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        recruitmentId,
        assignments: [],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      );
      expect(assignments).toHaveLength(0);
    });

    it("保存時に既存の割当を全削除して置き換える", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1, staffId2 } = await setupTestData(t);
      const asOwner = t.withIdentity({ subject: "user_owner" });

      // 初回保存
      await asOwner.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "18:00" },
          { staffId: staffId2, date: "2026-01-20", startTime: "11:00", endTime: "19:00" },
        ],
      });

      // 2回目保存（staffId1のみ）
      await asOwner.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        recruitmentId,
        assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "09:00", endTime: "17:00" }],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      );
      expect(assignments).toHaveLength(1);
      expect(assignments[0].startTime).toBe("09:00");
    });

    it("同一スタッフ×同一日の重複でエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);

      await expect(
        t.withIdentity({ subject: "user_owner" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [
            { staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "14:00" },
            { staffId: staffId1, date: "2026-01-20", startTime: "15:00", endTime: "18:00" },
          ],
        }),
      ).rejects.toThrow("同一スタッフの同一日に重複があります");
    });

    it("募集期間外の日付でエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);

      await expect(
        t.withIdentity({ subject: "user_owner" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-27", startTime: "10:00", endTime: "18:00" }],
        }),
      ).rejects.toThrow("シフト日が募集期間外です");
    });

    it("開始時間が終了時間以降でエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);

      await expect(
        t.withIdentity({ subject: "user_owner" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "18:00", endTime: "10:00" }],
        }),
      ).rejects.toThrow("開始時間が終了時間以降になっています");
    });

    it("開始時間と終了時間が同じでエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);

      await expect(
        t.withIdentity({ subject: "user_owner" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "10:00" }],
        }),
      ).rejects.toThrow("開始時間が終了時間以降になっています");
    });

    it("店舗のシフト時間外でエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);

      await expect(
        t.withIdentity({ subject: "user_owner" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "07:00", endTime: "15:00" }],
        }),
      ).rejects.toThrow("シフト時間が店舗の勤務可能時間外です");
    });

    it("削除済みスタッフでエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      let deletedStaffId: Id<"staffs">;
      await t.run(async (ctx) => {
        const shopId = (await ctx.db
          .query("shops")
          .withIndex("by_ownerId", (q) => q.eq("ownerId", "user_owner"))
          .first())!._id;
        deletedStaffId = await ctx.db.insert("staffs", {
          shopId,
          name: "削除済み",
          email: "deleted@example.com",
          isDeleted: true,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_owner" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [{ staffId: deletedStaffId!, date: "2026-01-20", startTime: "10:00", endTime: "18:00" }],
        }),
      ).rejects.toThrow(ConvexError);
    });
  });

  describe("confirmRecruitment", () => {
    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.shiftBoard.mutations.confirmRecruitment, {
          recruitmentId: "invalid" as Id<"recruitments">,
        }),
      ).rejects.toThrow();
    });

    it("正常にステータスとconfirmedAtを更新する", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      await t
        .withIdentity({ subject: "user_owner" })
        .mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId });

      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(recruitment?.status).toBe("confirmed");
      expect(recruitment?.confirmedAt).toBeTypeOf("number");
    });

    it("他店舗のrecruitmentではNot foundエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      await t.run(async (ctx) => {
        await ctx.db.insert("shops", {
          name: "他店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_other2",
          isDeleted: false,
        });
        await ctx.db.insert("users", {
          clerkId: "user_other2",
          name: "他人2",
          email: "other2@example.com",
          role: "manager",
          isDeleted: false,
        });
      });

      await expect(
        t
          .withIdentity({ subject: "user_other2" })
          .mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId }),
      ).rejects.toThrow(ConvexError);
    });
  });
});
