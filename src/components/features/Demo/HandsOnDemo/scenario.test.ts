import { describe, expect, it } from "vitest";
import {
  BREAK_STAFF_ID,
  BREAK_TIME,
  buildHandsOnScenario,
  buildStaffSubmissionData,
  getHandsOnPeriodStart,
  SATO_REQUEST_TIME,
  SATO_STAFF_ID,
} from "./scenario";

describe("体験デモの募集の期間", () => {
  it.each([
    ["月の途中に開くと、翌月の1日から始める", "2026-11-28", "2026-12-01"],
    ["月の初日に開いても、翌月の1日から始める", "2026-11-01", "2026-12-01"],
    ["月の最後の日に開くと、翌日の1日から始める", "2026-11-30", "2026-12-01"],
    ["12月に開くと、翌年の1月1日から始める", "2026-12-31", "2027-01-01"],
  ])("%s", (_name, today, expected) => {
    expect(getHandsOnPeriodStart(today)).toBe(expected);
  });

  it("2週間の日付と、ボタン、お知らせ、提出期限の表示を作る", () => {
    const scenario = buildHandsOnScenario("2026-12-01");

    expect(scenario.dates).toHaveLength(14);
    expect(scenario.dates[0]).toBe("2026-12-01");
    expect(scenario.dates[13]).toBe("2026-12-14");
    expect(scenario.startLabel).toBe("12/1〜12/14の募集を開始");
    expect(scenario.periodLabel).toBe("12/1(火)〜12/14(月)");
    expect(scenario.deadline).toBe("2026-11-30");
  });
});

describe("体験デモのスタッフと希望", () => {
  const scenario = buildHandsOnScenario("2026-12-01");

  it("佐藤さんは、提出画面で出す3日だけに17時から22時の希望を持つ", () => {
    const satoRequests = scenario.requests
      .filter((shift) => shift.staffId === SATO_STAFF_ID)
      .map((shift) => ({ date: shift.date, requestedTime: shift.requestedTime }))
      .sort((a, b) => a.date.localeCompare(b.date));

    expect(satoRequests).toEqual([
      { date: "2026-12-01", requestedTime: SATO_REQUEST_TIME },
      { date: "2026-12-03", requestedTime: SATO_REQUEST_TIME },
      { date: "2026-12-05", requestedTime: SATO_REQUEST_TIME },
    ]);
  });

  it("シンプル表示の始まりは、佐藤さんの初日だけ勤務を空け、ほかの希望には同じ時間の勤務を入れる", () => {
    const satoFirstDay = scenario.simpleInitialShifts.find(
      (shift) => shift.staffId === SATO_STAFF_ID && shift.date === "2026-12-01",
    );
    expect(satoFirstDay).toBeDefined();
    expect(satoFirstDay?.requestedTime).toEqual(SATO_REQUEST_TIME);
    expect(satoFirstDay?.positions).toEqual([]);

    const others = scenario.simpleInitialShifts.filter((shift) => shift !== satoFirstDay);
    expect(others).toHaveLength(scenario.requests.length - 1);
    for (const shift of others) {
      expect(shift.positions.map((segment) => ({ start: segment.start, end: segment.end }))).toEqual([
        shift.requestedTime,
      ]);
    }
  });

  it("くわしく表示の必要人数は、平日と土日でテンプレートを分ける", () => {
    const templateNames = scenario.staffing.days.map((day) => [day.date, day.templateName]);

    expect(templateNames.slice(0, 7)).toEqual([
      ["2026-12-01", "平日"],
      ["2026-12-02", "平日"],
      ["2026-12-03", "平日"],
      ["2026-12-04", "平日"],
      ["2026-12-05", "土日"],
      ["2026-12-06", "土日"],
      ["2026-12-07", "平日"],
    ]);
  });

  it("佐藤さんの提出画面は、まだ何も出していない状態で、期間と提出期限を募集にそろえる", () => {
    const data = buildStaffSubmissionData(scenario);

    expect({
      staffName: data.staffName,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      deadline: data.deadline,
      hasSubmitted: data.hasSubmitted,
      existingRequests: data.existingRequests,
      legalConsentRequired: data.legalConsentRequired,
    }).toEqual({
      staffName: "佐藤 大輔",
      periodStart: "2026-12-01",
      periodEnd: "2026-12-14",
      deadline: "2026-11-30",
      hasSubmitted: false,
      existingRequests: [],
      legalConsentRequired: false,
    });
  });
});

describe("休憩を入れる渡辺さんの初日", () => {
  it.each([
    ["平日", "2026-12-01"],
    ["土曜", "2027-05-01"],
    ["日曜", "2027-08-01"],
  ])("初日が%sでも、休憩の時間を含む勤務の希望を持つ", (_name, periodStart) => {
    const firstDay = buildHandsOnScenario(periodStart).requests.filter(
      (shift) => shift.staffId === BREAK_STAFF_ID && shift.date === periodStart,
    );

    expect(firstDay).toHaveLength(1);
    const requested = firstDay[0].requestedTime;
    expect(requested).not.toBeNull();
    expect(requested && requested.start <= BREAK_TIME.start && BREAK_TIME.end <= requested.end).toBe(true);
  });
});
