import { describe, expect, it, vi } from "vitest";
import {
  addDays,
  formatDateJa,
  formatDateLabel,
  formatDateTimeJa,
  formatDateTimeLabel,
  formatDeadlineLabel,
  formatPeriodLabel,
  generateDateRange,
  getDeadlineCutoff,
  getManagerConfirmationReminderAt,
  getMondayWeekStart,
  getReminderScheduledAt,
  getShopActivationReminderAt,
  getSubmitLinkCutoff,
  getWeekday,
  isPastShiftPeriod,
  subtractCalendarMonths,
  todayJST,
} from "./dateFormat";

describe("dateFormat", () => {
  it("日付と期間を曜日付きで表示できる", () => {
    expect(formatDateLabel("2026-06-01")).toBe("6/1(月)");
    expect(formatPeriodLabel("2026-06-01", "2026-06-03")).toBe("6/1(月)〜6/3(水)");
  });

  it("UTC基準で日付加算と曜日計算ができる", () => {
    expect(addDays("2026-06-01", 3)).toBe("2026-06-04");
    expect(getWeekday("2026-06-01")).toBe(1);
    expect(getMondayWeekStart("2026-06-07")).toBe("2026-06-01");
  });

  it("暦月を戻すときは移動先の月末へ丸める", () => {
    expect(subtractCalendarMonths("2026-03-31", 1)).toBe("2026-02-28");
    expect(subtractCalendarMonths("2024-03-31", 1)).toBe("2024-02-29");
    expect(subtractCalendarMonths("2026-01-15", 25)).toBe("2023-12-15");
  });

  it("期間内の日付を生成できる", () => {
    expect(generateDateRange("2026-06-01", "2026-06-03")).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
  });

  it("Unix msをJSTの曜日付き日時に変換できる", () => {
    expect(formatDateTimeLabel(new Date("2026-06-01T15:30:00.000Z").getTime())).toBe("6/2(火) 00:30");
  });

  it("Unix msを実行環境に依存せずJST日時へ変換できる", () => {
    expect(formatDateTimeJa(new Date("2026-05-31T03:00:00.000Z").getTime())).toBe("2026/5/31 12:00");
  });

  it("Unix msを時刻なしのJST日付に変換できる", () => {
    expect(formatDateJa(new Date("2026-08-31T15:00:00.000Z").getTime())).toBe("2026年9月1日");
  });

  it("締切日は翌日0時JSTをcutoffにする", () => {
    expect(getDeadlineCutoff("2026-06-01")).toBe(Date.UTC(2026, 5, 1, 15));
  });

  it("締切日は23:59 JSTまで有効で、翌日0:00 JSTから締切後になる", () => {
    const cutoff = getDeadlineCutoff("2026-06-01");

    expect(new Date("2026-06-01T14:59:59.999Z").getTime()).toBeLessThan(cutoff);
    expect(new Date("2026-06-01T15:00:00.000Z").getTime()).toBe(cutoff);
  });

  it("提出リンクはシフト開始日0時JSTをcutoffにする", () => {
    expect(getSubmitLinkCutoff("2026-06-08")).toBe(Date.UTC(2026, 5, 7, 15));
  });

  it("提出リンクはシフト開始日前日の23:59 JSTまで有効で、開始日0:00 JSTから閉じる", () => {
    const cutoff = getSubmitLinkCutoff("2026-06-08");

    expect(new Date("2026-06-07T14:59:59.999Z").getTime()).toBeLessThan(cutoff);
    expect(new Date("2026-06-07T15:00:00.000Z").getTime()).toBe(cutoff);
  });

  it("提出締切ラベルは23:59を明示する", () => {
    expect(formatDeadlineLabel("2026-06-07")).toBe("6/7(日) 23:59");
  });

  it("催促通知は提出締切日の前日17:00 JSTに予約する", () => {
    expect(getReminderScheduledAt("2026-01-05")).toBe(new Date("2026-01-04T08:00:00.000Z").getTime());
  });

  it("シフト確定催促は提出締切日の翌日17:00 JSTに予約する", () => {
    // 2026-01-05 締切 → 翌日 2026-01-06 17:00 JST = 2026-01-06 08:00 UTC
    expect(getManagerConfirmationReminderAt("2026-01-05")).toBe(new Date("2026-01-06T08:00:00.000Z").getTime());
  });

  it("店舗登録リマインドは登録日の7日後17:00 JSTに予約する", () => {
    const registeredAt = new Date("2026-07-05T23:30:00+09:00").getTime();

    expect(getShopActivationReminderAt(registeredAt)).toBe(new Date("2026-07-12T17:00:00+09:00").getTime());
  });

  it("店舗登録リマインドはUTC日付ではなくJST日付を基準にする", () => {
    const registeredAt = new Date("2026-07-05T23:30:00.000Z").getTime();

    expect(getShopActivationReminderAt(registeredAt)).toBe(new Date("2026-07-13T17:00:00+09:00").getTime());
  });

  it("todayJSTはUTC日付ではなくJST日付を返す", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-06-01T15:30:00.000Z"));

      expect(todayJST()).toBe("2026-06-02");
    } finally {
      vi.useRealTimers();
    }
  });

  it("シフト期間の終了日を過ぎたら過去シフトとして扱う", () => {
    expect(isPastShiftPeriod("2026-06-03", "2026-06-03")).toBe(false);
    expect(isPastShiftPeriod("2026-06-03", "2026-06-04")).toBe(true);
  });
});
