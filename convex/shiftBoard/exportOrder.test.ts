import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { SHIFT_BOARD_STAFF_LIMIT } from "../constants";

async function setup(ordered: boolean) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const manager = await seedManagerShop(ctx, { subject: "export-order" });
    const first = await seedStaff(ctx, { shopId: manager.shopId, name: "同じ名前" });
    const second = await seedStaff(ctx, { shopId: manager.shopId, name: "同じ名前" });
    const managerStaff = await seedStaff(ctx, { shopId: manager.shopId, name: "管理者", userId: manager.userId });
    const excluded = await seedStaff(ctx, { shopId: manager.shopId, name: "対象外", excludedFromShift: true });
    const removed = await seedStaff(ctx, { shopId: manager.shopId, name: "退職済み", isDeleted: true });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId: manager.shopId,
      periodStart: "2020-01-01",
      periodEnd: "2020-01-02",
      deadline: "2019-12-25",
      shopClosedDates: [],
      status: "open",
      isDeleted: false,
      submissionPattern: { kind: "dateOnly" },
    });
    const positionId = await ctx.db.insert("positions", {
      shopId: manager.shopId,
      name: "シフト",
      color: "#000000",
      sortOrder: 0,
      isDefault: true,
      isDeleted: false,
    });
    await ctx.db.insert("shiftAssignments", {
      recruitmentId,
      staffId: removed,
      positionId,
      date: "2020-01-01",
      startTime: "09:00",
      endTime: "17:00",
    });
    if (ordered) {
      await ctx.db.insert("organizationStaffOrderStates", {
        organizationId: manager.organizationId,
        revision: 1,
        activatedAt: 1,
        updatedAt: 1,
      });
      for (const [displayOrder, staffId] of [second, excluded, first, managerStaff].entries()) {
        const staff = await ctx.db.get(staffId);
        if (!staff) throw new Error("missing fixture");
        await ctx.db.insert("organizationStaffOrderEntries", {
          organizationId: manager.organizationId,
          organizationPersonId: staff.organizationPersonId,
          displayOrder,
        });
        await ctx.db.insert("shopStaffOrderEntries", {
          organizationId: manager.organizationId,
          organizationPersonId: staff.organizationPersonId,
          shopId: manager.shopId,
          staffId,
          displayOrder,
        });
      }
    }
    return { ...manager, recruitmentId, first, second, managerStaff, excluded, removed };
  });
  const args = {
    shopId: ids.shopId,
    expectedOrganizationId: ids.organizationId,
    recruitmentId: ids.recruitmentId,
    refreshDayKey: "test",
  };
  return {
    t,
    ids,
    args,
    query: () => t.withIdentity({ subject: "export-order" }).query(api.shiftBoard.queries.getShiftBoardData, args),
  };
}

describe("出力用のDashboard順", () => {
  it.each([false, true])(
    "保存順序あり=%sで同名スタッフを区別し、対象外を除き、履歴スタッフを末尾へ置く",
    async (ordered) => {
      const { ids, query } = await setup(ordered);
      const result = await query();
      expect(result?.exportStaffOrder).toEqual(
        ordered
          ? [ids.second, ids.first, ids.managerStaff, ids.removed]
          : [ids.managerStaff, ids.first, ids.second, ids.removed],
      );
      expect(result?.staffs.map((staff) => staff._id)).toEqual([ids.first, ids.second, ids.managerStaff, ids.removed]);
    },
  );
  it("上限超過を一部だけの並び順として返さない", async () => {
    const { t, ids, query } = await setup(false);
    await t.run(async (ctx) => {
      for (let i = 0; i < SHIFT_BOARD_STAFF_LIMIT; i++) await seedStaff(ctx, { shopId: ids.shopId, name: `追加${i}` });
    });
    await expect(query()).rejects.toThrow("スタッフ数が上限");
  });
  it("未認証と他組織の指定から順序を取得させない", async () => {
    const { t, args } = await setup(true);
    await expect(t.query(api.shiftBoard.queries.getShiftBoardData, args)).resolves.toBeNull();
    const other = await t.run((ctx) => seedManagerShop(ctx, { subject: "other" }));
    await expect(
      t
        .withIdentity({ subject: "export-order" })
        .query(api.shiftBoard.queries.getShiftBoardData, { ...args, expectedOrganizationId: other.organizationId }),
    ).resolves.toBeNull();
  });
});
