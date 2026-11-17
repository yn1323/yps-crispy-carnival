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
      appliesToHolidays: true,
      requirements: { kind: "time", bars: [] },
    });
    const weekdayTemplateId = await ctx.db.insert("shiftDayTemplates", {
      shopId: actor.shopId,
      name: "平日",
      weekdays: ["mon", "tue"],
      sortOrder: 0,
      appliesToHolidays: false,
      requirements: {
        kind: "time",
        bars: [
          // 受付時間（10:00-23:00）より前に始まるバー。消さずにそのまま返す。
          { positionId: hallPositionId, startTime: "09:00", endTime: "12:00" },
          { positionId: hallPositionId, startTime: "10:00", endTime: "15:00" },
          { positionId: deletedPositionId, startTime: "10:00", endTime: "15:00" },
          { positionId: hallPositionId, startTime: "15:00", endTime: "23:00" },
          { positionId: kitchenPositionId, startTime: "17:00", endTime: "23:30" },
        ],
      },
    });
    // 店舗が集め方を変える前に保存したテンプレート。必要人数の種類が、いまの集め方（時間指定）と違う。
    const staleTemplateId = await ctx.db.insert("shiftDayTemplates", {
      shopId: actor.shopId,
      name: "集め方を変える前のテンプレート",
      weekdays: ["fri"],
      sortOrder: 2,
      appliesToHolidays: false,
      requirements: { kind: "dateOnly", counts: [{ positionId: hallPositionId, count: 3 }] },
    });
    await ctx.db.insert("shiftDayTemplates", {
      shopId: other.shopId,
      name: "別組織のテンプレート",
      weekdays: ["mon"],
      sortOrder: 0,
      appliesToHolidays: false,
      requirements: { kind: "time", bars: [{ positionId: otherPositionId, startTime: "09:00", endTime: "22:00" }] },
    });

    const leadStaffId = await seedStaff(ctx, {
      shopId: actor.shopId,
      name: "リーダースタッフ",
      email: "lead@example.com",
    });
    // 保存の順はポジションの並び順とずらし、削除済みと別組織のポジションを指す項目も混ぜる。
    await ctx.db.patch(leadStaffId, {
      positionSkills: [
        { positionId: kitchenPositionId, level: "unavailable" },
        { positionId: deletedPositionId, level: "unavailable" },
        { positionId: otherPositionId, level: "newcomer" },
        { positionId: hallPositionId, level: "newcomer" },
        { positionId: defaultPositionId, level: "lead" },
      ],
    });
    const standardStaffId = await seedStaff(ctx, {
      shopId: actor.shopId,
      name: "一人前スタッフ",
      email: "standard@example.com",
    });
    const excludedStaffId = await seedStaff(ctx, {
      shopId: actor.shopId,
      name: "シフト対象外スタッフ",
      email: "excluded@example.com",
      excludedFromShift: true,
    });
    await ctx.db.patch(excludedStaffId, { positionSkills: [{ positionId: hallPositionId, level: "newcomer" }] });
    const deletedStaffId = await seedStaff(ctx, {
      shopId: actor.shopId,
      name: "削除済みスタッフ",
      email: "deleted@example.com",
      isDeleted: true,
    });
    await ctx.db.patch(deletedStaffId, { positionSkills: [{ positionId: hallPositionId, level: "newcomer" }] });
    await seedStaff(ctx, { shopId: other.shopId, name: "別組織スタッフ", email: "other-staff@example.com" });

    return {
      actor,
      other,
      defaultPositionId,
      deletedPositionId,
      hallPositionId,
      kitchenPositionId,
      weekdayTemplateId,
      weekendTemplateId,
      staleTemplateId,
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
            appliesToHolidays: false,
            // 受付時間の外に出たバーは残し、削除済みのポジションのバーだけを除く。
            requirements: {
              kind: "time",
              bars: [
                { positionId: ids.hallPositionId, startTime: "09:00", endTime: "12:00" },
                { positionId: ids.hallPositionId, startTime: "10:00", endTime: "15:00" },
                { positionId: ids.hallPositionId, startTime: "15:00", endTime: "23:00" },
                { positionId: ids.kitchenPositionId, startTime: "17:00", endTime: "23:30" },
              ],
            },
            requiresReentry: false,
          },
          {
            _id: ids.weekendTemplateId,
            name: "週末",
            weekdays: ["sat", "sun"],
            appliesToHolidays: true,
            requirements: { kind: "time", bars: [] },
            requiresReentry: false,
          },
          {
            _id: ids.staleTemplateId,
            name: "集め方を変える前のテンプレート",
            weekdays: ["fri"],
            appliesToHolidays: false,
            // 種類が違う必要人数は返さず、いまの種類の空の必要人数にして、入れ直しが要ることを伝える。
            requirements: { kind: "time", bars: [] },
            requiresReentry: true,
          },
        ],
        breakRule: { minWorkMinutes: 360, breakMinutes: 45 },
        staffs: [
          {
            _id: ids.leadStaffId,
            name: "リーダースタッフ",
            // 削除済みと別組織のポジションを指す項目を除き、ポジションの並び順で返す。
            positionSkills: [
              { positionId: ids.defaultPositionId, level: "lead" },
              { positionId: ids.hallPositionId, level: "newcomer" },
              { positionId: ids.kitchenPositionId, level: "unavailable" },
            ],
          },
          { _id: ids.standardStaffId, name: "一人前スタッフ", positionSkills: [] },
        ],
        assistAvailable: false,
      });
    });

    it("ポジションの削除で、残ったポジションのすべてが担当外になったスタッフは、担当外の項目を返さない", async () => {
      const t = convexTest(schema, modules);
      const fixture = await seedShiftSetup(t);
      const getStaffs = async () => {
        const result = await t.withIdentity({ subject: MANAGER_SUBJECT }).query(api.shiftSetup.queries.getShiftSetup, {
          shopId: fixture.actor.shopId,
          expectedOrganizationId: fixture.actor.organizationId,
        });
        return {
          positionIds: result?.positions.map((position) => position._id),
          staffs: result?.staffs.filter((staff) => staff._id === fixture.leadStaffId),
        };
      };
      // 既定とホールが担当外で、キッチンではリーダーのスタッフにする。
      await t.run(async (ctx) => {
        await ctx.db.patch(fixture.leadStaffId, {
          positionSkills: [
            { positionId: fixture.defaultPositionId, level: "unavailable" },
            { positionId: fixture.hallPositionId, level: "unavailable" },
            { positionId: fixture.kitchenPositionId, level: "lead" },
          ],
        });
      });

      // 担当できるポジションが残っている間は、保存した項目をそのまま返す。
      await expect(getStaffs()).resolves.toEqual({
        positionIds: [fixture.defaultPositionId, fixture.hallPositionId, fixture.kitchenPositionId],
        staffs: [
          {
            _id: fixture.leadStaffId,
            name: "リーダースタッフ",
            positionSkills: [
              { positionId: fixture.defaultPositionId, level: "unavailable" },
              { positionId: fixture.hallPositionId, level: "unavailable" },
              { positionId: fixture.kitchenPositionId, level: "lead" },
            ],
          },
        ],
      });

      // 担当できる唯一のポジションだったキッチンを削除する。
      await t.run(async (ctx) => {
        await ctx.db.patch(fixture.kitchenPositionId, { isDeleted: true });
      });

      await expect(getStaffs()).resolves.toEqual({
        positionIds: [fixture.defaultPositionId, fixture.hallPositionId],
        staffs: [{ _id: fixture.leadStaffId, name: "リーダースタッフ", positionSkills: [] }],
      });
    });

    it("パターン選択の店舗では、店舗にない勤務パターンと削除済みのポジションの人数を除き、設定順で返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShiftSetup(t);
      const templateId = await t.run(async (ctx) => {
        await ctx.db.patch(ids.actor.shopId, {
          submissionPattern: {
            kind: "shiftType",
            options: [
              { id: "early", name: "早番", startTime: "10:00", endTime: "16:00", sortOrder: 0 },
              { id: "late", name: "遅番", startTime: "16:00", endTime: "23:00", sortOrder: 1 },
            ],
          },
        });
        return await ctx.db.insert("shiftDayTemplates", {
          shopId: ids.actor.shopId,
          name: "パターンのテンプレート",
          weekdays: ["thu"],
          sortOrder: 3,
          appliesToHolidays: false,
          requirements: {
            kind: "shiftType",
            options: [
              { optionId: "late", counts: [{ positionId: ids.kitchenPositionId, count: 1 }] },
              { optionId: "removed", counts: [{ positionId: ids.hallPositionId, count: 4 }] },
              {
                optionId: "early",
                counts: [
                  { positionId: ids.deletedPositionId, count: 2 },
                  { positionId: ids.hallPositionId, count: 2 },
                ],
              },
            ],
          },
        });
      });

      const result = await t.withIdentity({ subject: MANAGER_SUBJECT }).query(api.shiftSetup.queries.getShiftSetup, {
        shopId: ids.actor.shopId,
        expectedOrganizationId: ids.actor.organizationId,
      });

      const emptyReentry = { requirements: { kind: "shiftType", options: [] }, requiresReentry: true };
      expect(result?.dayTemplates).toEqual([
        // 時間指定のときに保存したテンプレートは、入れ直しが要るテンプレートとして返す。
        {
          _id: ids.weekdayTemplateId,
          name: "平日",
          weekdays: ["mon", "tue"],
          appliesToHolidays: false,
          ...emptyReentry,
        },
        {
          _id: ids.weekendTemplateId,
          name: "週末",
          weekdays: ["sat", "sun"],
          appliesToHolidays: true,
          ...emptyReentry,
        },
        {
          _id: ids.staleTemplateId,
          name: "集め方を変える前のテンプレート",
          weekdays: ["fri"],
          appliesToHolidays: false,
          ...emptyReentry,
        },
        {
          _id: templateId,
          name: "パターンのテンプレート",
          weekdays: ["thu"],
          appliesToHolidays: false,
          requirements: {
            kind: "shiftType",
            options: [
              { optionId: "early", counts: [{ positionId: ids.hallPositionId, count: 2 }] },
              { optionId: "late", counts: [{ positionId: ids.kitchenPositionId, count: 1 }] },
            ],
          },
          requiresReentry: false,
        },
      ]);
    });

    it("スタッフは、並び順を持つ組織ではその順で、持たない組織では登録した順で返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const actor = await seedManagerShop(ctx, { subject: MANAGER_SUBJECT, shopName: "並び順の店舗" });
        const first = await seedStaff(ctx, { shopId: actor.shopId, name: "先に登録" });
        const second = await seedStaff(ctx, { shopId: actor.shopId, name: "あとに登録" });
        const excluded = await seedStaff(ctx, { shopId: actor.shopId, name: "対象外", excludedFromShift: true });
        // 並び順は組織の全員がそろって初めて有効になるため、管理者本人のスタッフも用意する。
        await seedStaff(ctx, { shopId: actor.shopId, name: "管理者", userId: actor.userId });
        return { ...actor, first, second, excluded };
      });
      const read = async () =>
        (
          await t.withIdentity({ subject: MANAGER_SUBJECT }).query(api.shiftSetup.queries.getShiftSetup, {
            shopId: ids.shopId,
            expectedOrganizationId: ids.organizationId,
          })
        )?.staffs.map((staff) => staff.name);

      const before = await read();
      expect(before?.filter((name) => name === "先に登録" || name === "あとに登録")).toEqual([
        "先に登録",
        "あとに登録",
      ]);

      // ダッシュボードで並べ替えたあとの状態。登録した順と逆にする。
      await t.run(async (ctx) => {
        await ctx.db.insert("organizationStaffOrderStates", {
          organizationId: ids.organizationId,
          revision: 1,
          activatedAt: 1,
          updatedAt: 1,
        });
        const all = await ctx.db
          .query("staffs")
          .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", ids.shopId).eq("isDeleted", false))
          .collect();
        const rest = all.filter((staff) => ![ids.first, ids.second, ids.excluded].includes(staff._id));
        const ordered = [ids.second, ids.excluded, ids.first, ...rest.map((staff) => staff._id)];
        for (const [displayOrder, staffId] of ordered.entries()) {
          const staff = all.find((item) => item._id === staffId);
          if (!staff) throw new Error("missing fixture");
          await ctx.db.insert("organizationStaffOrderEntries", {
            organizationId: ids.organizationId,
            organizationPersonId: staff.organizationPersonId,
            displayOrder,
          });
          await ctx.db.insert("shopStaffOrderEntries", {
            organizationId: ids.organizationId,
            organizationPersonId: staff.organizationPersonId,
            shopId: ids.shopId,
            staffId,
            displayOrder,
          });
        }
      });

      const after = await read();
      // シフト対象外のスタッフは、並び順を持っていても返さない。
      expect(after?.filter((name) => name !== undefined).slice(0, 2)).toEqual(["あとに登録", "先に登録"]);
      expect(after).not.toContain("対象外");
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
