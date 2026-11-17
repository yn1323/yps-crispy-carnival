import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import {
  SHIFT_DAY_TEMPLATE_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_LIMIT,
  SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH,
  SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX,
} from "../constants";
import {
  buildEmptyDayRequirements,
  clipStaffingBarsToRange,
  countMaxConcurrentStaffingBars,
  countStaffingBarsOutsideRange,
  type DayRequirements,
  type DayStaffingOverride,
  type DayTemplate,
  type DayTemplateIssue,
  filterDayRequirementsByPositions,
  findDayRequirementsIssue,
  findDayTemplateIssue,
  normalizeDayRequirements,
  projectDayRequirementsForPattern,
  resolveDayStaffing,
  type ShiftSetupWeekday,
  type StaffingBar,
} from "./dayTemplates";

const TIME_PATTERN: ShiftSubmissionPattern = { kind: "time", startTime: "09:00", endTime: "22:00" };
const SHIFT_TYPE_PATTERN: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "17:00", endTime: "22:00", sortOrder: 1 },
  ],
};
const DATE_ONLY_PATTERN: ShiftSubmissionPattern = { kind: "dateOnly" };

const bar = (positionId: string, startTime: string, endTime: string): StaffingBar => ({
  positionId,
  startTime,
  endTime,
});
const timeRequirements = (bars: StaffingBar[]): DayRequirements => ({ kind: "time", bars });

type TemplateInput = {
  name: string;
  weekdays: ShiftSetupWeekday[];
  appliesToHolidays: boolean;
  requirements: DayRequirements;
};

const template = (override: Partial<TemplateInput> = {}): TemplateInput => ({
  name: "平日",
  weekdays: [],
  appliesToHolidays: false,
  requirements: timeRequirements([]),
  ...override,
});

describe("buildEmptyDayRequirements", () => {
  it("集め方の種類ごとに、何も入れていない必要人数を作る", () => {
    expect(buildEmptyDayRequirements("time")).toEqual({ kind: "time", bars: [] });
    expect(buildEmptyDayRequirements("shiftType")).toEqual({ kind: "shiftType", options: [] });
    expect(buildEmptyDayRequirements("dateOnly")).toEqual({ kind: "dateOnly", counts: [] });
  });
});

describe("countMaxConcurrentStaffingBars", () => {
  it("同じ時刻に重なるバーの最大の本数を返す", () => {
    expect(
      countMaxConcurrentStaffingBars([
        bar("hall", "09:00", "14:00"),
        bar("hall", "11:00", "13:00"),
        bar("hall", "12:00", "17:00"),
        bar("hall", "17:00", "22:00"),
      ]),
    ).toBe(3);
  });

  it("終了と開始が同じ時刻のバーは、重なりに数えない", () => {
    expect(countMaxConcurrentStaffingBars([bar("hall", "10:00", "14:00"), bar("hall", "14:00", "18:00")])).toBe(1);
  });

  it("バーがなければ0を返す", () => {
    expect(countMaxConcurrentStaffingBars([])).toBe(0);
  });
});

describe("clipStaffingBarsToRange", () => {
  const range = { startTime: "10:00", endTime: "20:00" };

  it("範囲をまたぐバーは内側だけを残し、完全に外のバーと端に接するだけのバーを落とす", () => {
    const bars = [
      bar("hall", "09:00", "12:00"),
      bar("hall", "18:00", "22:00"),
      bar("hall", "09:00", "22:00"),
      bar("hall", "08:00", "10:00"),
      bar("hall", "20:00", "21:00"),
      bar("hall", "12:00", "14:00"),
    ];

    expect(clipStaffingBarsToRange(bars, range)).toEqual([
      bar("hall", "10:00", "12:00"),
      bar("hall", "10:00", "20:00"),
      bar("hall", "12:00", "14:00"),
      bar("hall", "18:00", "20:00"),
    ]);
    expect(countStaffingBarsOutsideRange(bars, range)).toBe(5);
  });

  it("範囲の端が30分刻みにそろっていない場合は、刻みに乗る内側の時刻へ切る", () => {
    expect(
      clipStaffingBarsToRange([bar("hall", "09:00", "11:00"), bar("hall", "19:00", "22:00")], {
        startTime: "09:45",
        endTime: "20:45",
      }),
    ).toEqual([bar("hall", "10:00", "11:00"), bar("hall", "19:00", "20:30")]);
  });

  it("隣り合うバーと同じ時間のバーを結合せず、開始、終了、ポジションの順に並べる", () => {
    expect(
      clipStaffingBarsToRange(
        [
          bar("kitchen", "14:00", "18:00"),
          bar("hall", "14:00", "18:00"),
          bar("hall", "10:00", "14:00"),
          bar("hall", "14:00", "18:00"),
          bar("hall", "10:00", "12:00"),
        ],
        range,
      ),
    ).toEqual([
      bar("hall", "10:00", "12:00"),
      bar("hall", "10:00", "14:00"),
      bar("hall", "14:00", "18:00"),
      bar("hall", "14:00", "18:00"),
      bar("kitchen", "14:00", "18:00"),
    ]);
  });
});

describe("findDayRequirementsIssue", () => {
  it.each<{ name: string; requirements: DayRequirements; pattern: ShiftSubmissionPattern }>([
    {
      name: "時間指定: 受付時間いっぱいのバー、隣り合うバー、同時に上限まで重なるバー",
      pattern: TIME_PATTERN,
      requirements: timeRequirements([
        bar("hall", "09:00", "22:00"),
        bar("hall", "09:00", "09:30"),
        bar("hall", "09:30", "10:00"),
        ...Array.from({ length: SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT }, () => bar("kitchen", "11:00", "14:00")),
        ...Array.from({ length: SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT }, () => bar("kitchen", "14:00", "17:00")),
      ]),
    },
    {
      name: "時間指定: バーの本数が上限ちょうど",
      pattern: TIME_PATTERN,
      requirements: timeRequirements(
        Array.from({ length: SHIFT_DAY_TEMPLATE_BAR_LIMIT }, (_, index) => {
          const start = 9 + (index % 13);
          return bar(`position-${index % 20}`, `${start}:00`, `${start + 1}:00`);
        }),
      ),
    },
    { name: "時間指定: バーなし", pattern: TIME_PATTERN, requirements: timeRequirements([]) },
    {
      name: "パターン選択: 店舗の勤務パターンごとの人数（0と上限を含む）",
      pattern: SHIFT_TYPE_PATTERN,
      requirements: {
        kind: "shiftType",
        options: [
          { optionId: "late", counts: [{ positionId: "hall", count: SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX }] },
          {
            optionId: "early",
            counts: [
              { positionId: "hall", count: 0 },
              { positionId: "kitchen", count: 2 },
            ],
          },
        ],
      },
    },
    {
      name: "日付選択: ポジションごとの人数",
      pattern: DATE_ONLY_PATTERN,
      requirements: {
        kind: "dateOnly",
        counts: [
          { positionId: "hall", count: 3 },
          { positionId: "kitchen", count: 1 },
        ],
      },
    },
  ])("違反がなければnullを返す: $name", ({ requirements, pattern }) => {
    expect(findDayRequirementsIssue(requirements, pattern)).toBeNull();
  });

  it.each<{ name: string; requirements: DayRequirements; pattern: ShiftSubmissionPattern; issue: DayTemplateIssue }>([
    {
      name: "時間指定の店舗へ、日付選択の人数を渡す",
      pattern: TIME_PATTERN,
      requirements: { kind: "dateOnly", counts: [] },
      issue: "REQUIREMENTS_KIND_MISMATCH",
    },
    {
      name: "パターン選択の店舗へ、バーを渡す",
      pattern: SHIFT_TYPE_PATTERN,
      requirements: timeRequirements([]),
      issue: "REQUIREMENTS_KIND_MISMATCH",
    },
    {
      name: "日付選択の店舗へ、勤務パターンごとの人数を渡す",
      pattern: DATE_ONLY_PATTERN,
      requirements: { kind: "shiftType", options: [] },
      issue: "REQUIREMENTS_KIND_MISMATCH",
    },
    {
      name: "バーの本数が上限を1本超える",
      pattern: TIME_PATTERN,
      requirements: timeRequirements(
        Array.from({ length: SHIFT_DAY_TEMPLATE_BAR_LIMIT + 1 }, (_, index) =>
          bar(`position-${index}`, "09:00", "10:00"),
        ),
      ),
      issue: "BAR_LIMIT",
    },
    {
      name: "時刻の書式が正しくない",
      pattern: TIME_PATTERN,
      requirements: timeRequirements([bar("hall", "9時", "12:00")]),
      issue: "BAR_TIME_INVALID",
    },
    {
      name: "終了の書式が正しくない",
      pattern: TIME_PATTERN,
      requirements: timeRequirements([bar("hall", "09:00", "12:60")]),
      issue: "BAR_TIME_INVALID",
    },
    {
      name: "開始と終了が同じ",
      pattern: TIME_PATTERN,
      requirements: timeRequirements([bar("hall", "12:00", "12:00")]),
      issue: "BAR_TIME_ORDER",
    },
    {
      name: "終了が開始より前",
      pattern: TIME_PATTERN,
      requirements: timeRequirements([bar("hall", "14:00", "12:00")]),
      issue: "BAR_TIME_ORDER",
    },
    {
      name: "開始が30分刻みでない",
      pattern: TIME_PATTERN,
      requirements: timeRequirements([bar("hall", "09:15", "12:00")]),
      issue: "BAR_TIME_UNIT",
    },
    {
      name: "終了が30分刻みでない",
      pattern: TIME_PATTERN,
      requirements: timeRequirements([bar("hall", "09:00", "09:15")]),
      issue: "BAR_TIME_UNIT",
    },
    {
      name: "受付時間より前に始まる",
      pattern: TIME_PATTERN,
      requirements: timeRequirements([bar("hall", "08:30", "12:00")]),
      issue: "BAR_OUT_OF_RANGE",
    },
    {
      name: "受付時間より後に終わる",
      pattern: TIME_PATTERN,
      requirements: timeRequirements([bar("hall", "20:00", "22:30")]),
      issue: "BAR_OUT_OF_RANGE",
    },
    {
      name: "同時に重なるバーが、1つのポジションで上限を1本超える",
      pattern: TIME_PATTERN,
      requirements: timeRequirements([
        ...Array.from({ length: SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT }, () => bar("hall", "11:00", "14:00")),
        bar("hall", "13:30", "17:00"),
        bar("kitchen", "11:00", "14:00"),
      ]),
      issue: "BAR_CONCURRENT_LIMIT",
    },
    {
      name: "店舗の勤務パターンにないものを指す",
      pattern: SHIFT_TYPE_PATTERN,
      requirements: { kind: "shiftType", options: [{ optionId: "night", counts: [] }] },
      issue: "OPTION_NOT_FOUND",
    },
    {
      name: "同じ勤務パターンを2回渡す",
      pattern: SHIFT_TYPE_PATTERN,
      requirements: {
        kind: "shiftType",
        options: [
          { optionId: "early", counts: [] },
          { optionId: "early", counts: [] },
        ],
      },
      issue: "OPTION_DUPLICATED",
    },
    {
      name: "パターン選択で、同じポジションの人数を2回渡す",
      pattern: SHIFT_TYPE_PATTERN,
      requirements: {
        kind: "shiftType",
        options: [
          {
            optionId: "early",
            counts: [
              { positionId: "hall", count: 1 },
              { positionId: "hall", count: 2 },
            ],
          },
        ],
      },
      issue: "COUNT_DUPLICATED",
    },
    {
      name: "日付選択で、同じポジションの人数を2回渡す",
      pattern: DATE_ONLY_PATTERN,
      requirements: {
        kind: "dateOnly",
        counts: [
          { positionId: "hall", count: 1 },
          { positionId: "hall", count: 1 },
        ],
      },
      issue: "COUNT_DUPLICATED",
    },
    {
      name: "人数が負の数",
      pattern: DATE_ONLY_PATTERN,
      requirements: { kind: "dateOnly", counts: [{ positionId: "hall", count: -1 }] },
      issue: "COUNT_INVALID",
    },
    {
      name: "人数が小数",
      pattern: DATE_ONLY_PATTERN,
      requirements: { kind: "dateOnly", counts: [{ positionId: "hall", count: 1.5 }] },
      issue: "COUNT_INVALID",
    },
    {
      name: "人数が上限を1超える",
      pattern: SHIFT_TYPE_PATTERN,
      requirements: {
        kind: "shiftType",
        options: [
          { optionId: "late", counts: [{ positionId: "hall", count: SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX + 1 }] },
        ],
      },
      issue: "COUNT_INVALID",
    },
  ])("違反を返す: $name", ({ requirements, pattern, issue }) => {
    expect(findDayRequirementsIssue(requirements, pattern)).toBe(issue);
  });

  it("同時の重なりは、ポジションごとに数える", () => {
    const requirements = timeRequirements([
      ...Array.from({ length: SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT }, () => bar("hall", "11:00", "14:00")),
      ...Array.from({ length: SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT }, () => bar("kitchen", "11:00", "14:00")),
    ]);

    expect(findDayRequirementsIssue(requirements, TIME_PATTERN)).toBeNull();
  });
});

describe("findDayTemplateIssue", () => {
  it("名前、曜日、祝日、必要人数がそろった一覧は、違反なしとする", () => {
    expect(
      findDayTemplateIssue({
        pattern: TIME_PATTERN,
        templates: [
          template({
            name: "平日",
            weekdays: ["mon", "tue", "wed", "thu", "fri"],
            requirements: timeRequirements([bar("hall", "09:00", "22:00")]),
          }),
          template({ name: "週末", weekdays: ["sat", "sun"] }),
          template({ name: "祝日", appliesToHolidays: true }),
          template({ name: "年末年始" }),
        ],
      }),
    ).toBeNull();
  });

  it("同じ曜日や祝日を、複数のテンプレートで選べる", () => {
    expect(
      findDayTemplateIssue({
        pattern: TIME_PATTERN,
        templates: [
          template({ name: "金曜", weekdays: ["fri"], appliesToHolidays: true }),
          template({ name: "金曜（繁忙期）", weekdays: ["fri"], appliesToHolidays: true }),
        ],
      }),
    ).toBeNull();
  });

  it("テンプレートの数は上限ちょうどまで受け付け、1件でも超えると違反にする", () => {
    const templates = Array.from({ length: SHIFT_DAY_TEMPLATE_LIMIT + 1 }, (_, index) =>
      template({ name: `テンプレート${index}` }),
    );

    expect(
      findDayTemplateIssue({ pattern: TIME_PATTERN, templates: templates.slice(0, SHIFT_DAY_TEMPLATE_LIMIT) }),
    ).toBeNull();
    expect(findDayTemplateIssue({ pattern: TIME_PATTERN, templates })).toBe("TEMPLATE_LIMIT");
  });

  it("名前は前後の空白を除いた長さで数え、上限ちょうどまで受け付ける", () => {
    const longest = "あ".repeat(SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH);

    expect(findDayTemplateIssue({ pattern: TIME_PATTERN, templates: [template({ name: ` ${longest} ` })] })).toBeNull();
    expect(findDayTemplateIssue({ pattern: TIME_PATTERN, templates: [template({ name: `${longest}あ` })] })).toBe(
      "NAME_TOO_LONG",
    );
  });

  it.each<{ name: string; templates: TemplateInput[]; issue: DayTemplateIssue }>([
    { name: "名前が空", templates: [template({ name: "" })], issue: "NAME_REQUIRED" },
    { name: "名前が空白だけ", templates: [template({ name: " 　" })], issue: "NAME_REQUIRED" },
    {
      name: "前後の空白を除くと同じ名前",
      templates: [template({ name: "平日" }), template({ name: " 平日 " })],
      issue: "NAME_DUPLICATED",
    },
    {
      name: "1つのテンプレートに同じ曜日を2回入れる",
      templates: [template({ weekdays: ["mon", "mon"] })],
      issue: "WEEKDAY_DUPLICATED",
    },
    {
      name: "必要人数の種類が店舗の集め方と違う",
      templates: [template({ requirements: { kind: "dateOnly", counts: [] } })],
      issue: "REQUIREMENTS_KIND_MISMATCH",
    },
    {
      name: "2つ目のテンプレートのバーが30分刻みでない",
      templates: [
        template({ name: "平日" }),
        template({ name: "週末", requirements: timeRequirements([bar("hall", "10:10", "12:00")]) }),
      ],
      issue: "BAR_TIME_UNIT",
    },
  ])("違反を返す: $name", ({ templates, issue }) => {
    expect(findDayTemplateIssue({ pattern: TIME_PATTERN, templates })).toBe(issue);
  });
});

describe("normalizeDayRequirements", () => {
  it("バーを開始、終了、ポジションの順に並べ、隣り合うバーと同じ時間のバーを結合しない", () => {
    expect(
      normalizeDayRequirements(
        timeRequirements([
          bar("kitchen", "14:00", "18:00"),
          bar("hall", "14:00", "18:00"),
          bar("hall", "10:00", "14:00"),
          bar("hall", "10:00", "14:00"),
          bar("hall", "10:00", "12:00"),
        ]),
        TIME_PATTERN,
      ),
    ).toEqual(
      timeRequirements([
        bar("hall", "10:00", "12:00"),
        bar("hall", "10:00", "14:00"),
        bar("hall", "10:00", "14:00"),
        bar("hall", "14:00", "18:00"),
        bar("kitchen", "14:00", "18:00"),
      ]),
    );
  });

  it("パターン選択は勤務パターンの設定順に並べ、人数0と、人数のない勤務パターンを残さない", () => {
    expect(
      normalizeDayRequirements(
        {
          kind: "shiftType",
          options: [
            {
              optionId: "late",
              counts: [
                { positionId: "hall", count: 0 },
                { positionId: "kitchen", count: 2 },
              ],
            },
            { optionId: "early", counts: [{ positionId: "hall", count: 0 }] },
          ],
        },
        SHIFT_TYPE_PATTERN,
      ),
    ).toEqual({ kind: "shiftType", options: [{ optionId: "late", counts: [{ positionId: "kitchen", count: 2 }] }] });

    expect(
      normalizeDayRequirements(
        {
          kind: "shiftType",
          options: [
            { optionId: "late", counts: [{ positionId: "hall", count: 1 }] },
            { optionId: "early", counts: [{ positionId: "hall", count: 3 }] },
          ],
        },
        SHIFT_TYPE_PATTERN,
      ),
    ).toEqual({
      kind: "shiftType",
      options: [
        { optionId: "early", counts: [{ positionId: "hall", count: 3 }] },
        { optionId: "late", counts: [{ positionId: "hall", count: 1 }] },
      ],
    });
  });

  it("日付選択は人数0を残さない", () => {
    expect(
      normalizeDayRequirements(
        {
          kind: "dateOnly",
          counts: [
            { positionId: "hall", count: 2 },
            { positionId: "kitchen", count: 0 },
          ],
        },
        DATE_ONLY_PATTERN,
      ),
    ).toEqual({ kind: "dateOnly", counts: [{ positionId: "hall", count: 2 }] });
  });
});

describe("filterDayRequirementsByPositions", () => {
  const positionIds = new Set(["hall"]);

  it("渡したポジションに含まれないバーと人数を除く", () => {
    expect(
      filterDayRequirementsByPositions(
        timeRequirements([bar("hall", "09:00", "12:00"), bar("deleted", "09:00", "12:00")]),
        positionIds,
      ),
    ).toEqual(timeRequirements([bar("hall", "09:00", "12:00")]));
    expect(
      filterDayRequirementsByPositions(
        {
          kind: "shiftType",
          options: [
            {
              optionId: "early",
              counts: [
                { positionId: "deleted", count: 1 },
                { positionId: "hall", count: 2 },
              ],
            },
          ],
        },
        positionIds,
      ),
    ).toEqual({ kind: "shiftType", options: [{ optionId: "early", counts: [{ positionId: "hall", count: 2 }] }] });
    expect(
      filterDayRequirementsByPositions(
        {
          kind: "dateOnly",
          counts: [
            { positionId: "hall", count: 2 },
            { positionId: "deleted", count: 1 },
          ],
        },
        positionIds,
      ),
    ).toEqual({ kind: "dateOnly", counts: [{ positionId: "hall", count: 2 }] });
  });
});

describe("projectDayRequirementsForPattern", () => {
  it("未設定は未設定のまま返す", () => {
    expect(projectDayRequirementsForPattern(null, TIME_PATTERN)).toBeNull();
  });

  it.each<{ name: string; requirements: DayRequirements; pattern: ShiftSubmissionPattern }>([
    { name: "バーを、パターン選択の募集へ", requirements: timeRequirements([]), pattern: SHIFT_TYPE_PATTERN },
    { name: "バーを、日付選択の募集へ", requirements: timeRequirements([]), pattern: DATE_ONLY_PATTERN },
    {
      name: "勤務パターンごとの人数を、時間指定の募集へ",
      requirements: { kind: "shiftType", options: [] },
      pattern: TIME_PATTERN,
    },
    { name: "1日の人数を、時間指定の募集へ", requirements: { kind: "dateOnly", counts: [] }, pattern: TIME_PATTERN },
  ])("種類が募集の集め方と違う場合は未設定にする: $name", ({ requirements, pattern }) => {
    expect(projectDayRequirementsForPattern(requirements, pattern)).toBeNull();
  });

  it("時間指定は、バーを募集の受付時間の内側へ切り、完全に外のバーを落とす", () => {
    expect(
      projectDayRequirementsForPattern(
        timeRequirements([
          bar("hall", "09:00", "22:00"),
          bar("hall", "09:00", "10:00"),
          bar("kitchen", "17:00", "21:00"),
          bar("hall", "11:00", "14:00"),
          bar("hall", "20:00", "22:00"),
        ]),
        { kind: "time", startTime: "10:00", endTime: "20:00" },
      ),
    ).toEqual(
      timeRequirements([
        bar("hall", "10:00", "20:00"),
        bar("hall", "11:00", "14:00"),
        bar("kitchen", "17:00", "20:00"),
      ]),
    );
  });

  it("時間指定で、すべてのバーが受付時間の外なら、バーのない必要人数にする", () => {
    expect(
      projectDayRequirementsForPattern(timeRequirements([bar("hall", "09:00", "10:00")]), {
        kind: "time",
        startTime: "10:00",
        endTime: "20:00",
      }),
    ).toEqual(timeRequirements([]));
  });

  it("パターン選択は、募集の勤務パターンにあるものだけを設定順で残す", () => {
    expect(
      projectDayRequirementsForPattern(
        {
          kind: "shiftType",
          options: [
            { optionId: "late", counts: [{ positionId: "hall", count: 1 }] },
            { optionId: "night", counts: [{ positionId: "hall", count: 4 }] },
            { optionId: "early", counts: [{ positionId: "hall", count: 2 }] },
          ],
        },
        SHIFT_TYPE_PATTERN,
      ),
    ).toEqual({
      kind: "shiftType",
      options: [
        { optionId: "early", counts: [{ positionId: "hall", count: 2 }] },
        { optionId: "late", counts: [{ positionId: "hall", count: 1 }] },
      ],
    });
  });

  it("日付選択は、そのまま返す", () => {
    const requirements: DayRequirements = { kind: "dateOnly", counts: [{ positionId: "hall", count: 2 }] };

    expect(projectDayRequirementsForPattern(requirements, DATE_ONLY_PATTERN)).toEqual(requirements);
  });
});

describe("resolveDayStaffing", () => {
  const weekdayRequirements = timeRequirements([bar("hall", "09:00", "17:00")]);
  const weekendRequirements = timeRequirements([bar("hall", "09:00", "22:00"), bar("hall", "11:00", "14:00")]);
  const holidayRequirements = timeRequirements([bar("hall", "10:00", "20:00")]);
  const yearEndRequirements = timeRequirements([bar("kitchen", "10:00", "15:00")]);
  const customRequirements = timeRequirements([bar("hall", "12:00", "13:00")]);

  const templates: DayTemplate[] = [
    {
      id: "weekday",
      name: "平日",
      weekdays: ["mon", "tue", "wed", "thu", "fri"],
      appliesToHolidays: false,
      requirements: weekdayRequirements,
    },
    {
      id: "weekend",
      name: "週末",
      weekdays: ["sat"],
      appliesToHolidays: false,
      requirements: weekendRequirements,
    },
    { id: "holiday", name: "祝日", weekdays: [], appliesToHolidays: true, requirements: holidayRequirements },
    { id: "yearEnd", name: "年末年始", weekdays: [], appliesToHolidays: false, requirements: yearEndRequirements },
  ];
  // 2026-01-12は月曜で祝日（成人の日）、2026-01-13は火曜、2026-01-17は土曜、2026-01-18は日曜。
  const holidayDates = new Set(["2026-01-12"]);
  const resolve = (date: string, overrides: DayStaffingOverride[] = [], usedTemplates = templates) =>
    resolveDayStaffing({ date, templates: usedTemplates, overrides, holidayDates });

  it("指定も祝日もない日は、曜日のテンプレートを当てる", () => {
    expect(resolve("2026-01-13")).toEqual({
      source: "weekday",
      templateId: "weekday",
      templateName: "平日",
      requirements: weekdayRequirements,
    });
    expect(resolve("2026-01-17")).toEqual({
      source: "weekday",
      templateId: "weekend",
      templateName: "週末",
      requirements: weekendRequirements,
    });
  });

  it("どのテンプレートにも割り当てていない曜日は、未設定にする", () => {
    expect(resolve("2026-01-18")).toEqual({ source: "none", templateId: null, templateName: null, requirements: null });
  });

  it("祝日は、曜日のテンプレートより祝日に使うテンプレートを優先する", () => {
    expect(resolve("2026-01-12")).toEqual({
      source: "holiday",
      templateId: "holiday",
      templateName: "祝日",
      requirements: holidayRequirements,
    });
  });

  it("祝日に使うテンプレートがなければ、祝日でも曜日のテンプレートを当てる", () => {
    const withoutHolidayTemplate = templates.filter((item) => !item.appliesToHolidays);

    expect(resolve("2026-01-12", [], withoutHolidayTemplate)).toEqual({
      source: "weekday",
      templateId: "weekday",
      templateName: "平日",
      requirements: weekdayRequirements,
    });
  });

  it("同じ曜日や祝日を選んだテンプレートが複数あれば、並びの先頭のテンプレートを当てる", () => {
    const busyRequirements = timeRequirements([bar("hall", "09:00", "15:00")]);
    const withBusyTemplate: DayTemplate[] = [
      ...templates,
      { id: "busy", name: "繁忙期", weekdays: ["tue"], appliesToHolidays: true, requirements: busyRequirements },
    ];

    expect(resolve("2026-01-12", [], withBusyTemplate)).toMatchObject({ source: "holiday", templateId: "holiday" });
    expect(resolve("2026-01-13", [], withBusyTemplate)).toMatchObject({ source: "weekday", templateId: "weekday" });
    expect(resolve("2026-01-12", [], withBusyTemplate.toReversed())).toMatchObject({
      source: "holiday",
      templateId: "busy",
    });
    expect(resolve("2026-01-13", [], withBusyTemplate.toReversed())).toMatchObject({
      source: "weekday",
      templateId: "busy",
    });
  });

  it("その日だけ当てたテンプレートは、祝日に使うテンプレートと曜日のテンプレートより優先する", () => {
    const overrides: DayStaffingOverride[] = [
      { date: "2026-01-12", kind: "template", templateId: "yearEnd" },
      { date: "2026-01-13", kind: "template", templateId: "weekend" },
    ];
    const expectedYearEnd = {
      source: "dateTemplate",
      templateId: "yearEnd",
      templateName: "年末年始",
      requirements: yearEndRequirements,
    };

    expect(resolve("2026-01-12", overrides)).toEqual(expectedYearEnd);
    expect(resolve("2026-01-13", overrides)).toEqual({
      source: "dateTemplate",
      templateId: "weekend",
      templateName: "週末",
      requirements: weekendRequirements,
    });
    // ほかの日の指定は、その日に影響しない。
    expect(resolve("2026-01-17", overrides)).toMatchObject({ source: "weekday", templateId: "weekend" });
  });

  it("その日だけの必要人数は、祝日に使うテンプレートと曜日のテンプレートより優先し、テンプレートを持たない", () => {
    const overrides: DayStaffingOverride[] = [{ date: "2026-01-12", kind: "custom", requirements: customRequirements }];

    expect(resolve("2026-01-12", overrides)).toEqual({
      source: "dateCustom",
      templateId: null,
      templateName: null,
      requirements: customRequirements,
    });
  });

  it("削除済みのテンプレートを指す指定は無視し、祝日なら祝日に使うテンプレート、そうでなければ曜日のテンプレートへ落とす", () => {
    const overrides: DayStaffingOverride[] = [
      { date: "2026-01-12", kind: "template", templateId: "deleted" },
      { date: "2026-01-13", kind: "template", templateId: "deleted" },
      { date: "2026-01-18", kind: "template", templateId: "deleted" },
    ];

    expect(resolve("2026-01-12", overrides)).toMatchObject({ source: "holiday", templateId: "holiday" });
    expect(resolve("2026-01-13", overrides)).toMatchObject({ source: "weekday", templateId: "weekday" });
    expect(resolve("2026-01-18", overrides)).toEqual({
      source: "none",
      templateId: null,
      templateName: null,
      requirements: null,
    });
  });
});
