import { ConvexError, v } from "convex/values";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { hasControlCharacter, isValidIsoDateString } from "../_lib/validation";
import { NATIONAL_HOLIDAY_NAME_MAX_LENGTH, NATIONAL_HOLIDAY_YEAR_LIMIT } from "../constants";

const YEAR_MIN = 2000;
const YEAR_MAX = 2100;
// うるう年の日数。1年分の既存行を読み切るための窓で、1日1件の表では超えない。
const YEAR_READ_LIMIT = 366;

/**
 * 指定した年の祝日を、渡した一覧で置き換える。
 * 運営者がCLIから実行する。店舗の管理者が書き換えられないよう、publicな書き込みは作らない。
 * 同じ入力を繰り返しても、同じ状態になる。
 */
export const replaceNationalHolidaysForYear = internalMutation({
  args: {
    year: v.number(),
    holidays: v.array(v.object({ date: v.string(), name: v.string() })),
  },
  returns: v.object({ deletedCount: v.number(), insertedCount: v.number() }),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.year) || args.year < YEAR_MIN || args.year > YEAR_MAX) {
      throw new ConvexError("年が正しくありません");
    }
    if (args.holidays.length > NATIONAL_HOLIDAY_YEAR_LIMIT) {
      throw new ConvexError(`祝日は1年に${NATIONAL_HOLIDAY_YEAR_LIMIT}件まで登録できます`);
    }

    const yearPrefix = `${args.year}-`;
    const dates = new Set<string>();
    const holidays = args.holidays.map((holiday) => ({ date: holiday.date, name: holiday.name.trim() }));
    for (const holiday of holidays) {
      if (!isValidIsoDateString(holiday.date)) throw new ConvexError("日付の形式が正しくありません");
      if (!holiday.date.startsWith(yearPrefix)) throw new ConvexError("指定した年の日付だけを渡してください");
      if (dates.has(holiday.date)) throw new ConvexError("同じ日付が重複しています");
      dates.add(holiday.date);
      if (
        !holiday.name ||
        holiday.name.length > NATIONAL_HOLIDAY_NAME_MAX_LENGTH ||
        hasControlCharacter(holiday.name)
      ) {
        throw new ConvexError("祝日の名前が正しくありません");
      }
    }

    const existing = await ctx.db
      .query("nationalHolidays")
      .withIndex("by_date", (q) => q.gte("date", `${args.year}-01-01`).lte("date", `${args.year}-12-31`))
      .take(YEAR_READ_LIMIT + 1);
    if (existing.length > YEAR_READ_LIMIT) throw new Error("National holiday scope exceeds the supported limit");

    await Promise.all(existing.map((holiday) => ctx.db.delete(holiday._id)));
    await Promise.all(holidays.map((holiday) => ctx.db.insert("nationalHolidays", holiday)));
    return { deletedCount: existing.length, insertedCount: holidays.length };
  },
});
