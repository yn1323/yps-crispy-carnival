import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";

describe("shiftBoard/queries", () => {
  it("全休み提出は提出済みとして返す", async () => {
    const t = convexTest(schema, modules);
    const { recruitmentId, staffId } = await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "manager_all_off",
        name: "管理者",
        email: "manager@example.com",
        role: "manager",
        isDeleted: false,
      });
      const shopId = await ctx.db.insert("shops", {
        name: "テスト店舗",
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
        ownerId: "manager_all_off",
        isDeleted: false,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "全休みスタッフ",
        email: "all-off@example.com",
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-07",
        deadline: "2026-03-28",
        status: "open",
        isDeleted: false,
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
      });
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId,
        submittedAt: Date.now(),
      });
      return { recruitmentId, staffId };
    });

    const result = await t
      .withIdentity({ subject: "manager_all_off" })
      .query(api.shiftBoard.queries.getShiftBoardData, { recruitmentId });

    expect(result?.staffs).toEqual([{ _id: staffId, name: "全休みスタッフ", isSubmitted: true }]);
  });

  it("分つきシフト時間は表示用に丸めつつ編集可能境界を分で返す", async () => {
    const t = convexTest(schema, modules);
    const recruitmentId = await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "manager_half_hour",
        name: "管理者",
        email: "manager@example.com",
        role: "manager",
        isDeleted: false,
      });
      const shopId = await ctx.db.insert("shops", {
        name: "テスト店舗",
        shiftStartTime: "05:30",
        shiftEndTime: "22:30",
        ownerId: "manager_half_hour",
        isDeleted: false,
      });
      return await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-07",
        deadline: "2026-03-28",
        status: "open",
        isDeleted: false,
        shiftStartTime: "05:30",
        shiftEndTime: "22:30",
      });
    });

    const result = await t
      .withIdentity({ subject: "manager_half_hour" })
      .query(api.shiftBoard.queries.getShiftBoardData, { recruitmentId });

    expect(result?.timeRange).toEqual({
      start: 5,
      end: 23,
      unit: 30,
      editableStartMinutes: 330,
      editableEndMinutes: 1350,
    });
  });

  it("募集スナップショットのシフト時間を店舗設定より優先する", async () => {
    const t = convexTest(schema, modules);
    const recruitmentId = await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "manager_snapshot",
        name: "管理者",
        email: "manager@example.com",
        role: "manager",
        isDeleted: false,
      });
      const shopId = await ctx.db.insert("shops", {
        name: "テスト店舗",
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
        ownerId: "manager_snapshot",
        isDeleted: false,
      });
      return await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-07",
        deadline: "2026-03-28",
        status: "open",
        isDeleted: false,
        shiftStartTime: "05:30",
        shiftEndTime: "22:30",
      });
    });

    const result = await t
      .withIdentity({ subject: "manager_snapshot" })
      .query(api.shiftBoard.queries.getShiftBoardData, { recruitmentId });

    expect(result?.timeRange.editableStartMinutes).toBe(330);
    expect(result?.timeRange.editableEndMinutes).toBe(1350);
  });
});
