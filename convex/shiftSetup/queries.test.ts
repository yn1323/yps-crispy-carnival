import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedManagerShop, seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const MANAGER_SUBJECT = "shift_setup_query_manager";
const OTHER_MANAGER_SUBJECT = "shift_setup_query_other_manager";

async function seedShiftSetup(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const actor = await seedManagerShop(ctx, { subject: MANAGER_SUBJECT, shopName: "設定店舗" });
    const other = await seedOrganizationManagerShop(ctx, { subject: OTHER_MANAGER_SUBJECT, shopName: "別組織店舗" });
    await ctx.db.patch(actor.shopId, {
      submissionPattern: { kind: "time", startTime: "10:00", endTime: "23:00" },
      regularClosedDays: ["wed"],
      breakRule: { minWorkMinutes: 360, breakMinutes: 45 },
    });

    const insertPosition = (
      shopId: typeof actor.shopId,
      position: { name: string; color: string; sortOrder: number; isDefault?: boolean; isDeleted?: boolean },
    ) =>
      ctx.db.insert("positions", {
        shopId,
        name: position.name,
        color: position.color,
        sortOrder: position.sortOrder,
        isDefault: position.isDefault ?? false,
        isDeleted: position.isDeleted ?? false,
      });
    // 並び順は登録順ではなくsortOrderで決まることを確かめるため、登録順をずらす。
    const kitchenPositionId = await insertPosition(actor.shopId, { name: "キッチン", color: "#c2410c", sortOrder: 2 });
    const deletedPositionId = await insertPosition(actor.shopId, {
      name: "削除済みポジション",
      color: "#dc2626",
      sortOrder: 3,
      isDeleted: true,
    });
    const hallPositionId = await insertPosition(actor.shopId, { name: "ホール", color: "#7c3aed", sortOrder: 1 });
    const defaultPositionId = await insertPosition(actor.shopId, {
      name: "シフト",
      color: "#3b82f6",
      sortOrder: 0,
      isDefault: true,
    });
    const otherPositionId = await insertPosition(other.shopId, {
      name: "別組織のポジション",
      color: "#3b82f6",
      sortOrder: 0,
      isDefault: true,
    });

    const weekendTemplateId = await ctx.db.insert("shiftDayTemplates", {
      shopId: actor.shopId,
      name: "週末",
      weekdays: ["sat", "sun"],
      sortOrder: 1,
      slots: [],
    });
    const weekdayTemplateId = await ctx.db.insert("shiftDayTemplates", {
      shopId: actor.shopId,
      name: "平日",
      weekdays: ["mon", "tue"],
      sortOrder: 0,
      slots: [
        {
          key: { kind: "time", startTime: "10:00", endTime: "15:00" },
          requirements: [
            { positionId: hallPositionId, count: 2 },
            { positionId: deletedPositionId, count: 1 },
            { positionId: kitchenPositionId, count: 0 },
          ],
        },
        { key: { kind: "time", startTime: "15:00", endTime: "23:00" }, requirements: [] },
      ],
    });
    await ctx.db.insert("shiftDayTemplates", {
      shopId: other.shopId,
      name: "別組織の型",
      weekdays: ["mon"],
      sortOrder: 0,
      slots: [
        {
          key: { kind: "time", startTime: "09:00", endTime: "22:00" },
          requirements: [{ positionId: otherPositionId, count: 5 }],
        },
      ],
    });

    const leadStaffId = await seedStaff(ctx, {
      shopId: actor.shopId,
      name: "責任者スタッフ",
      email: "lead@example.com",
    });
    await ctx.db.patch(leadStaffId, {
      unavailablePositionIds: [kitchenPositionId, deletedPositionId],
      skillLevel: "lead",
    });
    const standardStaffId = await seedStaff(ctx, {
      shopId: actor.shopId,
      name: "標準スタッフ",
      email: "standard@example.com",
    });
    const excludedStaffId = await seedStaff(ctx, {
      shopId: actor.shopId,
      name: "シフト対象外スタッフ",
      email: "excluded@example.com",
      excludedFromShift: true,
    });
    await ctx.db.patch(excludedStaffId, { skillLevel: "newcomer" });
    const deletedStaffId = await seedStaff(ctx, {
      shopId: actor.shopId,
      name: "削除済みスタッフ",
      email: "deleted@example.com",
      isDeleted: true,
    });
    await ctx.db.patch(deletedStaffId, { skillLevel: "newcomer" });
    await seedStaff(ctx, { shopId: other.shopId, name: "別組織スタッフ", email: "other-staff@example.com" });

    return {
      actor,
      other,
      defaultPositionId,
      hallPositionId,
      kitchenPositionId,
      weekdayTemplateId,
      weekendTemplateId,
      leadStaffId,
      standardStaffId,
    };
  });
}

describe("shiftSetup/queries", () => {
  describe("getShiftSetup", () => {
    beforeEach(() => {
      // ローカルの環境変数に左右されないよう、未設定の状態を明示する。
      vi.stubEnv("SHIFT_SETUP_ASSIST_MODE", "");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("未認証ではnullを返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShiftSetup(t);

      await expect(
        t.query(api.shiftSetup.queries.getShiftSetup, {
          shopId: ids.actor.shopId,
          expectedOrganizationId: ids.actor.organizationId,
        }),
      ).resolves.toBeNull();
    });

    it("別組織の店舗を指定した場合は、自組織のIDを添えてもnullを返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShiftSetup(t);
      const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });

      await expect(
        asManager.query(api.shiftSetup.queries.getShiftSetup, {
          shopId: ids.other.shopId,
          expectedOrganizationId: ids.actor.organizationId,
        }),
      ).resolves.toBeNull();
      await expect(
        asManager.query(api.shiftSetup.queries.getShiftSetup, {
          shopId: ids.other.shopId,
          expectedOrganizationId: ids.other.organizationId,
        }),
      ).resolves.toBeNull();
    });

    it("別組織の管理者には、店舗の設定を返さない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShiftSetup(t);

      await expect(
        t.withIdentity({ subject: OTHER_MANAGER_SUBJECT }).query(api.shiftSetup.queries.getShiftSetup, {
          shopId: ids.actor.shopId,
          expectedOrganizationId: ids.actor.organizationId,
        }),
      ).resolves.toBeNull();
    });

    it("削除済みの店舗ではnullを返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShiftSetup(t);
      await t.run(async (ctx) => await ctx.db.patch(ids.actor.shopId, { isDeleted: true }));

      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).query(api.shiftSetup.queries.getShiftSetup, {
          shopId: ids.actor.shopId,
          expectedOrganizationId: ids.actor.organizationId,
        }),
      ).resolves.toBeNull();
    });

    it("店舗の設定とシフト対象スタッフの属性を、有効なものだけの最小DTOで返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShiftSetup(t);

      const result = await t.withIdentity({ subject: MANAGER_SUBJECT }).query(api.shiftSetup.queries.getShiftSetup, {
        shopId: ids.actor.shopId,
        expectedOrganizationId: ids.actor.organizationId,
      });

      expect(result).toEqual({
        shopName: "設定店舗",
        submissionPattern: { kind: "time", startTime: "10:00", endTime: "23:00" },
        regularClosedDays: ["wed"],
        canWriteBusinessData: true,
        businessWriteBlockReason: null,
        positions: [
          { _id: ids.defaultPositionId, name: "シフト", color: "#3b82f6", isDefault: true },
          { _id: ids.hallPositionId, name: "ホール", color: "#7c3aed", isDefault: false },
          { _id: ids.kitchenPositionId, name: "キッチン", color: "#c2410c", isDefault: false },
        ],
        dayTemplates: [
          {
            _id: ids.weekdayTemplateId,
            name: "平日",
            weekdays: ["mon", "tue"],
            slots: [
              {
                key: { kind: "time", startTime: "10:00", endTime: "15:00" },
                requirements: [{ positionId: ids.hallPositionId, count: 2 }],
              },
              { key: { kind: "time", startTime: "15:00", endTime: "23:00" }, requirements: [] },
            ],
          },
          { _id: ids.weekendTemplateId, name: "週末", weekdays: ["sat", "sun"], slots: [] },
        ],
        breakRule: { minWorkMinutes: 360, breakMinutes: 45 },
        staffs: [
          {
            _id: ids.leadStaffId,
            name: "責任者スタッフ",
            unavailablePositionIds: [ids.kitchenPositionId],
            skillLevel: "lead",
          },
          { _id: ids.standardStaffId, name: "標準スタッフ", unavailablePositionIds: [], skillLevel: "standard" },
        ],
        assistAvailable: false,
      });
    });

    it("残ったポジションのすべてが入れない設定のスタッフは、入れないポジションなしで返す", async () => {
      const t = convexTest(schema, modules);
      const fixture = await seedShiftSetup(t);
      // 責任者スタッフの入れないポジションはキッチンと削除済みの1件。既定とホールも入れない状態にする。
      await t.run(async (ctx) => {
        await ctx.db.patch(fixture.leadStaffId, {
          unavailablePositionIds: [fixture.defaultPositionId, fixture.hallPositionId, fixture.kitchenPositionId],
        });
      });

      const result = await t.withIdentity({ subject: MANAGER_SUBJECT }).query(api.shiftSetup.queries.getShiftSetup, {
        shopId: fixture.actor.shopId,
        expectedOrganizationId: fixture.actor.organizationId,
      });

      expect(result?.positions.map((position) => position._id)).toHaveLength(3);
      expect(result?.staffs.filter((staff) => staff._id === fixture.leadStaffId)).toEqual([
        { _id: fixture.leadStaffId, name: "責任者スタッフ", unavailablePositionIds: [], skillLevel: "lead" },
      ]);
    });

    it("何も設定していない店舗では、空の一覧と決まりなしを返す", async () => {
      const t = convexTest(schema, modules);
      const actor = await t.run(async (ctx) =>
        seedManagerShop(ctx, { subject: MANAGER_SUBJECT, shopName: "未設定店舗" }),
      );

      const result = await t.withIdentity({ subject: MANAGER_SUBJECT }).query(api.shiftSetup.queries.getShiftSetup, {
        shopId: actor.shopId,
        expectedOrganizationId: actor.organizationId,
      });

      expect(result).toEqual({
        shopName: "未設定店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        canWriteBusinessData: true,
        businessWriteBlockReason: null,
        positions: [],
        dayTemplates: [],
        breakRule: null,
        staffs: [],
        assistAvailable: false,
      });
    });

    it("SHIFT_SETUP_ASSIST_MODEがrandomの環境では、AIサポートを使えると返す", async () => {
      vi.stubEnv("SHIFT_SETUP_ASSIST_MODE", "random");
      const t = convexTest(schema, modules);
      const actor = await t.run(async (ctx) =>
        seedManagerShop(ctx, { subject: MANAGER_SUBJECT, shopName: "AIサポート店舗" }),
      );

      const result = await t.withIdentity({ subject: MANAGER_SUBJECT }).query(api.shiftSetup.queries.getShiftSetup, {
        shopId: actor.shopId,
        expectedOrganizationId: actor.organizationId,
      });

      expect(result).not.toBeNull();
      expect(result?.assistAvailable).toBe(true);
    });
  });
});
