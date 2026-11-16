import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { addDays, generateDateRange } from "../_lib/dateFormat";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedManagerShop, seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  POSITION_ACTIVE_LIMIT,
  POSITION_COLOR_PALETTE,
  RECRUITMENT_PERIOD_DAYS_MAX,
  SHIFT_BOARD_STAFF_LIMIT,
  SHIFT_DAY_TEMPLATE_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_LIMIT,
  SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX,
} from "../constants";
import { buildEmptyDayRequirements, type DayRequirements } from "./dayTemplates";

const MANAGER_SUBJECT = "shift_setup_manager";
const OTHER_MANAGER_SUBJECT = "shift_setup_other_manager";

const TIME_PATTERN: ShiftSubmissionPattern = { kind: "time", startTime: "09:00", endTime: "22:00" };
const SHIFT_TYPE_PATTERN: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
  ],
};
const DATE_ONLY_PATTERN: ShiftSubmissionPattern = { kind: "dateOnly" };

// 対象店舗の募集期間。2026-01-19は月曜である。
const PERIOD_START = "2026-01-19";
const PERIOD_END = "2026-01-25";

type Test = TestConvex<typeof schema>;
type MutationClient = Pick<Test, "mutation">;
type SeededIds = Awaited<ReturnType<typeof seedShops>>;
type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
type Requirements = DayRequirements<Id<"positions">>;
type TemplateInput = {
  id?: Id<"shiftDayTemplates">;
  name: string;
  weekdays: Weekday[];
  appliesToHolidays: boolean;
  requirements: Requirements;
};

const bar = (positionId: Id<"positions">, startTime: string, endTime: string) => ({ positionId, startTime, endTime });
const timeRequirements = (bars: Array<ReturnType<typeof bar>>): Requirements => ({ kind: "time", bars });

/**
 * 対象店舗（時間指定 09:00-22:00）と、同じ組織の別店舗、別組織の店舗を用意する。
 * 別店舗と別組織には、IDを取り違えたときに拒否されることを確かめるためのデータを置く。
 * 各店舗に、未確定の募集（2026-01-19〜2026-01-25）を1件ずつ置く。
 */
async function seedShops(
  t: Test,
  options?: { submissionPattern?: ShiftSubmissionPattern; recruitmentPattern?: ShiftSubmissionPattern },
) {
  return await t.run(async (ctx) => {
    const actor = await seedManagerShop(ctx, { subject: MANAGER_SUBJECT, shopName: "設定店舗" });
    const other = await seedOrganizationManagerShop(ctx, { subject: OTHER_MANAGER_SUBJECT, shopName: "別組織店舗" });
    const shopPattern = options?.submissionPattern ?? TIME_PATTERN;
    await ctx.db.patch(actor.shopId, { submissionPattern: shopPattern });
    const siblingShopId = await ctx.db.insert("shops", {
      organizationId: actor.organizationId,
      name: "同じ組織の別店舗",
      submissionPattern: TIME_PATTERN,
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
      ctx.db.insert("shiftDayTemplates", {
        shopId,
        name,
        weekdays: [],
        sortOrder: 0,
        appliesToHolidays: false,
        requirements: buildEmptyDayRequirements("time"),
      });
    const siblingTemplateId = await insertTemplate(siblingShopId, "別店舗の型");
    const otherTemplateId = await insertTemplate(other.shopId, "別組織の型");
    const deletedTemplateId = await insertTemplate(actor.shopId, "削除する型");
    await ctx.db.delete(deletedTemplateId);

    const insertRecruitment = (
      shopId: Id<"shops">,
      recruitment?: { submissionPattern?: ShiftSubmissionPattern; isDeleted?: boolean },
    ) =>
      ctx.db.insert("recruitments", {
        shopId,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        deadline: "2026-01-15",
        shopClosedDates: [],
        status: "open",
        isDeleted: recruitment?.isDeleted ?? false,
        submissionPattern: recruitment?.submissionPattern ?? TIME_PATTERN,
      });
    const recruitmentId = await insertRecruitment(actor.shopId, {
      submissionPattern: options?.recruitmentPattern ?? shopPattern,
    });
    const deletedRecruitmentId = await insertRecruitment(actor.shopId, { isDeleted: true });
    const siblingRecruitmentId = await insertRecruitment(siblingShopId);
    const otherRecruitmentId = await insertRecruitment(other.shopId);

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
      recruitmentId,
      deletedRecruitmentId,
      siblingRecruitmentId,
      otherRecruitmentId,
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
    staffingSnapshots: await ctx.db.query("recruitmentStaffingSnapshots").collect(),
    recruitments: await ctx.db.query("recruitments").collect(),
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
    .map(({ name, weekdays, sortOrder, appliesToHolidays, requirements }) => ({
      name,
      weekdays,
      sortOrder,
      appliesToHolidays,
      requirements,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** その日だけの指定を、店舗と日付の順に、保存した内容だけへ写す。 */
function projectOverrides(overrides: Doc<"shiftDayTemplateOverrides">[]) {
  return overrides
    .map((override) =>
      override.kind === "template"
        ? { shopId: override.shopId, date: override.date, kind: override.kind, templateId: override.templateId }
        : { shopId: override.shopId, date: override.date, kind: override.kind, requirements: override.requirements },
    )
    .sort((a, b) => a.shopId.localeCompare(b.shopId) || a.date.localeCompare(b.date));
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
            templates: [
              { name: "書き込んだ型", weekdays: ["mon"], appliesToHolidays: false, requirements: timeRequirements([]) },
            ],
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
            profiles: [{ staffId: ids.staffId, positionSkills: [{ positionId: ids.hallPositionId, level: "lead" }] }],
          }),
      },
      {
        name: "applyDayTemplateToDates",
        run: (client, ids, scope) =>
          client.mutation(api.shiftSetup.mutations.applyDayTemplateToDates, {
            ...scope,
            recruitmentId: ids.recruitmentId,
            dates: ["2026-01-20"],
            templateId: null,
          }),
      },
      {
        name: "saveDayCustomRequirements",
        run: (client, ids, scope) =>
          client.mutation(api.shiftSetup.mutations.saveDayCustomRequirements, {
            ...scope,
            recruitmentId: ids.recruitmentId,
            date: "2026-01-20",
            requirements: timeRequirements([bar(ids.hallPositionId, "10:00", "14:00")]),
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

    it("既定のポジションを一覧から外すと、一覧の先頭が新しい既定になる", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const before = await readSetupState(t);

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.savePositions, {
        ...ids.scope,
        positions: [
          { id: ids.hallPositionId, name: "ホール", color: "#7c3aed" },
          { name: "レジ", color: "#db2777" },
        ],
      });

      const after = await readSetupState(t);
      const own = after.positions.filter((position) => position.shopId === ids.shopId);
      // 既定は有効なポジションの中に1件だけあり、削除した行には残らない。
      expect(own.filter((position) => position.isDefault).map((position) => position._id)).toEqual([
        ids.hallPositionId,
      ]);
      expect(own.find((position) => position._id === ids.defaultPositionId)).toMatchObject({
        isDeleted: true,
        isDefault: false,
      });
      expect(after.positions.filter((position) => position.shopId !== ids.shopId)).toEqual(
        before.positions.filter((position) => position.shopId !== ids.shopId),
      );
    });

    it("既定のポジションを外した一覧の先頭が新しいポジションなら、そのポジションを既定として作る", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.savePositions, {
        ...ids.scope,
        positions: [
          { name: "レジ", color: "#db2777" },
          { id: ids.hallPositionId, name: "ホール", color: "#7c3aed" },
        ],
      });

      const after = await readSetupState(t);
      const active = after.positions.filter((position) => position.shopId === ids.shopId && !position.isDeleted);
      expect(
        active
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((position) => ({ name: position.name, isDefault: position.isDefault })),
      ).toEqual([
        { name: "レジ", isDefault: true },
        { name: "ホール", isDefault: false },
      ]);
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
    const template = (overrides: Partial<TemplateInput> = {}): TemplateInput => ({
      name: "平日",
      weekdays: ["mon"],
      appliesToHolidays: false,
      requirements: timeRequirements([]),
      ...overrides,
    });
    const save = (t: Test, ids: SeededIds, templates: TemplateInput[]) =>
      t
        .withIdentity({ subject: MANAGER_SUBJECT })
        .mutation(api.shiftSetup.mutations.saveDayTemplates, { ...ids.scope, templates });

    it("型を一覧の順に作り、バーを開始、終了、ポジションの順に並べ、隣り合うバーと同じ時間のバーを結合しない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const before = await readSetupState(t);

      await save(t, ids, [
        {
          name: " 平日 ",
          weekdays: ["mon", "tue"],
          appliesToHolidays: false,
          requirements: timeRequirements([
            bar(ids.kitchenPositionId, "14:00", "18:00"),
            bar(ids.hallPositionId, "14:00", "18:00"),
            bar(ids.hallPositionId, "10:00", "14:00"),
            bar(ids.hallPositionId, "10:00", "14:00"),
            bar(ids.defaultPositionId, "09:00", "22:00"),
          ]),
        },
        { name: "祝日", weekdays: [], appliesToHolidays: true, requirements: timeRequirements([]) },
      ]);

      const after = await readSetupState(t);
      const [first, second] = [ids.hallPositionId, ids.kitchenPositionId].sort();
      expect(projectTemplates(after.dayTemplates, ids.shopId)).toEqual([
        {
          name: "平日",
          weekdays: ["mon", "tue"],
          sortOrder: 0,
          appliesToHolidays: false,
          requirements: timeRequirements([
            bar(ids.defaultPositionId, "09:00", "22:00"),
            bar(ids.hallPositionId, "10:00", "14:00"),
            bar(ids.hallPositionId, "10:00", "14:00"),
            bar(first, "14:00", "18:00"),
            bar(second, "14:00", "18:00"),
          ]),
        },
        { name: "祝日", weekdays: [], sortOrder: 1, appliesToHolidays: true, requirements: timeRequirements([]) },
      ]);
      // ほかの店舗の型と、日の型以外の設定は変えない。
      expect(after.dayTemplates.filter((item) => item.shopId !== ids.shopId)).toEqual(before.dayTemplates);
      expect({ ...after, dayTemplates: [] }).toEqual({ ...before, dayTemplates: [] });
    });

    it("パターン選択の店舗では、勤務パターンを設定順に並べ、人数0を保存しない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t, { submissionPattern: SHIFT_TYPE_PATTERN });

      await save(t, ids, [
        template({
          requirements: {
            kind: "shiftType",
            options: [
              {
                optionId: "late",
                counts: [
                  { positionId: ids.hallPositionId, count: SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX },
                  { positionId: ids.kitchenPositionId, count: 0 },
                ],
              },
              { optionId: "early", counts: [{ positionId: ids.defaultPositionId, count: 1 }] },
            ],
          },
        }),
      ]);

      expect(projectTemplates((await readSetupState(t)).dayTemplates, ids.shopId)).toEqual([
        {
          name: "平日",
          weekdays: ["mon"],
          sortOrder: 0,
          appliesToHolidays: false,
          requirements: {
            kind: "shiftType",
            options: [
              { optionId: "early", counts: [{ positionId: ids.defaultPositionId, count: 1 }] },
              {
                optionId: "late",
                counts: [{ positionId: ids.hallPositionId, count: SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX }],
              },
            ],
          },
        },
      ]);
    });

    it("日付選択の店舗では、1日分のポジション別の人数を保存し、人数0を保存しない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t, { submissionPattern: DATE_ONLY_PATTERN });

      await save(t, ids, [
        template({
          requirements: {
            kind: "dateOnly",
            counts: [
              { positionId: ids.hallPositionId, count: 3 },
              { positionId: ids.kitchenPositionId, count: 0 },
            ],
          },
        }),
      ]);

      expect(projectTemplates((await readSetupState(t)).dayTemplates, ids.shopId)).toEqual([
        {
          name: "平日",
          weekdays: ["mon"],
          sortOrder: 0,
          appliesToHolidays: false,
          requirements: { kind: "dateOnly", counts: [{ positionId: ids.hallPositionId, count: 3 }] },
        },
      ]);
    });

    it("idのある型は同じidのまま更新し、一覧にない型を削除し、idのない型を新しく作る。削除した型を指す指定は残す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const existing = await t.run(async (ctx) => {
        const insert = (name: string, weekdays: Weekday[], sortOrder: number) =>
          ctx.db.insert("shiftDayTemplates", {
            shopId: ids.shopId,
            name,
            weekdays,
            sortOrder,
            appliesToHolidays: false,
            requirements: timeRequirements([bar(ids.hallPositionId, "09:00", "12:00")]),
          });
        const keptTemplateId = await insert("平日", ["mon", "tue"], 0);
        const removedTemplateId = await insert("週末", ["sat"], 1);
        for (const templateId of [keptTemplateId, removedTemplateId]) {
          await ctx.db.insert("shiftDayTemplateOverrides", {
            shopId: ids.shopId,
            date: templateId === keptTemplateId ? "2026-01-20" : "2026-01-21",
            kind: "template",
            templateId,
          });
        }
        return { keptTemplateId, removedTemplateId };
      });
      const before = await readSetupState(t);

      await save(t, ids, [
        template({ name: "新しい型", weekdays: ["sat", "sun"], appliesToHolidays: true }),
        template({
          id: existing.keptTemplateId,
          name: "平日（改）",
          weekdays: ["mon"],
          requirements: timeRequirements([bar(ids.kitchenPositionId, "17:00", "22:00")]),
        }),
      ]);

      const after = await readSetupState(t);
      const shopTemplates = after.dayTemplates.filter((item) => item.shopId === ids.shopId);
      expect(projectTemplates(shopTemplates, ids.shopId)).toEqual([
        {
          name: "新しい型",
          weekdays: ["sat", "sun"],
          sortOrder: 0,
          appliesToHolidays: true,
          requirements: timeRequirements([]),
        },
        {
          name: "平日（改）",
          weekdays: ["mon"],
          sortOrder: 1,
          appliesToHolidays: false,
          requirements: timeRequirements([bar(ids.kitchenPositionId, "17:00", "22:00")]),
        },
      ]);
      expect(shopTemplates.find((item) => item.name === "平日（改）")?._id).toBe(existing.keptTemplateId);
      expect(shopTemplates.map((item) => item._id)).not.toContain(existing.removedTemplateId);
      // その日だけの指定は、削除した型を指すものも含めて変えない。読み取りが無視して下の順位へ落とす。
      expect(after.dayTemplateOverrides).toEqual(before.dayTemplateOverrides);
      expect(after.dayTemplates.filter((item) => item.shopId !== ids.shopId)).toEqual(
        before.dayTemplates.filter((item) => item.shopId !== ids.shopId),
      );
    });

    it("同じ一覧をもう一度保存しても、同じ状態のままである", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const readShopTemplates = async () =>
        (await readSetupState(t)).dayTemplates
          .filter((item) => item.shopId === ids.shopId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
      const templates = [
        template({ requirements: timeRequirements([bar(ids.hallPositionId, "09:00", "22:00")]) }),
        template({ name: "祝日", weekdays: [], appliesToHolidays: true }),
      ];
      await save(t, ids, templates);
      const saved = await readShopTemplates();
      expect(saved).toHaveLength(2);

      await save(
        t,
        ids,
        templates.map((item, index) => ({ ...item, id: saved[index]._id })),
      );

      expect(await readShopTemplates()).toEqual(saved);
    });

    it("空の一覧を保存すると、その店舗の型だけをすべて削除する", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      await save(t, ids, [template()]);
      const before = await readSetupState(t);

      await save(t, ids, []);

      const after = await readSetupState(t);
      expect(after.dayTemplates).toEqual(before.dayTemplates.filter((item) => item.shopId !== ids.shopId));
      expect(after.dayTemplates.map((item) => item._id).sort()).toEqual(
        [ids.siblingTemplateId, ids.otherTemplateId].sort(),
      );
    });

    it.each<{ name: string; build: (ids: SeededIds) => TemplateInput[]; message: string }>([
      {
        name: "同じ曜日を2つの型に割り当てる",
        build: () => [template({ weekdays: ["mon", "tue"] }), template({ name: "週末", weekdays: ["sat", "tue"] })],
        message: "同じ曜日を2つの型に割り当てることはできません",
      },
      {
        name: "祝日に使う型を2つ選ぶ",
        build: () => [
          template({ appliesToHolidays: true }),
          template({ name: "年末年始", weekdays: [], appliesToHolidays: true }),
        ],
        message: "祝日に使う型は1つだけ選べます",
      },
      {
        name: "型の名前が重複する",
        build: () => [template({ weekdays: ["mon"] }), template({ name: " 平日 ", weekdays: ["tue"] })],
        message: "型の名前が重複しています",
      },
      { name: "型の名前が空白だけ", build: () => [template({ name: "  " })], message: "型の名前を入力してください" },
      {
        name: "型の名前が21文字",
        build: () => [template({ name: "あ".repeat(21) })],
        message: "型の名前は20文字以内で入力してください",
      },
      {
        name: "バーが30分刻みでない",
        build: (ids) => [template({ requirements: timeRequirements([bar(ids.hallPositionId, "09:15", "12:00")]) })],
        message: "バーの時間は30分単位にしてください",
      },
      {
        name: "バーの終了が開始より前",
        build: (ids) => [template({ requirements: timeRequirements([bar(ids.hallPositionId, "12:00", "09:00")]) })],
        message: "バーの終了時間は開始時間より後にしてください",
      },
      {
        name: "バーが受付時間の外に出る",
        build: (ids) => [template({ requirements: timeRequirements([bar(ids.hallPositionId, "08:00", "10:00")]) })],
        message: "受付時間の外に出ているバーがあります",
      },
      {
        name: "同時に重なるバーが1つのポジションで上限を超える",
        build: (ids) => [
          template({
            requirements: timeRequirements(
              Array.from({ length: SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT + 1 }, () =>
                bar(ids.hallPositionId, "11:00", "14:00"),
              ),
            ),
          }),
        ],
        message: "同じ時間に重ねられるバーは、1つのポジションで10本までです",
      },
      {
        name: "バーの本数が1つの型の上限を超える",
        build: (ids) => [
          template({
            requirements: timeRequirements(
              Array.from({ length: SHIFT_DAY_TEMPLATE_BAR_LIMIT + 1 }, (_, index) =>
                bar(ids.hallPositionId, `${9 + (index % 13)}:00`, `${10 + (index % 13)}:00`),
              ),
            ),
          }),
        ],
        message: "バーは1つの型に200本まで置けます",
      },
      {
        name: "時間指定の店舗へ、1日分の人数を渡す",
        build: (ids) => [
          template({ requirements: { kind: "dateOnly", counts: [{ positionId: ids.hallPositionId, count: 1 }] } }),
        ],
        message: "希望シフトの集め方に合わない必要人数があります",
      },
    ])("$name 保存は拒否する", async ({ build, message }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(t, () => save(t, ids, build(ids)), message);
    });

    it.each<{
      name: string;
      pattern: ShiftSubmissionPattern;
      build: (ids: SeededIds) => Requirements;
      message: string;
    }>([
      {
        name: "パターン選択の店舗へ、バー",
        pattern: SHIFT_TYPE_PATTERN,
        build: (ids) => timeRequirements([bar(ids.hallPositionId, "09:00", "15:00")]),
        message: "希望シフトの集め方に合わない必要人数があります",
      },
      {
        name: "パターン選択の店舗へ、店舗にない勤務パターン",
        pattern: SHIFT_TYPE_PATTERN,
        build: (ids) => ({
          kind: "shiftType",
          options: [{ optionId: "removed", counts: [{ positionId: ids.hallPositionId, count: 1 }] }],
        }),
        message: "勤務パターンが見つかりません",
      },
      {
        name: "パターン選択の店舗へ、同じ勤務パターンを2回",
        pattern: SHIFT_TYPE_PATTERN,
        build: () => ({
          kind: "shiftType",
          options: [
            { optionId: "early", counts: [] },
            { optionId: "early", counts: [] },
          ],
        }),
        message: "同じ勤務パターンの必要人数が重複しています",
      },
      {
        name: "パターン選択の店舗へ、上限を超える人数",
        pattern: SHIFT_TYPE_PATTERN,
        build: (ids) => ({
          kind: "shiftType",
          options: [
            {
              optionId: "early",
              counts: [{ positionId: ids.hallPositionId, count: SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX + 1 }],
            },
          ],
        }),
        message: "必要人数が正しくありません",
      },
      {
        name: "日付選択の店舗へ、勤務パターンごとの人数",
        pattern: DATE_ONLY_PATTERN,
        build: () => ({ kind: "shiftType", options: [] }),
        message: "希望シフトの集め方に合わない必要人数があります",
      },
      {
        name: "日付選択の店舗へ、整数でない人数",
        pattern: DATE_ONLY_PATTERN,
        build: (ids) => ({ kind: "dateOnly", counts: [{ positionId: ids.hallPositionId, count: 1.5 }] }),
        message: "必要人数が正しくありません",
      },
      {
        name: "日付選択の店舗へ、同じポジションの人数を2回",
        pattern: DATE_ONLY_PATTERN,
        build: (ids) => ({
          kind: "dateOnly",
          counts: [
            { positionId: ids.hallPositionId, count: 1 },
            { positionId: ids.hallPositionId, count: 2 },
          ],
        }),
        message: "同じポジションの必要人数が重複しています",
      },
    ])("$name を保存しようとすると拒否する", async ({ pattern, build, message }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t, { submissionPattern: pattern });

      await expectRejectedWithoutChange(t, () => save(t, ids, [template({ requirements: build(ids) })]), message);
    });

    const foreignPositions = [
      { name: "同じ組織の別店舗のポジション", pick: (ids: SeededIds) => ids.siblingPositionId },
      { name: "別組織のポジション", pick: (ids: SeededIds) => ids.otherPositionId },
      { name: "削除済みのポジション", pick: (ids: SeededIds) => ids.deletedPositionId },
    ];

    it.each(foreignPositions)("バーに $name を含む保存は Not found で拒否する", async ({ pick }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () =>
          save(t, ids, [
            template({
              requirements: timeRequirements([
                bar(ids.hallPositionId, "09:00", "22:00"),
                bar(pick(ids), "09:00", "22:00"),
              ]),
            }),
          ]),
        "Not found",
      );
    });

    it.each(foreignPositions)("勤務パターンごとの人数に $name を含む保存は Not found で拒否する", async ({ pick }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t, { submissionPattern: SHIFT_TYPE_PATTERN });

      await expectRejectedWithoutChange(
        t,
        () =>
          save(t, ids, [
            template({
              requirements: {
                kind: "shiftType",
                options: [
                  { optionId: "early", counts: [{ positionId: ids.hallPositionId, count: 1 }] },
                  { optionId: "late", counts: [{ positionId: pick(ids), count: 1 }] },
                ],
              },
            }),
          ]),
        "Not found",
      );
    });

    it.each(foreignPositions)("1日分の人数に $name を含む保存は Not found で拒否する", async ({ pick }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t, { submissionPattern: DATE_ONLY_PATTERN });

      await expectRejectedWithoutChange(
        t,
        () =>
          save(t, ids, [
            template({
              requirements: {
                kind: "dateOnly",
                counts: [
                  { positionId: ids.hallPositionId, count: 1 },
                  { positionId: pick(ids), count: 1 },
                ],
              },
            }),
          ]),
        "Not found",
      );
    });

    it.each([
      { name: "同じ組織の別店舗の型", pick: (ids: SeededIds) => ids.siblingTemplateId },
      { name: "別組織の型", pick: (ids: SeededIds) => ids.otherTemplateId },
      { name: "削除済みの型", pick: (ids: SeededIds) => ids.deletedTemplateId },
    ])("$name のidを渡すと Not found で拒否する", async ({ pick }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () =>
          save(t, ids, [
            template({ name: "新しい型", weekdays: ["mon"] }),
            template({ id: pick(ids), name: "書き換えた型", weekdays: ["tue"] }),
          ]),
        "Not found",
      );
    });

    it("同じ型のidを一覧に2回渡すと Not found で拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      await save(t, ids, [template()]);
      const templateId = (await readSetupState(t)).dayTemplates.find((item) => item.shopId === ids.shopId)?._id;
      if (!templateId) throw new Error("expected a saved template");

      await expectRejectedWithoutChange(
        t,
        () =>
          save(t, ids, [
            template({ id: templateId, name: "平日", weekdays: ["mon"] }),
            template({ id: templateId, name: "週末", weekdays: ["sat"] }),
          ]),
        "Not found",
      );
    });

    it("型は上限の件数まで保存でき、1件でも超えると拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const templates = Array.from({ length: SHIFT_DAY_TEMPLATE_LIMIT + 1 }, (_, index) =>
        template({ name: `型${index + 1}`, weekdays: [] }),
      );

      await save(t, ids, templates.slice(0, SHIFT_DAY_TEMPLATE_LIMIT));

      expect(projectTemplates((await readSetupState(t)).dayTemplates, ids.shopId).map(({ name }) => name)).toEqual(
        templates.slice(0, SHIFT_DAY_TEMPLATE_LIMIT).map(({ name }) => name),
      );
      expect(SHIFT_DAY_TEMPLATE_LIMIT).toBe(20);
      await expectRejectedWithoutChange(t, () => save(t, ids, templates), "型は20件まで作れます");
    });

    it("バーは、1つの型の上限の本数と、1つのポジションで同時に重なる上限の本数まで保存できる", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      // 13の時間帯に、3つのポジションで合わせて200本を置く。ホールは11:00からの1時間に上限まで重ねる。
      const hours = Array.from({ length: 13 }, (_, index) => 9 + index);
      const bars = [
        ...Array.from({ length: SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT }, () =>
          bar(ids.hallPositionId, "11:00", "12:00"),
        ),
        ...hours.flatMap((hour) =>
          [ids.defaultPositionId, ids.kitchenPositionId].flatMap((positionId) =>
            Array.from({ length: 8 }, () => bar(positionId, `${hour}:00`, `${hour + 1}:00`)),
          ),
        ),
      ].slice(0, SHIFT_DAY_TEMPLATE_BAR_LIMIT);

      await save(t, ids, [template({ requirements: timeRequirements(bars) })]);

      const [saved] = projectTemplates((await readSetupState(t)).dayTemplates, ids.shopId);
      expect(bars).toHaveLength(SHIFT_DAY_TEMPLATE_BAR_LIMIT);
      expect(saved.requirements.kind === "time" && saved.requirements.bars).toHaveLength(SHIFT_DAY_TEMPLATE_BAR_LIMIT);
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
    type Level = "unavailable" | "newcomer" | "lead";
    const skill = (positionId: Id<"positions">, level: Level) => ({ positionId, level });
    const readStaffProfile = async (t: Test, staffId: Id<"staffs">) => {
      const staff = await t.run(async (ctx) => ctx.db.get(staffId));
      if (!staff) throw new Error("staff fixture is missing");
      return { hasField: Object.hasOwn(staff, "positionSkills"), positionSkills: staff.positionSkills };
    };

    it("ポジションごとの扱いをスタッフごとに全置換で保存し、空にするとfieldを消す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      // 保存前の項目が残らないことを確かめるため、今回の保存に含めないポジションの項目を置く。
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.staffId, { positionSkills: [skill(ids.hallPositionId, "newcomer")] });
      });
      const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
      const before = await readSetupState(t);

      await asManager.mutation(api.shiftSetup.mutations.saveStaffShiftProfiles, {
        ...ids.scope,
        profiles: [
          {
            staffId: ids.staffId,
            positionSkills: [skill(ids.kitchenPositionId, "unavailable"), skill(ids.defaultPositionId, "lead")],
          },
          {
            // 入れるポジションが1つ残る保存は受け付ける。
            staffId: ids.secondStaffId,
            positionSkills: [
              skill(ids.defaultPositionId, "unavailable"),
              skill(ids.hallPositionId, "unavailable"),
              skill(ids.kitchenPositionId, "newcomer"),
            ],
          },
        ],
      });

      const secondStaffProfile = {
        hasField: true,
        positionSkills: [
          skill(ids.defaultPositionId, "unavailable"),
          skill(ids.hallPositionId, "unavailable"),
          skill(ids.kitchenPositionId, "newcomer"),
        ],
      };
      expect(await readStaffProfile(t, ids.staffId)).toEqual({
        hasField: true,
        positionSkills: [skill(ids.kitchenPositionId, "unavailable"), skill(ids.defaultPositionId, "lead")],
      });
      expect(await readStaffProfile(t, ids.secondStaffId)).toEqual(secondStaffProfile);
      const saved = await readSetupState(t);
      const targetStaffIds = new Set<Id<"staffs">>([ids.staffId, ids.secondStaffId]);
      expect(saved.staffs.filter((staff) => !targetStaffIds.has(staff._id))).toEqual(
        before.staffs.filter((staff) => !targetStaffIds.has(staff._id)),
      );
      // スタッフの属性のほかは、保存で変えない。
      expect({ ...saved, staffs: [] }).toEqual({ ...before, staffs: [] });

      await asManager.mutation(api.shiftSetup.mutations.saveStaffShiftProfiles, {
        ...ids.scope,
        profiles: [{ staffId: ids.staffId, positionSkills: [] }],
      });

      expect(await readStaffProfile(t, ids.staffId)).toEqual({ hasField: false, positionSkills: undefined });
      // 一覧に含めなかったスタッフの属性は変えない。
      expect(await readStaffProfile(t, ids.secondStaffId)).toEqual(secondStaffProfile);
    });

    it("有効なポジションがない店舗でも、空の保存は受け付けてfieldを消す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.staffId, { positionSkills: [skill(ids.hallPositionId, "lead")] });
        for (const positionId of [ids.defaultPositionId, ids.hallPositionId, ids.kitchenPositionId]) {
          await ctx.db.patch(positionId, { isDeleted: true });
        }
      });

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.saveStaffShiftProfiles, {
        ...ids.scope,
        profiles: [{ staffId: ids.staffId, positionSkills: [] }],
      });

      expect(await readStaffProfile(t, ids.staffId)).toEqual({ hasField: false, positionSkills: undefined });
    });

    it.each([
      {
        name: "同じ組織の別店舗のスタッフ",
        build: (ids: SeededIds) => ({ staffId: ids.siblingStaffId, positionSkills: [] }),
      },
      {
        name: "別組織のスタッフ",
        build: (ids: SeededIds) => ({ staffId: ids.otherStaffId, positionSkills: [] }),
      },
      {
        name: "削除済みのスタッフ",
        build: (ids: SeededIds) => ({ staffId: ids.deletedStaffId, positionSkills: [] }),
      },
      {
        name: "一覧の中で重複したスタッフ",
        build: (ids: SeededIds) => ({ staffId: ids.staffId, positionSkills: [] }),
      },
      {
        name: "同じ組織の別店舗のポジション",
        build: (ids: SeededIds) => ({
          staffId: ids.secondStaffId,
          positionSkills: [skill(ids.siblingPositionId, "unavailable")],
        }),
      },
      {
        name: "別組織のポジション",
        build: (ids: SeededIds) => ({
          staffId: ids.secondStaffId,
          positionSkills: [skill(ids.otherPositionId, "newcomer")],
        }),
      },
      {
        name: "削除済みのポジション（入れない）",
        build: (ids: SeededIds) => ({
          staffId: ids.secondStaffId,
          positionSkills: [skill(ids.deletedPositionId, "unavailable")],
        }),
      },
      {
        name: "削除済みのポジション（責任者）",
        build: (ids: SeededIds) => ({
          staffId: ids.secondStaffId,
          positionSkills: [skill(ids.deletedPositionId, "lead")],
        }),
      },
      {
        name: "1人の中で、同じ扱いで重複したポジション",
        build: (ids: SeededIds) => ({
          staffId: ids.secondStaffId,
          positionSkills: [skill(ids.hallPositionId, "newcomer"), skill(ids.hallPositionId, "newcomer")],
        }),
      },
      {
        name: "1人の中で、違う扱いで重複したポジション",
        build: (ids: SeededIds) => ({
          staffId: ids.secondStaffId,
          positionSkills: [skill(ids.hallPositionId, "unavailable"), skill(ids.hallPositionId, "lead")],
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
            profiles: [{ staffId: ids.staffId, positionSkills: [skill(ids.hallPositionId, "lead")] }, build(ids)],
          }),
        "Not found",
      );
    });

    it("有効なポジションのすべてを入れないにする保存は拒否し、同じ一覧のほかのスタッフも保存しない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () =>
          t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.saveStaffShiftProfiles, {
            ...ids.scope,
            profiles: [
              { staffId: ids.secondStaffId, positionSkills: [skill(ids.hallPositionId, "lead")] },
              {
                staffId: ids.staffId,
                positionSkills: [
                  skill(ids.defaultPositionId, "unavailable"),
                  skill(ids.hallPositionId, "unavailable"),
                  skill(ids.kitchenPositionId, "unavailable"),
                ],
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
              positionSkills: [skill(ids.hallPositionId, "lead")],
            })),
          }),
        "一度に保存できるスタッフ数を超えています",
      );
    });
  });

  describe("applyDayTemplateToDates", () => {
    async function seedTemplates(t: Test, ids: SeededIds, kind: Requirements["kind"] = "time") {
      return await t.run(async (ctx) => {
        const insert = (name: string, sortOrder: number) =>
          ctx.db.insert("shiftDayTemplates", {
            shopId: ids.shopId,
            name,
            weekdays: [],
            sortOrder,
            appliesToHolidays: false,
            requirements: buildEmptyDayRequirements(kind),
          });
        return { eventTemplateId: await insert("イベントの日", 0), quietTemplateId: await insert("ひまな日", 1) };
      });
    }
    const apply = (
      t: Test,
      ids: SeededIds,
      args: { recruitmentId?: Id<"recruitments">; dates: string[]; templateId: Id<"shiftDayTemplates"> | null },
    ) =>
      t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.applyDayTemplateToDates, {
        ...ids.scope,
        recruitmentId: args.recruitmentId ?? ids.recruitmentId,
        dates: args.dates,
        templateId: args.templateId,
      });
    const readOverrides = async (t: Test) => projectOverrides((await readSetupState(t)).dayTemplateOverrides);

    it("選んだ複数の日へ型を当て、同じ日の指定を置き換えて1件だけにし、nullで指定を消す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const templates = await seedTemplates(t, ids);
      const customRequirements = timeRequirements([bar(ids.hallPositionId, "10:00", "12:00")]);
      await t.run(async (ctx) => {
        // その日だけの必要人数がある日、別の型を当てた日、同じ日に指定が2件残っている日を用意する。
        await ctx.db.insert("shiftDayTemplateOverrides", {
          shopId: ids.shopId,
          date: "2026-01-20",
          kind: "custom",
          requirements: customRequirements,
        });
        for (const date of ["2026-01-21", "2026-01-22", "2026-01-22", "2026-01-25"]) {
          await ctx.db.insert("shiftDayTemplateOverrides", {
            shopId: ids.shopId,
            date,
            kind: "template",
            templateId: templates.quietTemplateId,
          });
        }
        // 同じ日付でも、ほかの店舗の指定は変えない。
        await ctx.db.insert("shiftDayTemplateOverrides", {
          shopId: ids.siblingShopId,
          date: "2026-01-20",
          kind: "template",
          templateId: ids.siblingTemplateId,
        });
      });
      const before = await readSetupState(t);
      const siblingOverride = {
        shopId: ids.siblingShopId,
        date: "2026-01-20",
        kind: "template",
        templateId: ids.siblingTemplateId,
      };
      const shopOverride = (date: string, templateId: Id<"shiftDayTemplates">) => ({
        shopId: ids.shopId,
        date,
        kind: "template",
        templateId,
      });
      const sortOverrides = <T extends { shopId: string; date: string }>(overrides: T[]) =>
        overrides.sort((a, b) => a.shopId.localeCompare(b.shopId) || a.date.localeCompare(b.date));

      await apply(t, ids, {
        dates: ["2026-01-22", "2026-01-19", "2026-01-20"],
        templateId: templates.eventTemplateId,
      });

      expect(await readOverrides(t)).toEqual(
        sortOverrides([
          shopOverride("2026-01-19", templates.eventTemplateId),
          shopOverride("2026-01-20", templates.eventTemplateId),
          shopOverride("2026-01-21", templates.quietTemplateId),
          shopOverride("2026-01-22", templates.eventTemplateId),
          shopOverride("2026-01-25", templates.quietTemplateId),
          siblingOverride,
        ]),
      );

      await apply(t, ids, { dates: ["2026-01-20", "2026-01-25", "2026-01-23"], templateId: null });

      expect(await readOverrides(t)).toEqual(
        sortOverrides([
          shopOverride("2026-01-19", templates.eventTemplateId),
          shopOverride("2026-01-21", templates.quietTemplateId),
          shopOverride("2026-01-22", templates.eventTemplateId),
          siblingOverride,
        ]),
      );
      // その日だけの指定のほかは、型を含めてどの設定も変えない。
      expect({ ...(await readSetupState(t)), dayTemplateOverrides: [] }).toEqual({
        ...before,
        dayTemplateOverrides: [],
      });
    });

    it("募集期間の上限の日数まで、1回で当てられる", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const templates = await seedTemplates(t, ids);
      const periodEnd = addDays(PERIOD_START, RECRUITMENT_PERIOD_DAYS_MAX - 1);
      await t.run(async (ctx) => ctx.db.patch(ids.recruitmentId, { periodEnd }));
      const dates = generateDateRange(PERIOD_START, periodEnd);

      await apply(t, ids, { dates, templateId: templates.eventTemplateId });

      expect(RECRUITMENT_PERIOD_DAYS_MAX).toBe(31);
      expect(await readOverrides(t)).toEqual(
        dates.map((date) => ({ shopId: ids.shopId, date, kind: "template", templateId: templates.eventTemplateId })),
      );
    });

    it("日付を1つも渡さなければ、何も変えない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const templates = await seedTemplates(t, ids);
      const before = await readSetupState(t);

      await apply(t, ids, { dates: [], templateId: templates.eventTemplateId });

      expect(await readSetupState(t)).toEqual(before);
    });

    it.each([
      { name: "同じ組織の別店舗の型", pick: (ids: SeededIds) => ids.siblingTemplateId },
      { name: "別組織の型", pick: (ids: SeededIds) => ids.otherTemplateId },
      { name: "削除済みの型", pick: (ids: SeededIds) => ids.deletedTemplateId },
    ])("$name を当てようとすると Not found で拒否する", async ({ pick }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () => apply(t, ids, { dates: ["2026-01-20"], templateId: pick(ids) }),
        "Not found",
      );
    });

    it.each([
      { name: "同じ組織の別店舗の募集", pick: (ids: SeededIds) => ids.siblingRecruitmentId },
      { name: "別組織の募集", pick: (ids: SeededIds) => ids.otherRecruitmentId },
      { name: "削除済みの募集", pick: (ids: SeededIds) => ids.deletedRecruitmentId },
    ])("$name を指定すると Not found で拒否する", async ({ pick }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const templates = await seedTemplates(t, ids);

      await expectRejectedWithoutChange(
        t,
        () => apply(t, ids, { recruitmentId: pick(ids), dates: ["2026-01-20"], templateId: templates.eventTemplateId }),
        "Not found",
      );
      await expectRejectedWithoutChange(
        t,
        () => apply(t, ids, { recruitmentId: pick(ids), dates: ["2026-01-20"], templateId: null }),
        "Not found",
      );
    });

    it.each([
      { name: "募集期間の前の日", dates: ["2026-01-19", "2026-01-18"], message: "募集期間内の日付を選んでください" },
      { name: "募集期間の後の日", dates: ["2026-01-26"], message: "募集期間内の日付を選んでください" },
      { name: "存在しない日付", dates: ["2026-01-32"], message: "日付の形式が正しくありません" },
      { name: "書式の違う日付", dates: ["2026/01/20"], message: "日付の形式が正しくありません" },
      { name: "重複した日付", dates: ["2026-01-20", "2026-01-21", "2026-01-20"], message: "同じ日付が重複しています" },
    ])("$name を含む指定は拒否し、ほかの日にも当てない", async ({ dates, message }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const templates = await seedTemplates(t, ids);

      await expectRejectedWithoutChange(
        t,
        () => apply(t, ids, { dates, templateId: templates.eventTemplateId }),
        message,
      );
      await expectRejectedWithoutChange(t, () => apply(t, ids, { dates, templateId: null }), message);
    });

    it("32日以上の指定は拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const templates = await seedTemplates(t, ids);
      const dates = generateDateRange(PERIOD_START, addDays(PERIOD_START, RECRUITMENT_PERIOD_DAYS_MAX));
      // 日数の上限だけで拒否されることを確かめるため、渡す日付をすべて募集期間の内側にする。
      await t.run(async (ctx) => ctx.db.patch(ids.recruitmentId, { periodEnd: dates[dates.length - 1] }));

      expect(dates).toHaveLength(32);
      await expectRejectedWithoutChange(
        t,
        () => apply(t, ids, { dates, templateId: templates.eventTemplateId }),
        "一度に変更できるのは31日までです",
      );
    });

    it("確定済みの募集では、型を当てることも、指定を消すこともできない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const templates = await seedTemplates(t, ids);
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.recruitmentId, { status: "confirmed", confirmedAt: 1 });
        await ctx.db.insert("shiftDayTemplateOverrides", {
          shopId: ids.shopId,
          date: "2026-01-20",
          kind: "template",
          templateId: templates.quietTemplateId,
        });
      });

      await expectRejectedWithoutChange(
        t,
        () => apply(t, ids, { dates: ["2026-01-20"], templateId: templates.eventTemplateId }),
        "確定済みのシフトでは、必要人数を変更できません。",
      );
      await expectRejectedWithoutChange(
        t,
        () => apply(t, ids, { dates: ["2026-01-20"], templateId: null }),
        "確定済みのシフトでは、必要人数を変更できません。",
      );
    });

    it("必要人数の種類が募集の集め方と違う型は当てられない", async () => {
      const t = convexTest(schema, modules);
      // 募集を作ったあとで、店舗が集め方を時間指定からパターン選択へ変えた状態。
      const ids = await seedShops(t, { submissionPattern: SHIFT_TYPE_PATTERN, recruitmentPattern: TIME_PATTERN });
      const shiftTypeTemplates = await seedTemplates(t, ids, "shiftType");

      await expectRejectedWithoutChange(
        t,
        () => apply(t, ids, { dates: ["2026-01-20"], templateId: shiftTypeTemplates.eventTemplateId }),
        "この募集の集め方に合わない型は当てられません",
      );
    });
  });

  describe("saveDayCustomRequirements", () => {
    const saveCustom = (
      t: Test,
      ids: SeededIds,
      args: { recruitmentId?: Id<"recruitments">; date?: string; requirements: Requirements },
    ) =>
      t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.saveDayCustomRequirements, {
        ...ids.scope,
        recruitmentId: args.recruitmentId ?? ids.recruitmentId,
        date: args.date ?? "2026-01-20",
        requirements: args.requirements,
      });
    const readShopOverrides = async (t: Test, shopId: Id<"shops">) =>
      projectOverrides((await readSetupState(t)).dayTemplateOverrides).filter((item) => item.shopId === shopId);

    it("その日だけの必要人数を、バーを並べ直して保存し、その日に当てていた型の指定を置き換える。型は変えない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      const templateId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("shiftDayTemplates", {
          shopId: ids.shopId,
          name: "平日",
          weekdays: ["tue"],
          sortOrder: 0,
          appliesToHolidays: false,
          requirements: timeRequirements([bar(ids.hallPositionId, "09:00", "22:00")]),
        });
        for (const date of ["2026-01-20", "2026-01-21"]) {
          await ctx.db.insert("shiftDayTemplateOverrides", {
            shopId: ids.shopId,
            date,
            kind: "template",
            templateId: id,
          });
        }
        return id;
      });
      const before = await readSetupState(t);

      await saveCustom(t, ids, {
        requirements: timeRequirements([
          bar(ids.hallPositionId, "14:00", "18:00"),
          bar(ids.hallPositionId, "10:00", "14:00"),
          bar(ids.defaultPositionId, "10:00", "14:00"),
        ]),
      });

      const [first, second] = [ids.defaultPositionId, ids.hallPositionId].sort();
      expect(await readShopOverrides(t, ids.shopId)).toEqual([
        {
          shopId: ids.shopId,
          date: "2026-01-20",
          kind: "custom",
          requirements: timeRequirements([
            bar(first, "10:00", "14:00"),
            bar(second, "10:00", "14:00"),
            bar(ids.hallPositionId, "14:00", "18:00"),
          ]),
        },
        { shopId: ids.shopId, date: "2026-01-21", kind: "template", templateId },
      ]);
      expect({ ...(await readSetupState(t)), dayTemplateOverrides: [] }).toEqual({
        ...before,
        dayTemplateOverrides: [],
      });
    });

    it("その日だけの必要人数を保存した日は、型へ戻すと指定が消え、シフト表は曜日の型の必要人数へ戻る", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      // 2026-01-20は火曜。
      const templateId = await t.run(async (ctx) =>
        ctx.db.insert("shiftDayTemplates", {
          shopId: ids.shopId,
          name: "平日",
          weekdays: ["tue"],
          sortOrder: 0,
          appliesToHolidays: false,
          requirements: timeRequirements([bar(ids.hallPositionId, "09:00", "22:00")]),
        }),
      );
      const readDay = async () => {
        const staffing = await t
          .withIdentity({ subject: MANAGER_SUBJECT })
          .query(api.shiftBoard.queries.getShiftBoardStaffing, { ...ids.scope, recruitmentId: ids.recruitmentId });
        return staffing?.days.filter((day) => day.date === "2026-01-20");
      };

      await saveCustom(t, ids, { requirements: timeRequirements([bar(ids.hallPositionId, "10:00", "14:00")]) });
      expect(await readDay()).toEqual([
        {
          date: "2026-01-20",
          source: "dateCustom",
          templateId: null,
          templateName: null,
          requirements: timeRequirements([bar(ids.hallPositionId, "10:00", "14:00")]),
        },
      ]);

      await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftSetup.mutations.applyDayTemplateToDates, {
        ...ids.scope,
        recruitmentId: ids.recruitmentId,
        dates: ["2026-01-20"],
        templateId: null,
      });

      expect(await readShopOverrides(t, ids.shopId)).toEqual([]);
      expect(await readDay()).toEqual([
        {
          date: "2026-01-20",
          source: "weekday",
          templateId,
          templateName: "平日",
          requirements: timeRequirements([bar(ids.hallPositionId, "09:00", "22:00")]),
        },
      ]);
    });

    it("同じ日をもう一度保存すると、その日の必要人数を置き換えて1件だけにする", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await saveCustom(t, ids, { requirements: timeRequirements([bar(ids.hallPositionId, "10:00", "14:00")]) });
      await saveCustom(t, ids, { requirements: timeRequirements([]) });

      expect(await readShopOverrides(t, ids.shopId)).toEqual([
        { shopId: ids.shopId, date: "2026-01-20", kind: "custom", requirements: timeRequirements([]) },
      ]);
    });

    it.each<{ name: string; pattern: ShiftSubmissionPattern; build: (ids: SeededIds) => Requirements }>([
      {
        name: "パターン選択",
        pattern: SHIFT_TYPE_PATTERN,
        build: (ids) => ({
          kind: "shiftType",
          options: [{ optionId: "late", counts: [{ positionId: ids.hallPositionId, count: 2 }] }],
        }),
      },
      {
        name: "日付選択",
        pattern: DATE_ONLY_PATTERN,
        build: (ids) => ({ kind: "dateOnly", counts: [{ positionId: ids.kitchenPositionId, count: 4 }] }),
      },
    ])("$name の募集では、人数をその日だけの必要人数として保存する", async ({ pattern, build }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t, { submissionPattern: pattern });

      await saveCustom(t, ids, { requirements: build(ids) });

      expect(await readShopOverrides(t, ids.shopId)).toEqual([
        { shopId: ids.shopId, date: "2026-01-20", kind: "custom", requirements: build(ids) },
      ]);
    });

    it("必要人数は、店舗のいまの集め方ではなく、募集の集め方に照らして検証する", async () => {
      const t = convexTest(schema, modules);
      // 募集（時間指定 10:00-20:00）を作ったあとで、店舗が集め方をパターン選択へ変えた状態。
      const ids = await seedShops(t, {
        submissionPattern: SHIFT_TYPE_PATTERN,
        recruitmentPattern: { kind: "time", startTime: "10:00", endTime: "20:00" },
      });

      await expectRejectedWithoutChange(
        t,
        () =>
          saveCustom(t, ids, {
            requirements: {
              kind: "shiftType",
              options: [{ optionId: "early", counts: [{ positionId: ids.hallPositionId, count: 1 }] }],
            },
          }),
        "希望シフトの集め方に合わない必要人数があります",
      );
      await expectRejectedWithoutChange(
        t,
        () => saveCustom(t, ids, { requirements: timeRequirements([bar(ids.hallPositionId, "09:00", "12:00")]) }),
        "受付時間の外に出ているバーがあります",
      );

      await saveCustom(t, ids, { requirements: timeRequirements([bar(ids.hallPositionId, "10:00", "20:00")]) });

      expect(await readShopOverrides(t, ids.shopId)).toEqual([
        {
          shopId: ids.shopId,
          date: "2026-01-20",
          kind: "custom",
          requirements: timeRequirements([bar(ids.hallPositionId, "10:00", "20:00")]),
        },
      ]);
    });

    it.each<{ name: string; build: (ids: SeededIds) => Requirements; message: string }>([
      {
        name: "30分刻みでないバー",
        build: (ids) => timeRequirements([bar(ids.hallPositionId, "10:00", "10:45")]),
        message: "バーの時間は30分単位にしてください",
      },
      {
        name: "1つのポジションで同時に上限を超えて重なるバー",
        build: (ids) =>
          timeRequirements(
            Array.from({ length: SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT + 1 }, () =>
              bar(ids.hallPositionId, "11:00", "14:00"),
            ),
          ),
        message: "同じ時間に重ねられるバーは、1つのポジションで10本までです",
      },
      {
        name: "同じ組織の別店舗のポジション",
        build: (ids) => timeRequirements([bar(ids.siblingPositionId, "10:00", "14:00")]),
        message: "Not found",
      },
      {
        name: "別組織のポジション",
        build: (ids) => timeRequirements([bar(ids.otherPositionId, "10:00", "14:00")]),
        message: "Not found",
      },
      {
        name: "削除済みのポジション",
        build: (ids) =>
          timeRequirements([bar(ids.hallPositionId, "10:00", "14:00"), bar(ids.deletedPositionId, "10:00", "14:00")]),
        message: "Not found",
      },
    ])("$name を含む必要人数は拒否する", async ({ build, message }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(t, () => saveCustom(t, ids, { requirements: build(ids) }), message);
    });

    it.each([
      { name: "同じ組織の別店舗の募集", pick: (ids: SeededIds) => ids.siblingRecruitmentId },
      { name: "別組織の募集", pick: (ids: SeededIds) => ids.otherRecruitmentId },
      { name: "削除済みの募集", pick: (ids: SeededIds) => ids.deletedRecruitmentId },
    ])("$name を指定すると Not found で拒否する", async ({ pick }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () => saveCustom(t, ids, { recruitmentId: pick(ids), requirements: timeRequirements([]) }),
        "Not found",
      );
    });

    it.each([
      { name: "募集期間の前の日", date: "2026-01-18", message: "募集期間内の日付を選んでください" },
      { name: "募集期間の後の日", date: "2026-01-26", message: "募集期間内の日付を選んでください" },
      { name: "存在しない日付", date: "2026-02-30", message: "日付の形式が正しくありません" },
    ])("$name は拒否する", async ({ date, message }) => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);

      await expectRejectedWithoutChange(
        t,
        () => saveCustom(t, ids, { date, requirements: timeRequirements([]) }),
        message,
      );
    });

    it("確定済みの募集では、その日だけの必要人数を保存できない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedShops(t);
      await t.run(async (ctx) => ctx.db.patch(ids.recruitmentId, { status: "confirmed", confirmedAt: 1 }));

      await expectRejectedWithoutChange(
        t,
        () => saveCustom(t, ids, { requirements: timeRequirements([bar(ids.hallPositionId, "10:00", "14:00")]) }),
        "確定済みのシフトでは、必要人数を変更できません。",
      );
    });
  });
});
