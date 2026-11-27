import { describe, expect, it } from "vitest";
import {
  buildHandsOnScenario,
  buildStaffSubmissionData,
  getHandsOnPeriodStart,
  SATO_REQUEST_TIME,
  SATO_STAFF_ID,
} from "./scenario";

describe("体験デモの募集の期間", () => {
  it.each([
    ["月曜に開くと、翌週の月曜から始める", "2026-11-23", "2026-11-30"],
    ["水曜に開くと、次の月曜から始める", "2026-11-25", "2026-11-30"],
    ["日曜に開くと、翌日の月曜から始める", "2026-11-29", "2026-11-30"],
    ["月をまたいでも、次の月曜から始める", "2026-12-30", "2027-01-04"],
  ])("%s", (_name, today, expected) => {
    expect(getHandsOnPeriodStart(today)).toBe(expected);
  });

  it("2週間の日付と、ボタン、お知らせ、提出期限の表示を作る", () => {
    const scenario = buildHandsOnScenario("2026-11-30");

    expect(scenario.dates).toHaveLength(14);
    expect(scenario.dates[0]).toBe("2026-11-30");
    expect(scenario.dates[13]).toBe("2026-12-13");
    expect(scenario.startLabel).toBe("11/30〜12/13の募集を開始");
    expect(scenario.periodLabel).toBe("11/30(月)〜12/13(日)");
    expect(scenario.deadline).toBe("2026-11-29");
  });
});

describe("体験デモのスタッフと希望", () => {
  const scenario = buildHandsOnScenario("2026-11-30");

  it("佐藤さんは、提出画面で出す3日だけに17時から22時の希望を持つ", () => {
    const satoRequests = scenario.requests
      .filter((shift) => shift.staffId === SATO_STAFF_ID)
      .map((shift) => ({ date: shift.date, requestedTime: shift.requestedTime }))
      .sort((a, b) => a.date.localeCompare(b.date));

    expect(satoRequests).toEqual([
      { date: "2026-11-30", requestedTime: SATO_REQUEST_TIME },
      { date: "2026-12-02", requestedTime: SATO_REQUEST_TIME },
      { date: "2026-12-04", requestedTime: SATO_REQUEST_TIME },
    ]);
  });

  it("シンプル表示の始まりは、佐藤さんの初日だけ勤務を空け、ほかの希望には同じ時間の勤務を入れる", () => {
    const satoFirstDay = scenario.simpleInitialShifts.find(
      (shift) => shift.staffId === SATO_STAFF_ID && shift.date === "2026-11-30",
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
      ["2026-11-30", "平日"],
      ["2026-12-01", "平日"],
      ["2026-12-02", "平日"],
      ["2026-12-03", "平日"],
      ["2026-12-04", "平日"],
      ["2026-12-05", "土日"],
      ["2026-12-06", "土日"],
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
      periodStart: "2026-11-30",
      periodEnd: "2026-12-13",
      deadline: "2026-11-29",
      hasSubmitted: false,
      existingRequests: [],
      legalConsentRequired: false,
    });
  });
});
