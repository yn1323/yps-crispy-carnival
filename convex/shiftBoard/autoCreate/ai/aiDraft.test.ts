import { describe, expect, it } from "vitest";
import { buildAutoAssignments } from "../buildAutoAssignments";
import type { AutoCreatedShift, AutoCreateInput, AutoCreateSkillLevel, AutoCreateStaff } from "../types";
import { classifyAiDraftApiError } from "./aiDraftFailure";
import { buildAiDraftData, buildAiDraftUserMessage, getAiDraftSystemPrompt } from "./aiDraftPrompt";
import type { AiDraftShift } from "./aiDraftSchema";
import { applyAiDraft } from "./applyAiDraft";
import { evaluateDraft } from "./draftMetrics";
import { buildTimeGrid, listRequirementRanges, listShortages, type TimeGrid } from "./timeGrid";

const DAY1 = "2026-08-17";
const DAY2 = "2026-08-18";

const staff = (id: string, skills: Record<string, AutoCreateSkillLevel> = {}): AutoCreateStaff => ({
  id,
  positionSkills: Object.entries(skills).map(([positionId, level]) => ({ positionId, level })),
});

const bars = (positionId: string, startTime: string, endTime: string, count = 1) =>
  Array.from({ length: count }, () => ({ positionId, startTime, endTime }));

const request = (staffId: string, date: string, startTime: string, endTime: string) => ({
  staffId,
  date,
  startTime,
  endTime,
});

const timeInput = (overrides: Partial<AutoCreateInput> = {}): AutoCreateInput => ({
  pattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  periodStart: DAY1,
  dates: [DAY1],
  staffs: [staff("staff_a"), staff("staff_b", { kitchen: "unavailable" })],
  positionIds: ["hall", "kitchen"],
  requestedSlots: [request("staff_a", DAY1, "09:00", "20:00"), request("staff_b", DAY1, "12:00", "18:00")],
  requestedDates: [],
  days: [{ date: DAY1, requirements: { kind: "time", bars: bars("hall", "10:00", "18:00") } }],
  history: null,
  includesBreaks: true,
  ...overrides,
});

const gridOf = (input: AutoCreateInput): TimeGrid => {
  const grid = buildTimeGrid(input);
  if (!grid) throw new Error("grid is required");
  return grid;
};

const change = (overrides: Partial<AiDraftShift> = {}): AiDraftShift => ({
  staff: 0,
  date: DAY1,
  segments: [{ from: "10:00", to: "16:00", position: 0 }],
  breaks: [],
  change: "終わりを16時にした",
  ...overrides,
});

const shift = (staffId: string, startTime: string, endTime: string, breaks: AutoCreatedShift["breaks"] = []) => ({
  staffId,
  date: DAY1,
  segments: [{ startTime, endTime, positionId: "hall" }],
  breaks,
});

describe("buildTimeGrid", () => {
  it("時間指定でない募集はnullを返す", () => {
    expect(buildTimeGrid(timeInput({ pattern: { kind: "dateOnly" } }))).toBeNull();
  });

  it("必要人数のある日だけを持ち、必要人数と足りない時間を続きでまとめる", () => {
    const input = timeInput({
      dates: [DAY1, DAY2],
      days: [
        {
          date: DAY1,
          requirements: { kind: "time", bars: [...bars("hall", "10:00", "18:00"), ...bars("hall", "11:00", "14:00")] },
        },
        { date: DAY2, requirements: null },
      ],
    });
    const grid = gridOf(input);

    expect(grid.days.map((day) => day.date)).toEqual([DAY1]);
    expect(listRequirementRanges(grid, grid.days[0])).toEqual([
      { positionId: "hall", startTime: "10:00", endTime: "11:00", count: 1 },
      { positionId: "hall", startTime: "11:00", endTime: "14:00", count: 2 },
      { positionId: "hall", startTime: "14:00", endTime: "18:00", count: 1 },
    ]);
    // 休憩中の人は、働いている人に数えない。
    expect(
      listShortages(grid, grid.days[0], [
        shift("staff_a", "10:00", "18:00", [{ startTime: "13:00", endTime: "14:00" }]),
      ]),
    ).toEqual([
      { positionId: "hall", startTime: "11:00", endTime: "13:00", short: 1 },
      { positionId: "hall", startTime: "13:00", endTime: "14:00", short: 2 },
    ]);
  });
});

describe("applyAiDraft", () => {
  const apply = (changes: AiDraftShift[], input = timeInput(), draft: AutoCreatedShift[] = []) =>
    applyAiDraft({ input, grid: gridOf(input), draft, changes });

  it("決まりに合う変更で、その人のその日の勤務を置き換える", () => {
    const result = apply([change()], timeInput(), [
      shift("staff_a", "10:00", "18:00"),
      shift("staff_b", "12:00", "18:00"),
    ]);

    expect(result.rejected).toEqual([]);
    expect(result.applied).toEqual([
      { staffId: "staff_a", date: DAY1, change: "終わりを16時にした", isRemoval: false },
    ]);
    expect(result.shifts).toEqual([shift("staff_a", "10:00", "16:00"), shift("staff_b", "12:00", "18:00")]);
  });

  it("区間が空の変更は、その日を休みにする", () => {
    const result = apply([change({ segments: [] })], timeInput(), [shift("staff_a", "10:00", "18:00")]);

    expect(result.shifts).toEqual([]);
    expect(result.applied).toEqual([{ staffId: "staff_a", date: DAY1, change: "終わりを16時にした", isRemoval: true }]);
  });

  it.each<[string, Partial<AiDraftShift>, string]>([
    ["データにないスタッフ", { staff: 9 }, "UNKNOWN_STAFF"],
    ["必要人数のない日", { date: DAY2 }, "UNKNOWN_DATE"],
    ["30分単位でない時刻", { segments: [{ from: "10:15", to: "16:00", position: 0 }] }, "INVALID_TIME"],
    ["読めない時刻", { segments: [{ from: "10時", to: "16:00", position: 0 }] }, "INVALID_TIME"],
    ["データにないポジション", { segments: [{ from: "10:00", to: "16:00", position: 5 }] }, "UNKNOWN_POSITION"],
    [
      "担当できないポジション",
      { staff: 1, segments: [{ from: "12:00", to: "16:00", position: 1 }] },
      "UNAVAILABLE_POSITION",
    ],
    [
      "切れ目のある勤務",
      {
        segments: [
          { from: "10:00", to: "12:00", position: 0 },
          { from: "13:00", to: "16:00", position: 0 },
        ],
      },
      "NOT_CONTIGUOUS",
    ],
    ["希望の時間の外", { staff: 1, segments: [{ from: "11:00", to: "16:00", position: 0 }] }, "OUTSIDE_REQUEST"],
    ["2時間より短い勤務", { segments: [{ from: "10:00", to: "11:30", position: 0 }] }, "TOO_SHORT"],
    [
      "1時間より短いポジション",
      {
        segments: [
          { from: "10:00", to: "10:30", position: 1 },
          { from: "10:30", to: "16:00", position: 0 },
        ],
      },
      "POSITION_TOO_SHORT",
    ],
    ["6時間30分の勤務", { segments: [{ from: "10:00", to: "16:30", position: 0 }] }, "JUST_OVER_NO_BREAK_SPAN"],
    ["休憩の要る長さで休憩がない", { segments: [{ from: "10:00", to: "18:00", position: 0 }] }, "BREAK_MISMATCH"],
    ["休憩の要らない長さで休憩がある", { breaks: [{ from: "12:00", to: "12:45" }] }, "BREAK_MISMATCH"],
    [
      "長さの違う休憩",
      { segments: [{ from: "10:00", to: "18:00", position: 0 }], breaks: [{ from: "13:00", to: "14:00" }] },
      "BREAK_MISMATCH",
    ],
    [
      "勤務の始まりから1時間以内の休憩",
      { segments: [{ from: "10:00", to: "18:00", position: 0 }], breaks: [{ from: "10:30", to: "11:15" }] },
      "BREAK_POSITION",
    ],
  ])("%sは捨てて、元の下書きを残す", (_label, overrides, reason) => {
    const draft = [shift("staff_a", "10:00", "16:00"), shift("staff_b", "12:00", "18:00")];
    const target = change(overrides);

    const result = apply([target], timeInput(), draft);

    expect(result.rejected).toEqual([{ staff: target.staff, date: target.date, reason }]);
    expect(result.applied).toEqual([]);
    expect(result.shifts).toEqual(draft);
  });

  it("必要人数より多い時間を増やす変更は捨てる", () => {
    // ホールの必要人数は10:00〜18:00に1人。staff_aが入っている時間へstaff_bを重ねると、1人多くなる。
    const draft = [shift("staff_a", "10:00", "16:00")];
    const overlapping = change({ staff: 1, segments: [{ from: "12:00", to: "18:00", position: 0 }] });
    // 必要人数のない18:00以降へ伸ばす変更も、1人多い時間を作る。
    const beyond = change({ segments: [{ from: "10:00", to: "16:00", position: 0 }], staff: 0 });

    expect(apply([overlapping], timeInput(), draft).rejected).toEqual([
      { staff: 1, date: DAY1, reason: "EXCEEDS_REQUIREMENT" },
    ]);
    expect(
      apply([{ ...beyond, segments: [{ from: "14:00", to: "20:00", position: 0 }] }], timeInput(), draft).rejected,
    ).toEqual([{ staff: 0, date: DAY1, reason: "EXCEEDS_REQUIREMENT" }]);
  });

  it("あけた時間を別の人で埋める変更は、埋める変更が先に並んでいても通す", () => {
    const draft = [shift("staff_a", "10:00", "18:00", [{ startTime: "13:30", endTime: "14:15" }])];
    const fill = change({
      staff: 1,
      segments: [{ from: "15:30", to: "18:00", position: 0 }],
      change: "あいた時間に入れた",
    });
    const shorten = change({ segments: [{ from: "10:00", to: "15:30", position: 0 }], change: "終わりを15時半にした" });

    const result = apply([fill, shorten], timeInput(), draft);

    expect(result.rejected).toEqual([]);
    expect(result.shifts).toEqual([shift("staff_a", "10:00", "15:30"), shift("staff_b", "15:30", "18:00")]);
  });

  it("今の下書きと同じ内容の変更と、勤務のない日を休みにする変更は、変更として数えない", () => {
    const draft = [shift("staff_a", "10:00", "16:00")];
    const same = change();
    const alreadyOff = change({ staff: 1, segments: [] });

    const result = apply([same, alreadyOff], timeInput(), draft);

    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.shifts).toEqual(draft);
  });

  it("同じ人の同じ日が2回あれば、先の変更だけを使う", () => {
    const result = apply([change(), change({ segments: [{ from: "10:00", to: "14:00", position: 0 }] })]);

    expect(result.rejected).toEqual([{ staff: 0, date: DAY1, reason: "DUPLICATED" }]);
    expect(result.shifts).toEqual([shift("staff_a", "10:00", "16:00")]);
  });

  it("休憩を入れない設定では、AIが返した休憩を捨てる", () => {
    const result = apply(
      [change({ segments: [{ from: "10:00", to: "18:00", position: 0 }], breaks: [{ from: "13:00", to: "13:45" }] })],
      timeInput({ includesBreaks: false }),
    );

    expect(result.rejected).toEqual([]);
    expect(result.shifts).toEqual([shift("staff_a", "10:00", "18:00")]);
  });

  it("決まった手順が作った勤務は、同じ検査を1件も落とさずに通る", () => {
    const input = timeInput({
      staffs: [staff("staff_a"), staff("staff_b", { kitchen: "unavailable" }), staff("staff_c", { hall: "newcomer" })],
      requestedSlots: [
        request("staff_a", DAY1, "09:00", "22:00"),
        request("staff_b", DAY1, "12:00", "18:00"),
        request("staff_c", DAY1, "10:00", "20:30"),
      ],
      days: [
        {
          date: DAY1,
          requirements: {
            kind: "time",
            bars: [...bars("hall", "10:00", "21:00", 2), ...bars("kitchen", "11:00", "20:00")],
          },
        },
      ],
    });
    const grid = gridOf(input);
    const ruleShifts = buildAutoAssignments(input).shifts;
    const staffIndex = new Map(input.staffs.map((item, index) => [item.id, index]));
    const positionIndex = new Map(input.positionIds.map((positionId, index) => [positionId, index]));
    const changes = ruleShifts.map((item) => ({
      staff: staffIndex.get(item.staffId) ?? -1,
      date: item.date,
      segments: item.segments.map((segment) => ({
        from: segment.startTime,
        to: segment.endTime,
        position: positionIndex.get(segment.positionId) ?? -1,
      })),
      breaks: item.breaks.map((entry) => ({ from: entry.startTime, to: entry.endTime })),
      change: "",
    }));

    const result = applyAiDraft({ input, grid, draft: [], changes });

    expect(ruleShifts.length).toBeGreaterThan(0);
    expect(result.rejected).toEqual([]);
    expect(result.shifts).toEqual(ruleShifts);
  });
});

describe("buildAiDraftData", () => {
  const positions = [
    { id: "hall", name: "ホール" },
    { id: "kitchen", name: "キッチン" },
  ];

  it("スタッフを番号で渡し、IDを入れない。メモ、下書き、足りない時間を日ごとに持つ", () => {
    const input = timeInput();
    const grid = gridOf(input);
    const draft = [shift("staff_a", "10:00", "16:00")];

    const data = buildAiDraftData({
      input,
      grid,
      positions,
      draft,
      notes: [
        { staffId: "staff_b", date: DAY1, note: " 17時までだと助かります " },
        { staffId: "staff_a", date: DAY2, note: "この日は入れません" },
        { staffId: "staff_a", date: DAY1, note: "   " },
        { staffId: "staff_unknown", date: DAY1, note: "対象外の人のメモ" },
      ],
    });

    expect(JSON.stringify(data)).not.toMatch(/staff_a|staff_b|staff_unknown|対象外の人のメモ/);
    expect(data.positions).toEqual([
      { p: 0, name: "ホール" },
      { p: 1, name: "キッチン" },
    ]);
    // 目安は取り分から決める。10:00〜12:00はstaff_aだけ、12:00〜18:00は2人が希望しているため、取り分は5時間と3時間になる。
    expect(data.staff).toEqual([
      { s: 0, skills: [], requestedHours: 8, targetHours: 5, draftHours: 6 },
      { s: 1, skills: [{ p: 1, level: "unavailable" }], requestedHours: 6, targetHours: 3, draftHours: 0 },
    ]);
    // 希望、メモ、下書きの勤務を、1人ずつ1つの項目にまとめる。
    expect(data.days).toEqual([
      {
        date: DAY1,
        weekday: "月",
        required: [{ p: 0, from: "10:00", to: "18:00", count: 1 }],
        shortage: [{ p: 0, from: "16:00", to: "18:00", short: 1 }],
        people: [
          {
            s: 0,
            requests: [{ from: "09:00", to: "20:00" }],
            shift: { segments: [{ from: "10:00", to: "16:00", p: 0 }], breaks: [] },
          },
          // 担当できないポジションは、1人ずつの項目にも持たせる。
          { s: 1, requests: [{ from: "12:00", to: "18:00" }], cannot: [1], note: "17時までだと助かります" },
        ],
      },
    ]);
    expect(data.otherNotes).toEqual([{ s: 0, date: DAY2, note: "この日は入れません" }]);
  });

  it("送る日を絞った場合は、その日と、その日に希望のある人だけを載せ、番号は募集全体での並びのままにする", () => {
    const input = timeInput({
      dates: [DAY1, DAY2],
      requestedSlots: [request("staff_a", DAY1, "09:00", "20:00"), request("staff_b", DAY2, "12:00", "18:00")],
      days: [
        { date: DAY1, requirements: { kind: "time", bars: bars("hall", "10:00", "18:00") } },
        { date: DAY2, requirements: { kind: "time", bars: bars("hall", "10:00", "18:00") } },
      ],
    });

    const data = buildAiDraftData({
      input,
      grid: gridOf(input),
      positions,
      draft: [],
      notes: [
        { staffId: "staff_a", date: DAY1, note: "1日目のメモ" },
        { staffId: "staff_b", date: DAY2, note: "2日目のメモ" },
      ],
      dates: new Set([DAY2]),
    });

    expect(data.days.map((day) => day.date)).toEqual([DAY2]);
    expect(data.staff.map((entry) => entry.s)).toEqual([1]);
    expect(data.days[0].people).toEqual([
      { s: 1, requests: [{ from: "12:00", to: "18:00" }], cannot: [1], note: "2日目のメモ" },
    ]);
    // ほかの回で送る日のメモは、別のまとめにも入れない。
    expect(data.otherNotes).toEqual([]);
  });

  it("希望のない日にメモだけを書いた人は、希望を空にして載せる", () => {
    const input = timeInput({ requestedSlots: [request("staff_a", DAY1, "09:00", "20:00")] });

    const data = buildAiDraftData({
      input,
      grid: gridOf(input),
      positions,
      draft: [],
      notes: [{ staffId: "staff_b", date: DAY1, note: "この日は入れません" }],
    });

    expect(data.days[0].people).toEqual([
      { s: 0, requests: [{ from: "09:00", to: "20:00" }] },
      { s: 1, requests: [], cannot: [1], note: "この日は入れません" },
    ]);
  });

  it("一から作る場合は、下書きに関する項目を入れない", () => {
    const input = timeInput();
    const data = buildAiDraftData({ input, grid: gridOf(input), positions, draft: null, notes: [] });

    expect(Object.keys(data.days[0]).sort()).toEqual(["date", "people", "required", "weekday"]);
    // 一から作る場合は、その日の目安の勤務時間を1人ずつ渡す。希望が1日だけなので、期間全体の目安と同じになる。
    expect(data.days[0].people).toEqual([
      { s: 0, requests: [{ from: "09:00", to: "20:00" }], dayTargetHours: 5 },
      { s: 1, requests: [{ from: "12:00", to: "18:00" }], cannot: [1], dayTargetHours: 3 },
    ]);
    expect(Object.keys(data.staff[0]).sort()).toEqual(["requestedHours", "s", "skills", "targetHours"]);
  });

  it("データを先に、頼むことを最後に置く", () => {
    const input = timeInput();
    const data = buildAiDraftData({ input, grid: gridOf(input), positions, draft: [], notes: [] });
    const message = buildAiDraftUserMessage("revise", data);

    expect(message.startsWith("<data>\n{")).toBe(true);
    expect(message.endsWith("変える勤務だけを返してください。")).toBe(true);
    expect(getAiDraftSystemPrompt("revise")).not.toBe(getAiDraftSystemPrompt("scratch"));
  });
});

describe("evaluateDraft", () => {
  it("足りない時間、多い時間、見習いだけの時間、目安からのずれを数える", () => {
    const input = timeInput({
      staffs: [staff("staff_a", { hall: "newcomer" }), staff("staff_b")],
      requestedSlots: [request("staff_a", DAY1, "10:00", "18:00"), request("staff_b", DAY1, "10:00", "18:00")],
    });
    const grid = gridOf(input);

    expect(
      evaluateDraft(input, grid, [shift("staff_a", "10:00", "14:00"), shift("staff_b", "13:00", "16:00")]),
    ).toEqual({
      shiftCount: 2,
      workedHours: 7,
      // 16:00〜18:00にだれもいない。
      shortageHours: 2,
      // 13:00〜14:00に2人いる。
      excessHours: 1,
      // 10:00〜13:00は見習いのstaff_aだけ。
      newcomerOnlyHours: 3,
      // 8時間を2人が希望しているため、目安は2人とも4時間。4時間と3時間なので、ずれは0時間と1時間。
      targetGapHoursAverage: 0.5,
      targetRatioMin: 0.75,
      targetRatioMax: 1,
      shortShiftCount: 0,
      fairness: {
        days: 2,
        // 8時間の希望に、4時間と3時間が入った。削った割合は0.5と0.625。
        cutRatio: 0.563,
        // 1人分の必要人数を2人が希望しているため、取り分は半分である。
        unavoidableCutRatio: 0.5,
        bands: {
          morning: { days: 0, cutRatio: 0, unavoidableCutRatio: 0, gap: 0 },
          noon: { days: 2, cutRatio: 0.563, unavoidableCutRatio: 0.5, gap: 0.063 },
          evening: { days: 0, cutRatio: 0, unavoidableCutRatio: 0, gap: 0 },
        },
        bandGapSpread: 0,
        staffGapMax: 0.125,
        staffGapMin: 0,
        longestUnassignedStreak: 0,
        averageUnassignedStreak: 0,
      },
    });
  });
});

describe("evaluateFairness", () => {
  it("削った割合、避けられない分との差、勤務が入らない日の続きを、時間帯ごとと人ごとに数える", () => {
    const input = timeInput({
      dates: [DAY1, DAY2],
      staffs: [staff("early"), staff("late"), staff("long"), staff("outside")],
      requestedSlots: [DAY1, DAY2].flatMap((date) => [
        // 必要人数のある時間と重なるのは、10:00〜13:00の3時間。
        request("early", date, "09:00", "13:00"),
        request("late", date, "15:00", "18:00"),
        // 8時間を超える希望は対象から外す。希望者の数には入る。
        request("long", date, "09:00", "20:00"),
        // 必要人数のある時間と重ならない希望は、対象から外す。
        request("outside", date, "18:00", "22:00"),
      ]),
      days: [DAY1, DAY2].map((date) => ({
        date,
        requirements: { kind: "time" as const, bars: bars("hall", "10:00", "18:00") },
      })),
    });
    const grid = gridOf(input);

    const metrics = evaluateDraft(input, grid, [
      shift("early", "10:00", "13:00"),
      // 2時間30分の勤務は、3時間の希望の6分の1を削っている。
      { ...shift("early", "10:00", "12:30"), date: DAY2 },
      shift("long", "13:00", "18:00"),
    ]);

    expect(metrics.shortShiftCount).toBe(1);
    expect(metrics.fairness).toEqual({
      days: 4,
      cutRatio: 0.542,
      // earlyとlateは、どの時間も「long」と2人で1人分を希望しているため、取り分は半分である。
      unavoidableCutRatio: 0.5,
      bands: {
        morning: { days: 2, cutRatio: 0.083, unavoidableCutRatio: 0.5, gap: -0.417 },
        noon: { days: 0, cutRatio: 0, unavoidableCutRatio: 0, gap: 0 },
        // lateは2日とも入れていない。
        evening: { days: 2, cutRatio: 1, unavoidableCutRatio: 0.5, gap: 0.5 },
      },
      bandGapSpread: 0.917,
      staffGapMax: 0.5,
      staffGapMin: -0.417,
      longestUnassignedStreak: 2,
      // earlyは0日、lateは2日。
      averageUnassignedStreak: 1,
    });
  });
});

describe("classifyAiDraftApiError", () => {
  it.each([
    ["残高切れ", { status: 402, type: "billing_error" }, "billing"],
    ["月の上限", { status: 429, type: "rate_limit_error", errorCode: "enforced_spend_limit_reached" }, "billing"],
    ["混雑", { status: 429, type: "rate_limit_error", errorCode: null }, "busy"],
    ["過負荷", { status: 529, type: "overloaded_error" }, "busy"],
    ["接続の失敗", {}, "busy"],
    ["キーの誤り", { status: 401, type: "authentication_error" }, "unavailable"],
    ["要求の誤り", { status: 400, type: "invalid_request_error" }, "unavailable"],
  ])("%sを%sとして伝え分ける", (_label, error, expected) => {
    expect(classifyAiDraftApiError(error)).toBe(expected);
  });
});
