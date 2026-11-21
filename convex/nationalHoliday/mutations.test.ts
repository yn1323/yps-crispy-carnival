import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";
import { NATIONAL_HOLIDAY_NAME_MAX_LENGTH, NATIONAL_HOLIDAY_YEAR_LIMIT } from "../constants";
import * as nationalHolidayMutations from "./mutations";

type Test = TestConvex<typeof schema>;
type Holiday = { date: string; name: string };

const replaceRef = internal.nationalHoliday.mutations.replaceNationalHolidaysForYear;

async function readHolidays(t: Test): Promise<Holiday[]> {
  return await t.run(async (ctx) =>
    (await ctx.db.query("nationalHolidays").withIndex("by_date").collect()).map(({ date, name }) => ({ date, name })),
  );
}

async function seedHolidays(t: Test, holidays: Holiday[]) {
  await t.run(async (ctx) => {
    for (const holiday of holidays) await ctx.db.insert("nationalHolidays", holiday);
  });
}

/** 置き換えが拒否され、祝日の表が変わらないことを確かめる。 */
async function expectRejectedWithoutChange(t: Test, args: { year: number; holidays: Holiday[] }, message: string) {
  const before = await readHolidays(t);
  await expect(t.mutation(replaceRef, args)).rejects.toThrowError(message);
  expect(await readHolidays(t)).toEqual(before);
}

describe("nationalHoliday/mutations", () => {
  describe("replaceNationalHolidaysForYear", () => {
    it("指定した年の祝日だけを、渡した一覧で置き換える", async () => {
      const t = convexTest(schema, modules);
      await seedHolidays(t, [
        { date: "2025-12-31", name: "前の年の末日" },
        { date: "2026-01-01", name: "元日" },
        { date: "2026-02-11", name: "古い名前" },
        { date: "2026-12-31", name: "消える日" },
        { date: "2027-01-01", name: "元日" },
      ]);

      const result = await t.mutation(replaceRef, {
        year: 2026,
        holidays: [
          { date: "2026-02-11", name: " 建国記念の日 " },
          { date: "2026-01-12", name: "成人の日" },
        ],
      });

      expect(result).toEqual({ deletedCount: 3, insertedCount: 2 });
      expect(await readHolidays(t)).toEqual([
        { date: "2025-12-31", name: "前の年の末日" },
        { date: "2026-01-12", name: "成人の日" },
        { date: "2026-02-11", name: "建国記念の日" },
        { date: "2027-01-01", name: "元日" },
      ]);
    });

    it("同じ一覧をもう一度渡しても、同じ状態のままである", async () => {
      const t = convexTest(schema, modules);
      const args = { year: 2026, holidays: [{ date: "2026-01-01", name: "元日" }] };

      await t.mutation(replaceRef, args);
      const result = await t.mutation(replaceRef, args);

      expect(result).toEqual({ deletedCount: 1, insertedCount: 1 });
      expect(await readHolidays(t)).toEqual([{ date: "2026-01-01", name: "元日" }]);
    });

    it("空の一覧を渡すと、その年の祝日だけを消す", async () => {
      const t = convexTest(schema, modules);
      await seedHolidays(t, [
        { date: "2026-01-01", name: "元日" },
        { date: "2027-01-01", name: "元日" },
      ]);

      await t.mutation(replaceRef, { year: 2026, holidays: [] });

      expect(await readHolidays(t)).toEqual([{ date: "2027-01-01", name: "元日" }]);
    });

    it("1年分の上限の件数まで受け付け、1件でも超えると拒否する", async () => {
      const t = convexTest(schema, modules);
      const holidays = Array.from({ length: NATIONAL_HOLIDAY_YEAR_LIMIT + 1 }, (_, index) => ({
        date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
        name: `祝日${index + 1}`,
      }));

      await t.mutation(replaceRef, { year: 2026, holidays: holidays.slice(0, NATIONAL_HOLIDAY_YEAR_LIMIT) });

      expect(await readHolidays(t)).toHaveLength(NATIONAL_HOLIDAY_YEAR_LIMIT);
      expect(NATIONAL_HOLIDAY_YEAR_LIMIT).toBe(50);
      await expectRejectedWithoutChange(t, { year: 2026, holidays }, "祝日は1年に50件まで登録できます");
    });

    it.each<{ name: string; year: number; holidays: Holiday[]; message: string }>([
      {
        name: "書式の違う日付",
        year: 2026,
        holidays: [{ date: "2026/01/01", name: "元日" }],
        message: "日付の形式が正しくありません",
      },
      {
        name: "存在しない日付",
        year: 2026,
        holidays: [{ date: "2026-02-30", name: "ない日" }],
        message: "日付の形式が正しくありません",
      },
      {
        name: "別の年の日付",
        year: 2026,
        holidays: [
          { date: "2026-01-01", name: "元日" },
          { date: "2027-01-01", name: "元日" },
        ],
        message: "指定した年の日付だけを渡してください",
      },
      {
        name: "重複した日付",
        year: 2026,
        holidays: [
          { date: "2026-01-01", name: "元日" },
          { date: "2026-01-01", name: "元日（重複）" },
        ],
        message: "同じ日付が重複しています",
      },
      {
        name: "空白だけの名前",
        year: 2026,
        holidays: [{ date: "2026-01-01", name: " 　" }],
        message: "祝日の名前が正しくありません",
      },
      {
        name: "上限を超える長さの名前",
        year: 2026,
        holidays: [{ date: "2026-01-01", name: "あ".repeat(NATIONAL_HOLIDAY_NAME_MAX_LENGTH + 1) }],
        message: "祝日の名前が正しくありません",
      },
      { name: "整数でない年", year: 2026.5, holidays: [], message: "年が正しくありません" },
      { name: "範囲の外の年", year: 1999, holidays: [], message: "年が正しくありません" },
    ])("$name を含む一覧は拒否し、祝日の表を変えない", async ({ year, holidays, message }) => {
      const t = convexTest(schema, modules);
      await seedHolidays(t, [
        { date: "2026-01-01", name: "元日" },
        { date: "2026-05-03", name: "憲法記念日" },
      ]);

      await expectRejectedWithoutChange(t, { year, holidays }, message);
    });
  });

  it("祝日の表へ書き込む関数を、publicなAPIとして公開しない", () => {
    const registrations = Object.entries(nationalHolidayMutations).map(([name, registered]) => ({
      name,
      isInternal: (registered as { isInternal?: boolean }).isInternal === true,
      isPublic: (registered as { isPublic?: boolean }).isPublic === true,
    }));

    expect(registrations).toEqual([{ name: "replaceNationalHolidaysForYear", isInternal: true, isPublic: false }]);
  });
});
