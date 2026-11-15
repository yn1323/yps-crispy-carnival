import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { seedManagerShop, seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  SHIFT_DAY_TEMPLATE_LIMIT,
  SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH,
  SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX,
  SHIFT_DAY_TEMPLATE_SLOT_LIMIT,
  SHIFT_SETUP_ASSIST_SHORT_LIMIT,
  SHIFT_SETUP_ASSIST_SITUATION_MAX_LENGTH,
} from "../constants";
import { findDayTemplateIssue } from "./dayTemplates";

const MANAGER_SUBJECT = "shift_setup_assist_manager";
const OTHER_MANAGER_SUBJECT = "shift_setup_assist_other_manager";
const SITUATION = "平日は昼が混み、週末は夜まで忙しい居酒屋です。";

const SHIFT_TYPE_PATTERN: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
  ],
};

type Test = TestConvex<typeof schema>;
type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

async function seedAssistShop(
  t: Test,
  options?: { submissionPattern?: ShiftSubmissionPattern; regularClosedDays?: Weekday[] },
) {
  return await t.run(async (ctx) => {
    const actor = await seedManagerShop(ctx, { subject: MANAGER_SUBJECT, shopName: "AIサポート店舗" });
    const other = await seedOrganizationManagerShop(ctx, { subject: OTHER_MANAGER_SUBJECT, shopName: "別組織店舗" });
    await ctx.db.patch(actor.shopId, {
      ...(options?.submissionPattern ? { submissionPattern: options.submissionPattern } : {}),
      regularClosedDays: options?.regularClosedDays ?? [],
    });
    const insertPosition = (position: { name: string; sortOrder: number; isDefault?: boolean; isDeleted?: boolean }) =>
      ctx.db.insert("positions", {
        shopId: actor.shopId,
        name: position.name,
        color: "#3b82f6",
        sortOrder: position.sortOrder,
        isDefault: position.isDefault ?? false,
        isDeleted: position.isDeleted ?? false,
      });
    const kitchenPositionId = await insertPosition({ name: "キッチン", sortOrder: 2 });
    await insertPosition({ name: "削除済みポジション", sortOrder: 3, isDeleted: true });
    const defaultPositionId = await insertPosition({ name: "シフト", sortOrder: 0, isDefault: true });
    const hallPositionId = await insertPosition({ name: "ホール", sortOrder: 1 });
    await ctx.db.insert("positions", {
      shopId: other.shopId,
      name: "別組織のポジション",
      color: "#3b82f6",
      sortOrder: 0,
      isDefault: true,
      isDeleted: false,
    });
    await ctx.db.insert("shiftDayTemplates", {
      shopId: actor.shopId,
      name: "保存済みの型",
      weekdays: ["mon"],
      sortOrder: 0,
      slots: [],
    });
    return {
      scope: { shopId: actor.shopId, expectedOrganizationId: actor.organizationId },
      organizationId: actor.organizationId,
      otherShopId: other.shopId,
      // 下書きの必要人数は、有効なポジションを設定の並び順で持つ。
      activePositionIds: [defaultPositionId, hallPositionId, kitchenPositionId],
    };
  });
}

/** 下書きの作成が書き換えてはならない設定と、rate limitの消費を読む。 */
async function readState(t: Test) {
  return await t.run(async (ctx) => ({
    settings: {
      dayTemplates: await ctx.db.query("shiftDayTemplates").collect(),
      dayTemplateOverrides: await ctx.db.query("shiftDayTemplateOverrides").collect(),
      positions: await ctx.db.query("positions").collect(),
      shops: await ctx.db.query("shops").collect(),
      staffs: await ctx.db.query("staffs").collect(),
    },
    rateLimits: await ctx.db.query("rateLimits").collect(),
  }));
}

describe("shiftSetup/actions", () => {
  describe("suggestShiftSetup", () => {
    beforeEach(() => {
      // ローカルの環境変数に左右されないよう、未設定の状態を明示する。
      vi.stubEnv("SHIFT_SETUP_ASSIST_MODE", "");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("AIサポートが無効な環境では、下書きを返さず、設定もrate limitも変えない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedAssistShop(t);
      const before = await readState(t);

      const result = await t
        .withIdentity({ subject: MANAGER_SUBJECT })
        .action(api.shiftSetup.actions.suggestShiftSetup, { ...ids.scope, situation: SITUATION });

      expect(result).toEqual({ status: "unavailable" });
      expect(await readState(t)).toEqual(before);
    });

    it.each([
      {
        name: "時間指定",
        pattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
        slotKeys: [
          { kind: "time", startTime: "09:00", endTime: "11:00" },
          { kind: "time", startTime: "11:00", endTime: "14:00" },
          { kind: "time", startTime: "14:00", endTime: "17:00" },
          { kind: "time", startTime: "17:00", endTime: "21:00" },
          { kind: "time", startTime: "21:00", endTime: "22:00" },
        ],
      },
      {
        name: "パターン選択",
        pattern: SHIFT_TYPE_PATTERN,
        slotKeys: [
          { kind: "shiftType", optionId: "early" },
          { kind: "shiftType", optionId: "late" },
        ],
      },
      { name: "日付選択", pattern: { kind: "dateOnly" as const }, slotKeys: [{ kind: "allDay" }] },
    ])(
      "$name の店舗では、提出方法に合う区切りと上限内の人数を持つ下書きを返し、設定を変えない",
      async ({ pattern, slotKeys }) => {
        vi.stubEnv("SHIFT_SETUP_ASSIST_MODE", "random");
        const t = convexTest(schema, modules);
        const ids = await seedAssistShop(t, { submissionPattern: pattern, regularClosedDays: ["wed", "sun"] });
        const before = await readState(t);

        const result = await t
          .withIdentity({ subject: MANAGER_SUBJECT })
          .action(api.shiftSetup.actions.suggestShiftSetup, { ...ids.scope, situation: SITUATION });

        if (result.status !== "ok") throw new Error(`expected an ok draft but received ${result.status}`);
        const counts = result.templates.flatMap((template) =>
          template.slots.flatMap((slot) => slot.requirements.map((requirement) => requirement.count)),
        );
        expect(counts).toHaveLength(2 * slotKeys.length * ids.activePositionIds.length);
        expect(counts.filter((count) => !Number.isInteger(count) || count < 1)).toEqual([]);
        // 人数だけがランダムなので、人数を除いた形は完全一致で確かめる。定休日（水・日）は型に入らない。
        expect(
          result.templates.map((template) => ({
            ...template,
            slots: template.slots.map((slot) => ({
              key: slot.key,
              positionIds: slot.requirements.map((requirement) => requirement.positionId),
            })),
          })),
        ).toEqual([
          {
            name: "平日",
            weekdays: ["mon", "tue", "thu"],
            slots: slotKeys.map((key) => ({ key, positionIds: ids.activePositionIds })),
          },
          {
            name: "週末",
            weekdays: ["fri", "sat"],
            slots: slotKeys.map((key) => ({ key, positionIds: ids.activePositionIds })),
          },
        ]);
        // 下書きは、そのまま保存しても検証を通る形である。
        expect(
          findDayTemplateIssue({
            templates: result.templates,
            pattern,
            limits: {
              templates: SHIFT_DAY_TEMPLATE_LIMIT,
              nameLength: SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH,
              slots: SHIFT_DAY_TEMPLATE_SLOT_LIMIT,
              requiredCount: SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX,
            },
          }),
        ).toBeNull();
        expect((await readState(t)).settings).toEqual(before.settings);
      },
    );

    it("未認証は拒否し、設定もrate limitも変えない", async () => {
      vi.stubEnv("SHIFT_SETUP_ASSIST_MODE", "random");
      const t = convexTest(schema, modules);
      const ids = await seedAssistShop(t);
      const before = await readState(t);

      await expect(
        t.action(api.shiftSetup.actions.suggestShiftSetup, { ...ids.scope, situation: SITUATION }),
      ).rejects.toThrowError("Unauthenticated");

      expect(await readState(t)).toEqual(before);
    });

    it("別組織の管理者と、別組織の店舗の指定は Not found で拒否し、rate limitを消費しない", async () => {
      vi.stubEnv("SHIFT_SETUP_ASSIST_MODE", "random");
      const t = convexTest(schema, modules);
      const ids = await seedAssistShop(t);
      const before = await readState(t);

      await expect(
        t
          .withIdentity({ subject: OTHER_MANAGER_SUBJECT })
          .action(api.shiftSetup.actions.suggestShiftSetup, { ...ids.scope, situation: SITUATION }),
      ).rejects.toThrowError("Not found");
      await expect(
        t.withIdentity({ subject: MANAGER_SUBJECT }).action(api.shiftSetup.actions.suggestShiftSetup, {
          shopId: ids.otherShopId,
          expectedOrganizationId: ids.organizationId,
          situation: SITUATION,
        }),
      ).rejects.toThrowError("Not found");

      expect(await readState(t)).toEqual(before);
    });

    it("短時間の連打は上限の回数まで下書きを返し、超えた分はrateLimitedを返す", async () => {
      vi.stubEnv("SHIFT_SETUP_ASSIST_MODE", "random");
      const t = convexTest(schema, modules);
      const ids = await seedAssistShop(t);
      const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
      const before = await readState(t);

      const statuses: string[] = [];
      for (let count = 0; count < SHIFT_SETUP_ASSIST_SHORT_LIMIT + 2; count += 1) {
        const result = await asManager.action(api.shiftSetup.actions.suggestShiftSetup, {
          ...ids.scope,
          situation: SITUATION,
        });
        statuses.push(result.status);
      }

      expect(SHIFT_SETUP_ASSIST_SHORT_LIMIT).toBe(5);
      expect(statuses).toEqual(["ok", "ok", "ok", "ok", "ok", "rateLimited", "rateLimited"]);
      expect((await readState(t)).settings).toEqual(before.settings);
    });

    it.each([
      { name: "空文字", situation: "", message: "店の状況を入力してください" },
      { name: "空白だけ", situation: " \n　", message: "店の状況を入力してください" },
      {
        name: "上限を超える長さ",
        situation: "あ".repeat(SHIFT_SETUP_ASSIST_SITUATION_MAX_LENGTH + 1),
        message: "500文字以内で入力してください",
      },
    ])("$name の文章は拒否し、rate limitを消費しない", async ({ situation, message }) => {
      vi.stubEnv("SHIFT_SETUP_ASSIST_MODE", "random");
      const t = convexTest(schema, modules);
      const ids = await seedAssistShop(t);
      const before = await readState(t);

      await expect(
        t
          .withIdentity({ subject: MANAGER_SUBJECT })
          .action(api.shiftSetup.actions.suggestShiftSetup, { ...ids.scope, situation }),
      ).rejects.toThrowError(message);

      expect(await readState(t)).toEqual(before);
    });

    it("上限ちょうどの長さの文章は受け付ける", async () => {
      vi.stubEnv("SHIFT_SETUP_ASSIST_MODE", "random");
      const t = convexTest(schema, modules);
      const ids = await seedAssistShop(t);

      const result = await t
        .withIdentity({ subject: MANAGER_SUBJECT })
        .action(api.shiftSetup.actions.suggestShiftSetup, {
          ...ids.scope,
          situation: "あ".repeat(SHIFT_SETUP_ASSIST_SITUATION_MAX_LENGTH),
        });

      expect(result.status).toBe("ok");
    });
  });
});
