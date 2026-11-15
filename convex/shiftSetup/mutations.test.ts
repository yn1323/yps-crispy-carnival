import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedManagerShop, seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  POSITION_ACTIVE_LIMIT,
  POSITION_COLOR_PALETTE,
  SHIFT_BOARD_STAFF_LIMIT,
  SHIFT_DAY_TEMPLATE_LIMIT,
  SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX,
  SHIFT_DAY_TEMPLATE_SLOT_LIMIT,
} from "../constants";

const MANAGER_SUBJECT = "shift_setup_manager";
const OTHER_MANAGER_SUBJECT = "shift_setup_other_manager";

const SHIFT_TYPE_PATTERN: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
  ],
};

type Test = TestConvex<typeof schema>;
type MutationClient = Pick<Test, "mutation">;
type SeededIds = Awaited<ReturnType<typeof seedShops>>;
type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
type SlotKey =
  | { kind: "time"; startTime: string; endTime: string }
  | { kind: "shiftType"; optionId: string }
  | { kind: "allDay" };
type TemplateInput = {
  id?: Id<"shiftDayTemplates">;
  name: string;
  weekdays: Weekday[];
  slots: Array<{ key: SlotKey; requirements: Array<{ positionId: Id<"positions">; count: number }> }>;
};

const timeKey = (startTime: string, endTime: string): SlotKey => ({ kind: "time", startTime, endTime });

/**
 * 対象店舗（時間指定 09:00-22:00）と、同じ組織の別店舗、別組織の店舗を用意する。
 * 別店舗と別組織には、IDを取り違えたときに拒否されることを確かめるためのデータを置く。
 */
async function seedShops(t: Test, options?: { submissionPattern?: ShiftSubmissionPattern }) {
  return await t.run(async (ctx) => {
    const actor = await seedManagerShop(ctx, { subject: MANAGER_SUBJECT, shopName: "設定店舗" });
    const other = await seedOrganizationManagerShop(ctx, { subject: OTHER_MANAGER_SUBJECT, shopName: "別組織店舗" });
    if (options?.submissionPattern) {
      await ctx.db.patch(actor.shopId, { submissionPattern: options.submissionPattern });
    }
    const siblingShopId = await ctx.db.insert("shops", {
      organizationId: actor.organizationId,
      name: "同じ組織の別店舗",
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      regularClosedDays: [],
      isDeleted: false,
    });

    const insertPosition = (
      shopId: Id<"shops">,
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
    const defaultPositionId = await insertPosition(actor.shopId, {
      name: "シフト",
      color: "#3b82f6",
      sortOrder: 0,
      isDefault: true,
    });
    const hallPositionId = await insertPosition(actor.shopId, { name: "ホール", color: "#7c3aed", sortOrder: 1 });
    const kitchenPositionId = await insertPosition(actor.shopId, { name: "キッチン", color: "#c2410c", sortOrder: 2 });
    const deletedPositionId = await insertPosition(actor.shopId, {
      name: "削除済みポジション",
      color: "#dc2626",
      sortOrder: 3,
      isDeleted: true,
    });
    const siblingPositionId = await insertPosition(siblingShopId, {
      name: "別店舗のポジション",
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

    const insertTemplate = (shopId: Id<"shops">, name: string) =>
      ctx.db.insert("shiftDayTemplates", { shopId, name, weekdays: [], sortOrder: 0, slots: [] });
    const siblingTemplateId = await insertTemplate(siblingShopId, "別店舗の型");
    const otherTemplateId = await insertTemplate(other.shopId, "別組織の型");
    const deletedTemplateId = await insertTemplate(actor.shopId, "削除する型");
    await ctx.db.delete(deletedTemplateId);

    const staffId = await seedStaff(ctx, { shopId: actor.shopId, name: "対象スタッフ", email: "target@example.com" });
    const secondStaffId = await seedStaff(ctx, {
      shopId: actor.shopId,
      name: "2人目のスタッフ",
      email: "second@example.com",
    });
    const deletedStaffId = await seedStaff(ctx, {
      shopId: actor.shopId,
      name: "削除済みスタッフ",
      email: "deleted@example.com",
      isDeleted: true,
    });
    const siblingStaffId = await seedStaff(ctx, {
      shopId: siblingShopId,
      name: "別店舗のスタッフ",
      email: "sibling@example.com",
    });
    const otherStaffId = await seedStaff(ctx, {
      shopId: other.shopId,
      name: "別組織のスタッフ",
      email: "other-staff@example.com",
    });

    return {
      shopId: actor.shopId,
      organizationId: actor.organizationId,
      scope: { shopId: actor.shopId, expectedOrganizationId: actor.organizationId },
      siblingShopId,
      otherShopId: other.shopId,
      defaultPositionId,
      hallPositionId,
      kitchenPositionId,
      deletedPositionId,
      siblingPositionId,
      otherPositionId,
      siblingTemplateId,
      otherTemplateId,
      deletedTemplateId,
      staffId,
      secondStaffId,
      deletedStaffId,
      siblingStaffId,
      otherStaffId,
    };
  });
}

/** 設定の保存が書き込みうるtableを、全店舗分まとめて読む。 */
async function readSetupState(t: Test) {
  return await t.run(async (ctx) => ({
    positions: await ctx.db.query("positions").collect(),
    dayTemplates: await ctx.db.query("shiftDayTemplates").collect(),
    dayTemplateOverrides: await ctx.db.query("shiftDayTemplateOverrides").collect(),
    shops: await ctx.db.query("shops").collect(),
    staffs: await ctx.db.query("staffs").collect(),
  }));
}

/** 保存が拒否され、どの店舗の設定も変わらないことを確かめる。 */
async function expectRejectedWithoutChange(t: Test, run: () => Promise<unknown>, message: string) {
  const before = await readSetupState(t);
  await expect(run()).rejects.toThrowError(message);
  expect(await readSetupState(t)).toEqual(before);
}

function projectPositions(positions: Doc<"positions">[], shopId: Id<"shops">, labels: Map<Id<"positions">, string>) {
  return positions
    .filter((position) => position.shopId === shopId)
    .map((position) => ({
      key: labels.get(position._id) ?? "new",
      name: position.name,
      color: position.color,
      sortOrder: position.sortOrder,
      isDefault: position.isDefault,
      isDeleted: position.isDeleted,
    }))
    .sort((a, b) => Number(a.isDeleted) - Number(b.isDeleted) || a.sortOrder - b.sortOrder);
}

function projectTemplates(templates: Doc<"shiftDayTemplates">[], shopId: Id<"shops">) {
  return templates
    .filter((template) => template.shopId === shopId)
    .map(({ name, weekdays, sortOrder, slots }) => ({ name, weekdays, sortOrder, slots }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

describe("shiftSetup/mutations", () => {
  describe("認証と組織の境界", () => {
    const mutations: Array<{
      name: string;
      run: (client: MutationClient, ids: SeededIds, scope: SeededIds["scope"]) => Promise<null>;
    }> = [
      {
        name: "savePositions",
        run: (client, ids, scope) =>
          client.mutation(api.shiftSetup.mutations.savePositions, {
            ...scope,
            positions: [{ id: ids.defaultPositionId, name: "書き換えたポジション", color: "#3b82f6" }],
          }),
      },
      {
        name: "saveDayTemplates",
        run: (client, _ids, scope) =>
          client.mutation(api.shiftSetup.mutations.saveDayTemplates, {
            ...scope,
            templates: [{ name: "書き込んだ型", weekdays: ["mon"], slots: [] }],
          }),
      },
      {
        name: "saveBreakRule",
        run: (client, _ids, scope) =>
          client.mutation(api.shiftSetup.mutations.saveBreakRule, {
            ...scope,
            breakRule: { minWorkMinutes: 360, breakMinutes: 45 },
          }),
      },
      {
        name: "saveStaffShiftProfiles",
        run: (client, ids, scope) =>
          client.mutation(api.shiftSetup.mutations.saveStaffShiftProfiles, {
            ...scope,
            profiles: [{ staffId: ids.staffId, unavailablePositionIds: [ids.hallPositionId], skillLevel: "lead" }],
          }),
      },
      {
        name: "setDayTemplateOverride",
        run: (client, _ids, scope) =>
          client.mutation(api.shiftSetup.mutations.setDayTemplateOverride, {
            ...scope,
            date: "2026-01-20",
            templateId: null,
          }),
      },
    ];

    it.each(mutations)("$name: 未認証は拒否し、設定を変えない", async ({ run }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(t, () => run(t, ids, ids.scope), "Unauthenticated");
    });

    it.each(mutations)("$name: 別組織の管理者は拒否し、設定を変えない", async ({ run }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const asOtherManager = t.withIdentity({ subject: OTHER_MANAGER_SUBJECT });

      await expectRejectedWithoutChange(t, () => run(asOtherManager, ids, ids.scope), "Not found");
    });

    it.each(mutations)("$name: 別組織の店舗を、自組織のIDを添えて指定しても拒否する", async ({ run }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });

      await expectRejectedWithoutChange(
        t,
        () => run(asManager, ids, { shopId: ids.otherShopId, expectedOrganizationId: ids.organizationId }),
        "Not found",
      );
    });
  });

  describe("savePositions", () => {
    it("既定のポジションをまだ持たない店舗では、既定を作って先頭に残し、入力のポジションを後ろへ足す", async () => {
      const t = convexTest(schema, modules);
      const actor = await t.run(async (ctx) =>
        seedOrganizationManagerShop(ctx, { subject: "shift_setup_no_default_manager", shopName: "既定なし店舗" }),
      );

      await t
        .withIdentity({ subject: "shift_setup_no_default_manager" })
        .mutation(api.shiftSetup.mutations.savePositions, {
          shopId: actor.shopId,
          expectedOrganizationId: actor.organizationId,
          // 画面は既定のポジションを知らないため、既定と同じ色で送ることがある。
          positions: [
            { name: "ホール", color: "#c2410c" },
            { name: "キッチン", color: "#3b82f6" },
          ],
        });

      const positions = await t.run(async (ctx) =>
        ctx.db
          .query("positions")
          .withIndex("by_shopId", (q) => q.eq("shopId", actor.shopId))
          .collect(),
      );
      expect(
        positions
          .map(({ name, color, sortOrder, isDefault, isDeleted }) => ({ name, color, sortOrder, isDefault, isDeleted }))
          .sort((left, right) => left.sortOrder - right.sortOrder),
      ).toEqual([
        { name: "シフト", color: "#3b82f6", sortOrder: 0, isDefault: true, isDeleted: false },
        { name: "ホール", color: "#c2410c", sortOrder: 1, isDefault: false, isDeleted: false },
        // 既定と重なった色は、まだ使っていない色へ置き換える。
        { name: "キッチン", color: "#7c3aed", sortOrder: 2, isDefault: false, isDeleted: false },
      ]);
    });

    it("追加、名前と色の変更、並び替え、削除を、渡した一覧のとおりに保存する", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const before = await readSetupState(t);

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.savePositions, {
        ...ids.scope,
        positions: [
          { id: ids.kitchenPositionId, name: "キッチン", color: "#c2410c" },
          { id: ids.defaultPositionId, name: " フロア ", color: "#0f766e" },
          { name: "レジ", color: "#db2777" },
        ],
      });

      const after = await readSetupState(t);
      const labels = new Map([
        [ids.defaultPositionId, "default"],
        [ids.hallPositionId, "hall"],
        [ids.kitchenPositionId, "kitchen"],
        [ids.deletedPositionId, "deleted"],
      ]);
      expect(projectPositions(after.positions, ids.shopId, labels)).toEqual([
        { key: "kitchen", name: "キッチン", color: "#c2410c", sortOrder: 0, isDefault: false, isDeleted: false },
        { key: "default", name: "フロア", color: "#0f766e", sortOrder: 1, isDefault: true, isDeleted: false },
        { key: "new", name: "レジ", color: "#db2777", sortOrder: 2, isDefault: false, isDeleted: false },
        // 一覧から外したポジションは、行を消さずに論理削除する。
        { key: "hall", name: "ホール", color: "#7c3aed", sortOrder: 1, isDefault: false, isDeleted: true },
        {
          key: "deleted",
          name: "削除済みポジション",
          color: "#dc2626",
          sortOrder: 3,
          isDefault: false,
          isDeleted: true,
        },
      ]);
      // ほかの店舗のポジションと、ポジション以外の設定は変えない。
      expect(after.positions.filter((position) => position.shopId !== ids.shopId)).toEqual(
        before.positions.filter((position) => position.shopId !== ids.shopId),
      );
      expect({ ...after, positions: [] }).toEqual({ ...before, positions: [] });
    });

    it("同じ一覧をもう一度保存しても、同じ状態のままである", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
      const positions = [
        { id: ids.defaultPositionId, name: "シフト", color: "#3b82f6" },
        { id: ids.kitchenPositionId, name: "キッチン", color: "#c2410c" },
      ];

      await asManager.mutation(api.shiftSetup.mutations.savePositions, { ...ids.scope, positions });
      const afterFirst = await readSetupState(t);
      await asManager.mutation(api.shiftSetup.mutations.savePositions, { ...ids.scope, positions });

      expect(await readSetupState(t)).toEqual(afterFirst);
    });

    it("既定のポジションを一覧から外すと拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () =>
          t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.savePositions, {
            ...ids.scope,
            positions: [
              { id: ids.hallPositionId, name: "ホール", color: "#7c3aed" },
              { name: "レジ", color: "#db2777" },
            ],
          }),
        "最初からあるポジションは削除できません",
      );
    });

    it("有効なポジションは上限の件数まで保存でき、1件でも超えると拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
      const newPositions = Array.from({ length: POSITION_ACTIVE_LIMIT }, (_, index) => ({
        name: `ポジション${index + 1}`,
        color: POSITION_COLOR_PALETTE[index % POSITION_COLOR_PALETTE.length],
      }));
      const defaultPosition = { id: ids.defaultPositionId, name: "シフト", color: "#3b82f6" };

      await asManager.mutation(api.shiftSetup.mutations.savePositions, {
        ...ids.scope,
        positions: [defaultPosition, ...newPositions.slice(0, POSITION_ACTIVE_LIMIT - 1)],
      });

      const saved = await readSetupState(t);
      expect(saved.positions.filter((position) => position.shopId === ids.shopId && !position.isDeleted)).toHaveLength(
        POSITION_ACTIVE_LIMIT,
      );
      expect(POSITION_ACTIVE_LIMIT).toBe(10);
      await expectRejectedWithoutChange(
        t,
        () =>
          asManager.mutation(api.shiftSetup.mutations.savePositions, {
            ...ids.scope,
            positions: [defaultPosition, ...newPositions],
          }),
        "ポジションは10件まで登録できます",
      );
    });

    it.each([
      { name: "同じ組織の別店舗のポジション", pick: (ids: SeededIds) => ids.siblingPositionId },
      { name: "別組織のポジション", pick: (ids: SeededIds) => ids.otherPositionId },
      { name: "削除済みのポジション", pick: (ids: SeededIds) => ids.deletedPositionId },
      { name: "一覧の中で重複したポジション", pick: (ids: SeededIds) => ids.hallPositionId },
    ])("$name のidを渡すと Not found で拒否する", async ({ pick }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () =>
          t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.savePositions, {
            ...ids.scope,
            positions: [
              { id: ids.defaultPositionId, name: "シフト", color: "#3b82f6" },
              { id: ids.hallPositionId, name: "ホール", color: "#7c3aed" },
              { id: pick(ids), name: "書き換えたポジション", color: "#dc2626" },
            ],
          }),
        "Not found",
      );
    });

    it.each([
      {
        name: "用意済みの色以外",
        extra: [{ name: "レジ", color: "#000000" }],
        message: "色は一覧から選んでください",
      },
      {
        name: "前後の空白を除くと重複する名前",
        extra: [
          { name: "レジ", color: "#db2777" },
          { name: " レジ ", color: "#b45309" },
        ],
        message: "ポジション名が重複しています",
      },
      {
        name: "空白だけの名前",
        extra: [{ name: "  ", color: "#db2777" }],
        message: "ポジション名を入力してください",
      },
      {
        name: "21文字の名前",
        extra: [{ name: "あ".repeat(21), color: "#db2777" }],
        message: "ポジション名は20文字以内で入力してください",
      },
    ])("$name は拒否する", async ({ extra, message }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () =>
          t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.savePositions, {
            ...ids.scope,
            positions: [{ id: ids.defaultPositionId, name: "シフト", color: "#3b82f6" }, ...extra],
          }),
        message,
      );
    });

    it("空の一覧は拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () =>
          t
            .withIdentity({ subject: MANAGER_SUBJECT })
            .mutation(api.shiftSetup.mutations.savePositions, { ...ids.scope, positions: [] }),
        "ポジションを1つ以上登録してください",
      );
    });

    it("追加と削除を繰り返しても、既定のポジションは有効な1件だけである", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });

      await asManager.mutation(api.shiftSetup.mutations.savePositions, {
        ...ids.scope,
        positions: [
          { name: "レジ", color: "#db2777" },
          { id: ids.defaultPositionId, name: "フロア", color: "#0f766e" },
          { id: ids.hallPositionId, name: "ホール", color: "#7c3aed" },
        ],
      });
      await asManager.mutation(api.shiftSetup.mutations.savePositions, {
        ...ids.scope,
        positions: [{ id: ids.defaultPositionId, name: "フロア", color: "#0f766e" }],
      });

      const shopPositions = (await readSetupState(t)).positions.filter((position) => position.shopId === ids.shopId);
      expect(
        shopPositions
          .filter((position) => position.isDefault)
          .map(({ _id, name, isDeleted }) => ({ _id, name, isDeleted })),
      ).toEqual([{ _id: ids.defaultPositionId, name: "フロア", isDeleted: false }]);
      expect(
        shopPositions.filter((position) => !position.isDeleted).map(({ _id, sortOrder }) => ({ _id, sortOrder })),
      ).toEqual([{ _id: ids.defaultPositionId, sortOrder: 0 }]);
      expect(
        shopPositions
          .filter((position) => position.isDeleted)
          .map((position) => position.name)
          .sort(),
      ).toEqual(["キッチン", "ホール", "レジ", "削除済みポジション"].sort());
    });
  });

  describe("saveDayTemplates", () => {
    it("日の型を一覧の順に作り、区切りを開始順に並べ、必要人数0を保存しない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const before = await readSetupState(t);

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.saveDayTemplates, {
        ...ids.scope,
        templates: [
          {
            name: " 平日 ",
            weekdays: ["mon", "tue"],
            slots: [
              {
                key: timeKey("14:00", "22:00"),
                requirements: [
                  { positionId: ids.hallPositionId, count: SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX },
                  { positionId: ids.defaultPositionId, count: 0 },
                ],
              },
              {
                key: timeKey("09:00", "14:00"),
                requirements: [
                  { positionId: ids.kitchenPositionId, count: 0 },
                  { positionId: ids.defaultPositionId, count: 1 },
                ],
              },
            ],
          },
          { name: "週末", weekdays: ["sat", "sun"], slots: [] },
        ],
      });

      const after = await readSetupState(t);
      expect(projectTemplates(after.dayTemplates, ids.shopId)).toEqual([
        {
          name: "平日",
          weekdays: ["mon", "tue"],
          sortOrder: 0,
          slots: [
            { key: timeKey("09:00", "14:00"), requirements: [{ positionId: ids.defaultPositionId, count: 1 }] },
            {
              key: timeKey("14:00", "22:00"),
              requirements: [{ positionId: ids.hallPositionId, count: SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX }],
            },
          ],
        },
        { name: "週末", weekdays: ["sat", "sun"], sortOrder: 1, slots: [] },
      ]);
      // ほかの店舗の型と、日の型以外の設定は変えない。
      expect(after.dayTemplates.filter((template) => template.shopId !== ids.shopId)).toEqual(before.dayTemplates);
      expect({ ...after, dayTemplates: [] }).toEqual({ ...before, dayTemplates: [] });
    });

    it.each([
      {
        name: "パターン選択",
        pattern: SHIFT_TYPE_PATTERN,
        // 区切りは勤務パターンの設定順に並べ直す。
        input: [
          { kind: "shiftType" as const, optionId: "late" },
          { kind: "shiftType" as const, optionId: "early" },
        ],
        saved: [
          { kind: "shiftType" as const, optionId: "early" },
          { kind: "shiftType" as const, optionId: "late" },
        ],
      },
      {
        name: "日付選択",
        pattern: { kind: "dateOnly" as const },
        input: [{ kind: "allDay" as const }],
        saved: [{ kind: "allDay" as const }],
      },
    ])("$name の店舗では、提出方法に合う区切りを保存する", async ({ pattern, input, saved }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t, { submissionPattern: pattern });

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.saveDayTemplates, {
        ...ids.scope,
        templates: [
          {
            name: "平日",
            weekdays: ["mon"],
            slots: input.map((key) => ({ key, requirements: [{ positionId: ids.hallPositionId, count: 2 }] })),
          },
        ],
      });

      expect(projectTemplates((await readSetupState(t)).dayTemplates, ids.shopId)).toEqual([
        {
          name: "平日",
          weekdays: ["mon"],
          sortOrder: 0,
          slots: saved.map((key) => ({ key, requirements: [{ positionId: ids.hallPositionId, count: 2 }] })),
        },
      ]);
    });

    it("idのある型は同じidのまま更新し、一覧にない型を削除し、idのない型を新しく作る", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const existing = await t.run(async (ctx) => {
        const keptTemplateId = await ctx.db.insert("shiftDayTemplates", {
          shopId: ids.shopId,
          name: "平日",
          weekdays: ["mon", "tue"],
          sortOrder: 0,
          slots: [{ key: timeKey("09:00", "22:00"), requirements: [{ positionId: ids.hallPositionId, count: 2 }] }],
        });
        const removedTemplateId = await ctx.db.insert("shiftDayTemplates", {
          shopId: ids.shopId,
          name: "週末",
          weekdays: ["sat", "sun"],
          sortOrder: 1,
          slots: [],
        });
        return { keptTemplateId, removedTemplateId };
      });
      const before = await readSetupState(t);

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.saveDayTemplates, {
        ...ids.scope,
        templates: [
          { name: "祝日", weekdays: ["sun"], slots: [] },
          {
            id: existing.keptTemplateId,
            name: "平日と金曜",
            weekdays: ["mon", "fri"],
            slots: [
              { key: timeKey("10:00", "20:00"), requirements: [{ positionId: ids.kitchenPositionId, count: 3 }] },
            ],
          },
        ],
      });

      const after = await readSetupState(t);
      const shopTemplates = after.dayTemplates.filter((template) => template.shopId === ids.shopId);
      expect(projectTemplates(shopTemplates, ids.shopId)).toEqual([
        { name: "祝日", weekdays: ["sun"], sortOrder: 0, slots: [] },
        {
          name: "平日と金曜",
          weekdays: ["mon", "fri"],
          sortOrder: 1,
          slots: [{ key: timeKey("10:00", "20:00"), requirements: [{ positionId: ids.kitchenPositionId, count: 3 }] }],
        },
      ]);
      expect(
        shopTemplates.filter((template) => template.name === "平日と金曜").map((template) => template._id),
      ).toEqual([existing.keptTemplateId]);
      expect(shopTemplates.filter((template) => template._id === existing.removedTemplateId)).toEqual([]);
      expect(after.dayTemplates.filter((template) => template.shopId !== ids.shopId)).toEqual(
        before.dayTemplates.filter((template) => template.shopId !== ids.shopId),
      );
    });

    it("空の一覧を保存すると、その店舗の型だけをすべて削除する", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      await t.run(async (ctx) => {
        await ctx.db.insert("shiftDayTemplates", {
          shopId: ids.shopId,
          name: "平日",
          weekdays: ["mon"],
          sortOrder: 0,
          slots: [],
        });
      });
      const before = await readSetupState(t);

      await t
        .withIdentity({ subject: MANAGER_SUBJECT })
        .mutation(api.shiftSetup.mutations.saveDayTemplates, { ...ids.scope, templates: [] });

      const after = await readSetupState(t);
      expect(after.dayTemplates).toEqual(before.dayTemplates.filter((template) => template.shopId !== ids.shopId));
      expect(after.dayTemplates.map((template) => template._id).sort()).toEqual(
        [ids.siblingTemplateId, ids.otherTemplateId].sort(),
      );
    });

    const template = (overrides: Partial<TemplateInput> = {}): TemplateInput => ({
      name: "平日",
      weekdays: ["mon"],
      slots: [],
      ...overrides,
    });

    it.each([
      {
        name: "同じ曜日を2つの型に割り当てる",
        build: () => [template({ weekdays: ["mon", "tue"] }), template({ name: "週末", weekdays: ["sat", "tue"] })],
        message: "同じ曜日を2つの型に割り当てることはできません",
      },
      {
        name: "型の名前が重複する",
        build: () => [template({ weekdays: ["mon"] }), template({ name: " 平日 ", weekdays: ["tue"] })],
        message: "型の名前が重複しています",
      },
      {
        name: "型の名前が空白だけ",
        build: () => [template({ name: "  " })],
        message: "型の名前を入力してください",
      },
      {
        name: "型の名前が21文字",
        build: () => [template({ name: "あ".repeat(21) })],
        message: "型の名前が長すぎます",
      },
      {
        name: "区切りが上限を超える",
        build: () => [
          template({
            slots: Array.from({ length: SHIFT_DAY_TEMPLATE_SLOT_LIMIT + 1 }, (_, index) => ({
              key: timeKey(`${String(9 + index).padStart(2, "0")}:00`, `${String(10 + index).padStart(2, "0")}:00`),
              requirements: [],
            })),
          }),
        ],
        message: "時間帯が上限を超えています",
      },
      {
        name: "時間帯が重なる",
        build: () => [
          template({
            slots: [
              { key: timeKey("09:00", "14:00"), requirements: [] },
              { key: timeKey("13:00", "22:00"), requirements: [] },
            ],
          }),
        ],
        message: "時間帯が重なっています",
      },
      {
        name: "必要人数が上限を超える",
        build: (ids: SeededIds) => [
          template({
            slots: [
              {
                key: timeKey("09:00", "22:00"),
                requirements: [{ positionId: ids.hallPositionId, count: SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX + 1 }],
              },
            ],
          }),
        ],
        message: "必要人数が正しくありません",
      },
      {
        name: "必要人数が整数でない",
        build: (ids: SeededIds) => [
          template({
            slots: [{ key: timeKey("09:00", "22:00"), requirements: [{ positionId: ids.hallPositionId, count: 1.5 }] }],
          }),
        ],
        message: "必要人数が正しくありません",
      },
      {
        name: "同じポジションの必要人数が重複する",
        build: (ids: SeededIds) => [
          template({
            slots: [
              {
                key: timeKey("09:00", "22:00"),
                requirements: [
                  { positionId: ids.hallPositionId, count: 1 },
                  { positionId: ids.hallPositionId, count: 2 },
                ],
              },
            ],
          }),
        ],
        message: "同じポジションの必要人数が重複しています",
      },
    ])("$name 保存は拒否する", async ({ build, message }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () =>
          t
            .withIdentity({ subject: MANAGER_SUBJECT })
            .mutation(api.shiftSetup.mutations.saveDayTemplates, { ...ids.scope, templates: build(ids) }),
        message,
      );
    });

    it.each([
      {
        name: "時間指定の店舗へ勤務パターンの区切り",
        pattern: undefined,
        key: { kind: "shiftType" as const, optionId: "early" },
      },
      { name: "時間指定の店舗へ終日の区切り", pattern: undefined, key: { kind: "allDay" as const } },
      { name: "時間指定の店舗へ受付時間の外に出る時間帯", pattern: undefined, key: timeKey("08:00", "10:00") },
      { name: "パターン選択の店舗へ時間帯の区切り", pattern: SHIFT_TYPE_PATTERN, key: timeKey("09:00", "15:00") },
      {
        name: "パターン選択の店舗へ存在しない勤務パターン",
        pattern: SHIFT_TYPE_PATTERN,
        key: { kind: "shiftType" as const, optionId: "removed" },
      },
      { name: "パターン選択の店舗へ終日の区切り", pattern: SHIFT_TYPE_PATTERN, key: { kind: "allDay" as const } },
      {
        name: "日付選択の店舗へ時間帯の区切り",
        pattern: { kind: "dateOnly" as const },
        key: timeKey("09:00", "22:00"),
      },
      {
        name: "日付選択の店舗へ勤務パターンの区切り",
        pattern: { kind: "dateOnly" as const },
        key: { kind: "shiftType" as const, optionId: "early" },
      },
    ])("$name を保存しようとすると拒否する", async ({ pattern, key }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t, pattern ? { submissionPattern: pattern } : undefined);

      await expectRejectedWithoutChange(
        t,
        () =>
          t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.saveDayTemplates, {
            ...ids.scope,
            templates: [template({ slots: [{ key, requirements: [{ positionId: ids.hallPositionId, count: 1 }] }] })],
          }),
        "希望シフトの集め方に合わない区切りがあります",
      );
    });

    it.each([
      { name: "同じ組織の別店舗のポジション", pick: (ids: SeededIds) => ids.siblingPositionId },
      { name: "別組織のポジション", pick: (ids: SeededIds) => ids.otherPositionId },
      { name: "削除済みのポジション", pick: (ids: SeededIds) => ids.deletedPositionId },
    ])("必要人数に $name を含む保存は Not found で拒否する", async ({ pick }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () =>
          t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.saveDayTemplates, {
            ...ids.scope,
            templates: [
              template({
                slots: [
                  {
                    key: timeKey("09:00", "22:00"),
                    requirements: [
                      { positionId: ids.hallPositionId, count: 1 },
                      { positionId: pick(ids), count: 1 },
                    ],
                  },
                ],
              }),
            ],
          }),
        "Not found",
      );
    });

    it.each([
      { name: "同じ組織の別店舗の型", pick: (ids: SeededIds) => [ids.siblingTemplateId] },
      { name: "別組織の型", pick: (ids: SeededIds) => [ids.otherTemplateId] },
      { name: "削除済みの型", pick: (ids: SeededIds) => [ids.deletedTemplateId] },
    ])("$name のidを渡すと Not found で拒否する", async ({ pick }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () =>
          t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.saveDayTemplates, {
            ...ids.scope,
            templates: [
              template({ name: "新しい型", weekdays: ["mon"] }),
              ...pick(ids).map((id) => template({ id, name: "書き換えた型", weekdays: ["tue"] })),
            ],
          }),
        "Not found",
      );
    });

    it("同じ型のidを一覧に2回渡すと Not found で拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const templateId = await t.run(async (ctx) =>
        ctx.db.insert("shiftDayTemplates", {
          shopId: ids.shopId,
          name: "平日",
          weekdays: ["mon"],
          sortOrder: 0,
          slots: [],
        }),
      );

      await expectRejectedWithoutChange(
        t,
        () =>
          t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.saveDayTemplates, {
            ...ids.scope,
            templates: [
              template({ id: templateId, name: "平日", weekdays: ["mon"] }),
              template({ id: templateId, name: "週末", weekdays: ["sat"] }),
            ],
          }),
        "Not found",
      );
    });

    it("日の型は上限の件数まで保存でき、1件でも超えると拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
      const templates = Array.from({ length: SHIFT_DAY_TEMPLATE_LIMIT + 1 }, (_, index) =>
        template({ name: `型${index + 1}`, weekdays: [] }),
      );

      await asManager.mutation(api.shiftSetup.mutations.saveDayTemplates, {
        ...ids.scope,
        templates: templates.slice(0, SHIFT_DAY_TEMPLATE_LIMIT),
      });

      expect(projectTemplates((await readSetupState(t)).dayTemplates, ids.shopId).map(({ name }) => name)).toEqual(
        templates.slice(0, SHIFT_DAY_TEMPLATE_LIMIT).map(({ name }) => name),
      );
      expect(SHIFT_DAY_TEMPLATE_LIMIT).toBe(6);
      await expectRejectedWithoutChange(
        t,
        () => asManager.mutation(api.shiftSetup.mutations.saveDayTemplates, { ...ids.scope, templates }),
        "日の型が上限を超えています",
      );
    });
  });

  describe("saveBreakRule", () => {
    it("休憩の決まりを保存し、nullで消す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
      const before = await readSetupState(t);

      await asManager.mutation(api.shiftSetup.mutations.saveBreakRule, {
        ...ids.scope,
        breakRule: { minWorkMinutes: 360, breakMinutes: 45 },
      });

      const saved = await readSetupState(t);
      expect(saved.shops.filter((shop) => shop._id === ids.shopId).map((shop) => shop.breakRule)).toEqual([
        { minWorkMinutes: 360, breakMinutes: 45 },
      ]);
      // ほかの店舗には決まりを付けない。
      expect(saved.shops.filter((shop) => shop._id !== ids.shopId)).toEqual(
        before.shops.filter((shop) => shop._id !== ids.shopId),
      );

      await asManager.mutation(api.shiftSetup.mutations.saveBreakRule, { ...ids.scope, breakRule: null });

      // 決まりを消すとfieldごとなくなり、保存前の店舗と同じ状態へ戻る。
      expect(await readSetupState(t)).toEqual(before);
    });

    it("決まりのない店舗でnullを保存しても、何も変えない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const before = await readSetupState(t);

      await t
        .withIdentity({ subject: MANAGER_SUBJECT })
        .mutation(api.shiftSetup.mutations.saveBreakRule, { ...ids.scope, breakRule: null });

      expect(await readSetupState(t)).toEqual(before);
    });

    it.each([
      {
        name: "勤務の長さが30分単位でない",
        rule: { minWorkMinutes: 370, breakMinutes: 45 },
        message: "勤務の長さが正しくありません",
      },
      {
        name: "休憩の長さが15分単位でない",
        rule: { minWorkMinutes: 360, breakMinutes: 50 },
        message: "休憩の長さが正しくありません",
      },
      {
        name: "休憩が勤務と同じ長さ",
        rule: { minWorkMinutes: 60, breakMinutes: 60 },
        message: "休憩は勤務より短くしてください",
      },
      {
        name: "休憩が勤務より長い",
        rule: { minWorkMinutes: 60, breakMinutes: 90 },
        message: "休憩は勤務より短くしてください",
      },
      { name: "勤務の長さが0分", rule: { minWorkMinutes: 0, breakMinutes: 15 }, message: "勤務の長さを選んでください" },
      {
        name: "休憩の長さが0分",
        rule: { minWorkMinutes: 360, breakMinutes: 0 },
        message: "休憩の長さを選んでください",
      },
      {
        name: "勤務の長さが24時間を超える",
        rule: { minWorkMinutes: 1470, breakMinutes: 45 },
        message: "勤務の長さが正しくありません",
      },
    ])("$name 決まりは拒否する", async ({ rule, message }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.shopId, { breakRule: { minWorkMinutes: 480, breakMinutes: 60 } });
      });

      await expectRejectedWithoutChange(
        t,
        () =>
          t
            .withIdentity({ subject: MANAGER_SUBJECT })
            .mutation(api.shiftSetup.mutations.saveBreakRule, { ...ids.scope, breakRule: rule }),
        message,
      );
    });
  });

  describe("saveStaffShiftProfiles", () => {
    const readStaffProfile = async (t: Test, staffId: Id<"staffs">) => {
      const staff = await t.run(async (ctx) => ctx.db.get(staffId));
      if (!staff) throw new Error("staff fixture is missing");
      return {
        keys: Object.keys(staff)
          .filter((key) => key === "unavailablePositionIds" || key === "skillLevel")
          .sort(),
        unavailablePositionIds: staff.unavailablePositionIds,
        skillLevel: staff.skillLevel,
      };
    };

    it("入れないポジションと熟練度をまとめて保存し、標準・空へ戻すとfieldを消す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
      const before = await readSetupState(t);

      await asManager.mutation(api.shiftSetup.mutations.saveStaffShiftProfiles, {
        ...ids.scope,
        profiles: [
          { staffId: ids.staffId, unavailablePositionIds: [ids.kitchenPositionId], skillLevel: "lead" },
          {
            staffId: ids.secondStaffId,
            unavailablePositionIds: [ids.hallPositionId, ids.kitchenPositionId],
            skillLevel: "newcomer",
          },
        ],
      });

      expect(await readStaffProfile(t, ids.staffId)).toEqual({
        keys: ["skillLevel", "unavailablePositionIds"],
        unavailablePositionIds: [ids.kitchenPositionId],
        skillLevel: "lead",
      });
      expect(await readStaffProfile(t, ids.secondStaffId)).toEqual({
        keys: ["skillLevel", "unavailablePositionIds"],
        unavailablePositionIds: [ids.hallPositionId, ids.kitchenPositionId],
        skillLevel: "newcomer",
      });
      const saved = await readSetupState(t);
      const targetStaffIds = new Set<Id<"staffs">>([ids.staffId, ids.secondStaffId]);
      expect(saved.staffs.filter((staff) => !targetStaffIds.has(staff._id))).toEqual(
        before.staffs.filter((staff) => !targetStaffIds.has(staff._id)),
      );

      await asManager.mutation(api.shiftSetup.mutations.saveStaffShiftProfiles, {
        ...ids.scope,
        profiles: [{ staffId: ids.staffId, unavailablePositionIds: [], skillLevel: "standard" }],
      });

      expect(await readStaffProfile(t, ids.staffId)).toEqual({
        keys: [],
        unavailablePositionIds: undefined,
        skillLevel: undefined,
      });
      // 一覧に含めなかったスタッフの属性は変えない。
      expect(await readStaffProfile(t, ids.secondStaffId)).toEqual({
        keys: ["skillLevel", "unavailablePositionIds"],
        unavailablePositionIds: [ids.hallPositionId, ids.kitchenPositionId],
        skillLevel: "newcomer",
      });
    });

    it("入れないポジションだけ、熟練度だけを消した場合は、消した方のfieldだけがなくなる", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.staffId, { unavailablePositionIds: [ids.hallPositionId], skillLevel: "lead" });
        await ctx.db.patch(ids.secondStaffId, { unavailablePositionIds: [ids.hallPositionId], skillLevel: "lead" });
      });

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.saveStaffShiftProfiles, {
        ...ids.scope,
        profiles: [
          { staffId: ids.staffId, unavailablePositionIds: [], skillLevel: "lead" },
          { staffId: ids.secondStaffId, unavailablePositionIds: [ids.hallPositionId], skillLevel: "standard" },
        ],
      });

      expect(await readStaffProfile(t, ids.staffId)).toEqual({
        keys: ["skillLevel"],
        unavailablePositionIds: undefined,
        skillLevel: "lead",
      });
      expect(await readStaffProfile(t, ids.secondStaffId)).toEqual({
        keys: ["unavailablePositionIds"],
        unavailablePositionIds: [ids.hallPositionId],
        skillLevel: undefined,
      });
    });

    it.each([
      {
        name: "同じ組織の別店舗のスタッフ",
        build: (ids: SeededIds) => ({ staffId: ids.siblingStaffId, unavailablePositionIds: [] }),
      },
      {
        name: "別組織のスタッフ",
        build: (ids: SeededIds) => ({ staffId: ids.otherStaffId, unavailablePositionIds: [] }),
      },
      {
        name: "削除済みのスタッフ",
        build: (ids: SeededIds) => ({ staffId: ids.deletedStaffId, unavailablePositionIds: [] }),
      },
      {
        name: "一覧の中で重複したスタッフ",
        build: (ids: SeededIds) => ({ staffId: ids.staffId, unavailablePositionIds: [] }),
      },
      {
        name: "同じ組織の別店舗のポジション",
        build: (ids: SeededIds) => ({ staffId: ids.secondStaffId, unavailablePositionIds: [ids.siblingPositionId] }),
      },
      {
        name: "別組織のポジション",
        build: (ids: SeededIds) => ({ staffId: ids.secondStaffId, unavailablePositionIds: [ids.otherPositionId] }),
      },
      {
        name: "削除済みのポジション",
        build: (ids: SeededIds) => ({ staffId: ids.secondStaffId, unavailablePositionIds: [ids.deletedPositionId] }),
      },
      {
        name: "1人の中で重複したポジション",
        build: (ids: SeededIds) => ({
          staffId: ids.secondStaffId,
          unavailablePositionIds: [ids.hallPositionId, ids.hallPositionId],
        }),
      },
    ])("$name を含む保存は Not found で拒否し、同じ一覧のほかのスタッフも保存しない", async ({ build }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () =>
          t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.saveStaffShiftProfiles, {
            ...ids.scope,
            profiles: [
              { staffId: ids.staffId, unavailablePositionIds: [ids.hallPositionId], skillLevel: "lead" },
              { ...build(ids), skillLevel: "newcomer" },
            ],
          }),
        "Not found",
      );
    });

    it("有効なポジションをすべて外す保存は拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () =>
          t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.saveStaffShiftProfiles, {
            ...ids.scope,
            profiles: [
              { staffId: ids.secondStaffId, unavailablePositionIds: [ids.hallPositionId], skillLevel: "lead" },
              {
                staffId: ids.staffId,
                unavailablePositionIds: [ids.defaultPositionId, ids.hallPositionId, ids.kitchenPositionId],
                skillLevel: "standard",
              },
            ],
          }),
        "入れるポジションを1つ以上残してください",
      );
    });

    it("一度に保存できるスタッフ数を超える一覧は拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () =>
          t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.saveStaffShiftProfiles, {
            ...ids.scope,
            profiles: Array.from({ length: SHIFT_BOARD_STAFF_LIMIT + 1 }, () => ({
              staffId: ids.staffId,
              unavailablePositionIds: [],
              skillLevel: "lead" as const,
            })),
          }),
        "一度に保存できるスタッフ数を超えています",
      );
    });
  });

  describe("setDayTemplateOverride", () => {
    async function seedTemplates(t: Test, shopId: Id<"shops">) {
      return await t.run(async (ctx) => {
        const insert = (name: string, sortOrder: number) =>
          ctx.db.insert("shiftDayTemplates", { shopId, name, weekdays: [], sortOrder, slots: [] });
        return { eventTemplateId: await insert("イベントの日", 0), quietTemplateId: await insert("ひまな日", 1) };
      });
    }
    const readOverrides = async (t: Test) =>
      (await readSetupState(t)).dayTemplateOverrides
        .map(({ shopId, date, templateId }) => ({ shopId, date, templateId }))
        .sort((a, b) => a.date.localeCompare(b.date));

    it("特別な日を設定し、同じ日付は上書きして1件だけにし、nullで解除する", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const templates = await seedTemplates(t, ids.shopId);
      const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
      const before = await readSetupState(t);

      await asManager.mutation(api.shiftSetup.mutations.setDayTemplateOverride, {
        ...ids.scope,
        date: "2026-01-20",
        templateId: templates.eventTemplateId,
      });
      expect(await readOverrides(t)).toEqual([
        { shopId: ids.shopId, date: "2026-01-20", templateId: templates.eventTemplateId },
      ]);

      await asManager.mutation(api.shiftSetup.mutations.setDayTemplateOverride, {
        ...ids.scope,
        date: "2026-01-21",
        templateId: templates.eventTemplateId,
      });
      await asManager.mutation(api.shiftSetup.mutations.setDayTemplateOverride, {
        ...ids.scope,
        date: "2026-01-20",
        templateId: templates.quietTemplateId,
      });
      expect(await readOverrides(t)).toEqual([
        { shopId: ids.shopId, date: "2026-01-20", templateId: templates.quietTemplateId },
        { shopId: ids.shopId, date: "2026-01-21", templateId: templates.eventTemplateId },
      ]);

      await asManager.mutation(api.shiftSetup.mutations.setDayTemplateOverride, {
        ...ids.scope,
        date: "2026-01-20",
        templateId: null,
      });
      expect(await readOverrides(t)).toEqual([
        { shopId: ids.shopId, date: "2026-01-21", templateId: templates.eventTemplateId },
      ]);
      // 特別な日のほかは、どの設定も変えない。
      expect({ ...(await readSetupState(t)), dayTemplateOverrides: [] }).toEqual({
        ...before,
        dayTemplateOverrides: [],
      });
    });

    it("同じ日付の指定が複数残っていても、設定し直すと1件だけになる", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const templates = await seedTemplates(t, ids.shopId);
      await t.run(async (ctx) => {
        for (const templateId of [templates.eventTemplateId, templates.quietTemplateId]) {
          await ctx.db.insert("shiftDayTemplateOverrides", { shopId: ids.shopId, date: "2026-01-20", templateId });
        }
        // 別店舗の同じ日付の指定は、対象店舗の操作で消さない。
        await ctx.db.insert("shiftDayTemplateOverrides", {
          shopId: ids.siblingShopId,
          date: "2026-01-20",
          templateId: ids.siblingTemplateId,
        });
      });

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.setDayTemplateOverride, {
        ...ids.scope,
        date: "2026-01-20",
        templateId: templates.eventTemplateId,
      });

      expect((await readOverrides(t)).sort((a, b) => String(a.templateId).localeCompare(String(b.templateId)))).toEqual(
        [
          { shopId: ids.shopId, date: "2026-01-20", templateId: templates.eventTemplateId },
          { shopId: ids.siblingShopId, date: "2026-01-20", templateId: ids.siblingTemplateId },
        ].sort((a, b) => String(a.templateId).localeCompare(String(b.templateId))),
      );
    });

    it("指定のない日付をnullで解除しても、何も変えない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const templates = await seedTemplates(t, ids.shopId);
      await t.run(async (ctx) => {
        await ctx.db.insert("shiftDayTemplateOverrides", {
          shopId: ids.shopId,
          date: "2026-01-21",
          templateId: templates.eventTemplateId,
        });
      });
      const before = await readSetupState(t);

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.setDayTemplateOverride, {
        ...ids.scope,
        date: "2026-01-20",
        templateId: null,
      });

      expect(await readSetupState(t)).toEqual(before);
    });

    it.each([
      { name: "同じ組織の別店舗の型", pick: (ids: SeededIds) => ids.siblingTemplateId },
      { name: "別組織の型", pick: (ids: SeededIds) => ids.otherTemplateId },
      { name: "削除済みの型", pick: (ids: SeededIds) => ids.deletedTemplateId },
    ])("$name を当てようとすると Not found で拒否し、すでにある指定も消さない", async ({ pick }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const templates = await seedTemplates(t, ids.shopId);
      await t.run(async (ctx) => {
        await ctx.db.insert("shiftDayTemplateOverrides", {
          shopId: ids.shopId,
          date: "2026-01-20",
          templateId: templates.eventTemplateId,
        });
      });

      await expectRejectedWithoutChange(
        t,
        () =>
          t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.setDayTemplateOverride, {
            ...ids.scope,
            date: "2026-01-20",
            templateId: pick(ids),
          }),
        "Not found",
      );
    });

    it.each([
      { name: "存在しない日付", date: "2026-02-31" },
      { name: "区切りが違う日付", date: "2026/01/20" },
      { name: "空文字", date: "" },
    ])("$name は拒否する", async ({ date }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const templates = await seedTemplates(t, ids.shopId);

      await expectRejectedWithoutChange(
        t,
        () =>
          t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.setDayTemplateOverride, {
            ...ids.scope,
            date,
            templateId: templates.eventTemplateId,
          }),
        "日付の形式が正しくありません",
      );
    });
  });
});
