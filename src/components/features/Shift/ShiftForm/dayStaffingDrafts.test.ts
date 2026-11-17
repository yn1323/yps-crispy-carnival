import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import {
  BULK_RESET_VALUE,
  buildBulkApplyRows,
  buildCountTableRows,
  buildDayRequirementsDraft,
  DATE_ONLY_ROW_ID,
  describeCustomRequirements,
  findDayRequirementsError,
  formatDayRequirementsTitle,
  selectBulkApplyDates,
  setDraftCount,
  toBulkTemplateId,
  toDayRequirements,
} from "./dayStaffingDrafts";
import type { ShiftFormStaffingDay } from "./types";

const timePattern: ShiftSubmissionPattern = { kind: "time", startTime: "09:00", endTime: "22:00" };
const shiftTypePattern: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00", sortOrder: 1 },
  ],
};
const dateOnlyPattern: ShiftSubmissionPattern = { kind: "dateOnly" };
const positionIds = ["hall", "kitchen"];

describe("buildDayRequirementsDraft", () => {
  it("時間指定は、いまのバーの重なった本数を、時間ごとの人数の区間にして初期値にする", () => {
    const draft = buildDayRequirementsDraft(
      {
        kind: "time",
        bars: [
          { positionId: "hall", startTime: "09:00", endTime: "14:00" },
          { positionId: "hall", startTime: "11:00", endTime: "14:00" },
          { positionId: "kitchen", startTime: "11:00", endTime: "22:00" },
        ],
      },
      timePattern,
    );

    expect(draft).toEqual({
      kind: "time",
      segments: [
        { positionId: "hall", startTime: "09:00", endTime: "11:00", count: 1 },
        { positionId: "hall", startTime: "11:00", endTime: "14:00", count: 2 },
        { positionId: "kitchen", startTime: "11:00", endTime: "22:00", count: 1 },
      ],
    });
  });

  it("パターン選択は、勤務パターンごとの人数を表の形にする", () => {
    const draft = buildDayRequirementsDraft(
      {
        kind: "shiftType",
        options: [
          {
            optionId: "early",
            counts: [
              { positionId: "hall", count: 2 },
              { positionId: "kitchen", count: 1 },
            ],
          },
        ],
      },
      shiftTypePattern,
    );

    expect(draft).toEqual({ kind: "counts", counts: { early: { hall: 2, kitchen: 1 } } });
  });

  it("日付選択は、1日の人数を1行の表にする", () => {
    const draft = buildDayRequirementsDraft(
      { kind: "dateOnly", counts: [{ positionId: "hall", count: 3 }] },
      dateOnlyPattern,
    );

    expect(draft).toEqual({ kind: "counts", counts: { [DATE_ONLY_ROW_ID]: { hall: 3 } } });
  });

  it("未設定の日は、集め方に合わせた空の状態から始める", () => {
    expect(buildDayRequirementsDraft(null, timePattern)).toEqual({ kind: "time", segments: [] });
    expect(buildDayRequirementsDraft(null, shiftTypePattern)).toEqual({ kind: "counts", counts: {} });
    expect(buildDayRequirementsDraft(null, dateOnlyPattern)).toEqual({
      kind: "counts",
      counts: { [DATE_ONLY_ROW_ID]: {} },
    });
  });
});

describe("buildCountTableRows", () => {
  it("パターン選択は、勤務パターンの名前と時間を行にする", () => {
    expect(buildCountTableRows(shiftTypePattern)).toEqual([
      { id: "early", label: "早番", detail: "09:00〜15:00" },
      { id: "late", label: "遅番", detail: "15:00〜21:00" },
    ]);
  });

  it("日付選択は1日の1行にし、時間指定は行を持たない", () => {
    expect(buildCountTableRows(dateOnlyPattern)).toEqual([{ id: DATE_ONLY_ROW_ID, label: "1日" }]);
    expect(buildCountTableRows(timePattern)).toEqual([]);
  });
});

describe("setDraftCount", () => {
  it("選んだマスだけを変え、ほかのマスと元の入力は変えない", () => {
    const draft = { kind: "counts" as const, counts: { early: { hall: 2, kitchen: 1 } } };
    const next = setDraftCount(draft, "late", "hall", 3);

    expect(next).toEqual({ kind: "counts", counts: { early: { hall: 2, kitchen: 1 }, late: { hall: 3 } } });
    expect(setDraftCount(next, "early", "hall", 0)).toEqual({
      kind: "counts",
      counts: { early: { hall: 0, kitchen: 1 }, late: { hall: 3 } },
    });
    expect(draft.counts).toEqual({ early: { hall: 2, kitchen: 1 } });
  });
});

describe("toDayRequirements", () => {
  it("時間指定は、人数の分だけバーを重ね、同じ人数以上が続く時間を1本のバーにして送る", () => {
    const requirements = toDayRequirements(
      {
        kind: "time",
        segments: [
          { positionId: "hall", startTime: "09:00", endTime: "11:00", count: 1 },
          { positionId: "hall", startTime: "11:00", endTime: "14:00", count: 2 },
        ],
      },
      timePattern,
      positionIds,
    );

    expect(requirements).toEqual({
      kind: "time",
      bars: [
        { positionId: "hall", startTime: "09:00", endTime: "14:00" },
        { positionId: "hall", startTime: "11:00", endTime: "14:00" },
      ],
    });
  });

  it("読み込んだ必要人数をそのまま保存する形へ戻すと、時間ごとの人数が変わらない", () => {
    const saved = {
      kind: "time" as const,
      bars: [
        { positionId: "hall", startTime: "11:00", endTime: "22:00" },
        { positionId: "hall", startTime: "09:00", endTime: "14:00" },
      ],
    };
    const requirements = toDayRequirements(buildDayRequirementsDraft(saved, timePattern), timePattern, positionIds);

    // バーの置き方は変わるが、09:00〜11:00 が1人、11:00〜14:00 が2人、14:00〜22:00 が1人のままである。
    expect(buildDayRequirementsDraft(requirements, timePattern)).toEqual(buildDayRequirementsDraft(saved, timePattern));
  });

  it("パターン選択は、0人のマスと、人数のない勤務パターンを送らず、設定の順に並べる", () => {
    const requirements = toDayRequirements(
      { kind: "counts", counts: { late: { kitchen: 1, hall: 2 }, early: { hall: 0 } } },
      shiftTypePattern,
      positionIds,
    );

    expect(requirements).toEqual({
      kind: "shiftType",
      options: [
        {
          optionId: "late",
          counts: [
            { positionId: "hall", count: 2 },
            { positionId: "kitchen", count: 1 },
          ],
        },
      ],
    });
  });

  it("日付選択は、0人のポジションを送らない", () => {
    expect(
      toDayRequirements(
        { kind: "counts", counts: { [DATE_ONLY_ROW_ID]: { hall: 0, kitchen: 2 } } },
        dateOnlyPattern,
        positionIds,
      ),
    ).toEqual({ kind: "dateOnly", counts: [{ positionId: "kitchen", count: 2 }] });
  });

  it("すべて0人の場合は、空の必要人数にする", () => {
    expect(toDayRequirements({ kind: "counts", counts: {} }, dateOnlyPattern, positionIds)).toEqual({
      kind: "dateOnly",
      counts: [],
    });
    expect(toDayRequirements({ kind: "counts", counts: {} }, shiftTypePattern, positionIds)).toEqual({
      kind: "shiftType",
      options: [],
    });
  });
});

describe("findDayRequirementsError", () => {
  it("保存できる必要人数にはnullを返す", () => {
    expect(
      findDayRequirementsError(
        { kind: "time", bars: [{ positionId: "hall", startTime: "09:00", endTime: "22:00" }] },
        timePattern,
      ),
    ).toBeNull();
    expect(findDayRequirementsError({ kind: "time", bars: [] }, timePattern)).toBeNull();
  });

  it("受付時間の外に出た人数は、サーバーと同じ文で止める", () => {
    expect(
      findDayRequirementsError(
        { kind: "time", bars: [{ positionId: "hall", startTime: "08:00", endTime: "12:00" }] },
        timePattern,
      ),
    ).toBe("受付時間の外に人数が入っています");
  });

  it("上限を超える人数は、サーバーと同じ文で止める", () => {
    expect(
      findDayRequirementsError({ kind: "dateOnly", counts: [{ positionId: "hall", count: 100 }] }, dateOnlyPattern),
    ).toBe("必要人数が正しくありません");
  });
});

describe("formatDayRequirementsTitle / describeCustomRequirements", () => {
  it("タイトルは「月日（曜日）の必要人数」にする", () => {
    // 2026-11-23は月曜日、2026-06-03は水曜日。
    expect(formatDayRequirementsTitle("2026-11-23")).toBe("11月23日（月）の必要人数");
    expect(formatDayRequirementsTitle("2026-06-03")).toBe("6月3日（水）の必要人数");
  });

  it("テンプレートが当たっている日は、そのテンプレートが変わらないことを名前で伝える", () => {
    expect(describeCustomRequirements("通常")).toBe("この日だけの変更です。テンプレート「通常」は変わりません。");
  });

  it("テンプレートの名前が分からない日は、名前を出さずに伝える", () => {
    expect(describeCustomRequirements(null)).toBe("この日だけの変更です。テンプレートは変わりません。");
  });
});

describe("buildBulkApplyRows / selectBulkApplyDates", () => {
  // 2026-06-05(金)、06(土)、07(日)、08(月)。06(土)は定休日。
  const dates = ["2026-06-05", "2026-06-06", "2026-06-07", "2026-06-08"];
  const day = (date: string, overrides: Partial<ShiftFormStaffingDay>): ShiftFormStaffingDay => ({
    date,
    source: "weekday",
    templateId: "weekday",
    templateName: "通常",
    requirements: { kind: "dateOnly", counts: [{ positionId: "hall", count: 1 }] },
    ...overrides,
  });
  const rows = buildBulkApplyRows({
    dates,
    holidays: ["2026-06-06"],
    days: [
      day("2026-06-05", {}),
      day("2026-06-07", { source: "dateCustom", templateId: null, templateName: null }),
      day("2026-06-08", { source: "none", templateId: null, templateName: null, requirements: null }),
    ],
  });

  it("募集期間の日ごとに、いまのテンプレート、定休日、土日を返す", () => {
    expect(rows).toEqual([
      { date: "2026-06-05", templateLabel: "通常", isClosed: false, isWeekend: false },
      { date: "2026-06-06", templateLabel: "未設定", isClosed: true, isWeekend: true },
      { date: "2026-06-07", templateLabel: "この日だけ変更", isClosed: false, isWeekend: true },
      { date: "2026-06-08", templateLabel: "未設定", isClosed: false, isWeekend: false },
    ]);
  });

  it("まとめて選ぶボタンは、定休日を選ばない", () => {
    expect(selectBulkApplyDates(rows, "weekend")).toEqual(["2026-06-07"]);
    expect(selectBulkApplyDates(rows, "weekday")).toEqual(["2026-06-05", "2026-06-08"]);
    expect(selectBulkApplyDates(rows, "all")).toEqual(["2026-06-05", "2026-06-07", "2026-06-08"]);
  });

  it("テンプレートの選択は、テンプレートのIDをそのまま返し、「曜日の設定に戻す」をnullにする", () => {
    expect(toBulkTemplateId("template-1")).toBe("template-1");
    expect(toBulkTemplateId(BULK_RESET_VALUE)).toBeNull();
  });
});
