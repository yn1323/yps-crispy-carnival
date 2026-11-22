import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { PositionSegment, ShiftData, StaffType } from "@/src/domains/shift/types";
import {
  buildShiftTypeDailyPresentation,
  buildShiftTypeStaffingPresentation,
  formatShiftTypeShortTimeRange,
  toShiftTypeWarningMessages,
} from "./shiftTypeDailyPresentation";
import { buildStaffingCountView, type DayStaffingView, type StaffingSlotView } from "./staffingPresentation";

const submissionPattern: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "night", name: "夜番", startTime: "18:00", endTime: "24:00", sortOrder: 2 },
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00", sortOrder: 1 },
  ],
};
const HALL = { id: "hall", name: "ホール", color: "#60a5fa" };
const KITCHEN = { id: "kitchen", name: "キッチン", color: "#fb923c" };

const segment = (optionId: string, position = HALL): PositionSegment => {
  const option = submissionPattern.options.find((item) => item.id === optionId);
  if (!option) throw new Error("勤務パターンがありません");
  return {
    id: `seg-${optionId}`,
    positionId: position.id,
    positionName: position.name,
    color: position.color,
    start: option.startTime,
    end: option.endTime,
    shiftTypeOptionId: optionId,
  };
};

const staff = (id: string, name: string, isSubmitted = true): StaffType => ({ id, name, isSubmitted });
const shift = (staffId: string, requested: string[], positions: PositionSegment[]): ShiftData => ({
  id: `shift-${staffId}`,
  staffId,
  staffName: staffId,
  date: "2026-12-16",
  requestedTime: null,
  requestedShiftTypeOptionIds: requested,
  positions,
});

const build = (
  staffs: StaffType[],
  shifts: ShiftData[],
  overrides: {
    isConfirmedDisplay?: boolean;
    usesPositionColors?: boolean;
    hasNote?: (staffId: string) => boolean;
  } = {},
) =>
  buildShiftTypeDailyPresentation({
    submissionPattern,
    shifts,
    staffs,
    shiftByStaffId: new Map(shifts.map((item) => [item.staffId, item])),
    isConfirmedDisplay: false,
    ...overrides,
  });

describe("buildShiftTypeDailyPresentation", () => {
  it("勤務パターンを設定順に並べ、時間と人数の文字を作る", () => {
    const presentation = build(
      [staff("a", "森 莉子"), staff("b", "松本 大和")],
      [shift("a", ["early"], [segment("early")]), shift("b", ["early", "late"], [segment("early")])],
    );

    expect(
      presentation.options.map(({ key, name, timeLabel, shortTimeLabel, countLabel }) => ({
        key,
        name,
        timeLabel,
        shortTimeLabel,
        countLabel,
      })),
    ).toEqual([
      { key: "early", name: "早番", timeLabel: "09:00〜15:00", shortTimeLabel: "9–15", countLabel: "2人" },
      { key: "late", name: "遅番", timeLabel: "15:00〜21:00", shortTimeLabel: "15–21", countLabel: "0人" },
      { key: "night", name: "夜番", timeLabel: "18:00〜翌0:00", shortTimeLabel: "18–24", countLabel: "0人" },
    ]);
  });

  it("セルを、希望の輪・割り当てのピル・点の3つで表す", () => {
    const presentation = build(
      [staff("a", "木村 湊")],
      // 遅番を希望し、希望していない早番に入っている。
      [shift("a", ["late"], [segment("early", KITCHEN)])],
      { usesPositionColors: true },
    );

    expect(
      presentation.rows[0].cells.map(
        ({ key, showsRequestRing, assigned, pillLabel, positionColor, dot, noticeTexts }) => ({
          key,
          showsRequestRing,
          assigned,
          pillLabel,
          positionColor,
          dot,
          noticeTexts,
        }),
      ),
    ).toEqual([
      {
        key: "early",
        showsRequestRing: false,
        assigned: true,
        pillLabel: "キッチン",
        positionColor: "#fb923c",
        dot: "orange",
        noticeTexts: ["希望時間外に勤務あり"],
      },
      {
        key: "late",
        showsRequestRing: true,
        assigned: false,
        pillLabel: null,
        positionColor: null,
        dot: null,
        noticeTexts: [],
      },
      {
        key: "night",
        showsRequestRing: false,
        assigned: false,
        pillLabel: null,
        positionColor: null,
        dot: null,
        noticeTexts: [],
      },
    ]);
  });

  it("ポジションを塗り分けない表示では、ピルの中身を「○」にし、ポジションの色を持たせない", () => {
    const [row] = build([staff("a", "森 莉子")], [shift("a", ["early"], [segment("early", KITCHEN)])]).rows;

    expect(row.cells[0]).toMatchObject({ pillLabel: "○", positionColor: null, positionId: "kitchen" });
  });

  it("点の理由を文言にし、時間が重なる勤務パターンに両方入っても重なりは知らせない", () => {
    const [row] = build([staff("a", "小林 悠斗")], [shift("a", ["late"], [segment("late"), segment("night")])]).rows;

    expect(row.cells.map(({ dot, noticeTexts }) => ({ dot, noticeTexts }))).toEqual([
      { dot: null, noticeTexts: [] },
      { dot: null, noticeTexts: [] },
      { dot: "orange", noticeTexts: ["希望時間外に勤務あり"] },
    ]);
    // 名前の右の確認事項には、勤務パターン名を付けて並べる。
    expect(toShiftTypeWarningMessages(row)).toEqual([`${row.cells[2].option.name}：希望時間外に勤務あり`]);
  });

  it("ボタンの名前の末尾を「勤務あり」「勤務なし」に保ち、希望と点の理由は説明に分ける", () => {
    const [row] = build([staff("a", "木村 湊")], [shift("a", ["late"], [segment("early", KITCHEN)])], {
      usesPositionColors: true,
    }).rows;

    expect(row.cells.map(({ ariaLabel, ariaDescription }) => ({ ariaLabel, ariaDescription }))).toEqual([
      { ariaLabel: "木村 湊 早番 勤務あり", ariaDescription: "希望時間外に勤務あり" },
      { ariaLabel: "木村 湊 遅番 勤務なし", ariaDescription: "希望あり" },
      { ariaLabel: "木村 湊 夜番 勤務なし", ariaDescription: null },
    ]);
  });

  it("未提出の人は通常の行に出し、名前に「未提出」を添えて、希望の輪を出さない", () => {
    const presentation = build([staff("a", "佐藤 健太", false)], [shift("a", ["early"], [segment("late")])]);

    expect(presentation.restGroup).toBeNull();
    expect(presentation.rows).toHaveLength(1);
    expect(presentation.rows[0]).toMatchObject({ isUnsubmitted: true, isNameMuted: true });
    expect(
      presentation.rows[0].cells.map(({ showsRequestRing, noticeTexts }) => ({ showsRequestRing, noticeTexts })),
    ).toEqual([
      { showsRequestRing: false, noticeTexts: [] },
      { showsRequestRing: false, noticeTexts: ["未提出"] },
      { showsRequestRing: false, noticeTexts: [] },
    ]);
  });

  it("休み希望で割り当てのない人を、表の下のまとまりへ分け、名前を3人分まで名字で出す", () => {
    const staffs = [
      staff("a", "森 莉子"),
      staff("b", "中村 さくら"),
      staff("c", "高橋　翔"),
      staff("d", "伊藤 大輔"),
      staff("e", "yn1323"),
      // 休み希望でも割り当てがある人は、通常の行に出す。
      staff("f", "山口 美月"),
    ];
    const presentation = build(staffs, [
      shift("a", ["early"], []),
      shift("b", [], []),
      shift("c", [], []),
      shift("d", [], []),
      shift("e", [], []),
      shift("f", [], [segment("early")]),
    ]);

    expect(presentation.rows.map((row) => row.staffName)).toEqual(["森 莉子", "山口 美月"]);
    expect(presentation.rows[1].cells[0]).toMatchObject({ dot: "orange", noticeTexts: ["希望時間外に勤務あり"] });
    expect(presentation.restGroup).toMatchObject({ label: "休み希望 4人", namesLabel: "中村・高橋・伊藤・ほか1人" });
    expect(presentation.restGroup?.rows.map((row) => row.staffName)).toEqual([
      "中村 さくら",
      "高橋　翔",
      "伊藤 大輔",
      "yn1323",
    ]);
  });

  it("休み希望でも、その日の連絡事項がある人は、まとめずに通常の行へ出す", () => {
    const presentation = build([staff("a", "中村 さくら"), staff("b", "高橋 翔")], [], {
      hasNote: (staffId) => staffId === "a",
    });

    expect(presentation.rows.map((row) => row.staffName)).toEqual(["中村 さくら"]);
    expect(presentation.restGroup).toMatchObject({ label: "休み希望 1人", namesLabel: "高橋" });
  });

  it("休み希望の人が3人以下なら、「ほか」を付けない", () => {
    const presentation = build([staff("a", "中村 さくら"), staff("b", "高橋 翔")], []);

    expect(presentation.restGroup).toMatchObject({ label: "休み希望 2人", namesLabel: "中村・高橋" });
  });

  it("スタッフ向けの確定シフトでは、希望の輪、点、未提出、休み希望のまとまりを出さない", () => {
    const presentation = build(
      [staff("a", "森 莉子"), staff("b", "佐藤 健太", false), staff("c", "中村 さくら")],
      [shift("a", ["late"], [segment("early")]), shift("b", [], [segment("late")]), shift("c", [], [])],
      { isConfirmedDisplay: true },
    );

    expect(presentation.restGroup).toBeNull();
    expect(presentation.rows.map(({ staffName, isUnsubmitted }) => ({ staffName, isUnsubmitted }))).toEqual([
      { staffName: "森 莉子", isUnsubmitted: false },
      { staffName: "佐藤 健太", isUnsubmitted: false },
      { staffName: "中村 さくら", isUnsubmitted: false },
    ]);
    const cells = presentation.rows.flatMap((row) => row.cells);
    expect(cells.filter((cell) => cell.showsRequestRing || cell.dot !== null || cell.ariaDescription !== null)).toEqual(
      [],
    );
    expect(cells.filter((cell) => cell.assigned).map((cell) => cell.ariaLabel)).toEqual([
      "森 莉子 早番 勤務あり",
      "佐藤 健太 遅番 勤務あり",
    ]);
  });
});

describe("formatShiftTypeShortTimeRange", () => {
  it("正時は時だけ、分のある時刻は分も書き、24時より後は「翌」を付ける", () => {
    expect(formatShiftTypeShortTimeRange({ startTime: "09:00", endTime: "15:00" })).toBe("9–15");
    expect(formatShiftTypeShortTimeRange({ startTime: "09:30", endTime: "24:00" })).toBe("9:30–24");
    expect(formatShiftTypeShortTimeRange({ startTime: "22:00", endTime: "29:00" })).toBe("22–翌5");
  });
});

describe("buildShiftTypeStaffingPresentation", () => {
  const position = (item: typeof HALL, count: number, required: number | null, isNewcomerOnly = false) => ({
    positionId: item.id,
    name: item.name,
    color: item.color,
    ...buildStaffingCountView({ count, required, isNewcomerOnly }),
  });
  const DRINK = { id: "drink", name: "ドリンク", color: "#a78bfa" };
  const slot = (optionId: string, positions: StaffingSlotView["positions"]): StaffingSlotView => ({
    id: `shiftType:${optionId}`,
    label: optionId,
    total: positions.reduce((sum, item) => sum + item.count, 0),
    positions,
    hasShortage: false,
    hasExcess: false,
  });
  const view = (slots: StaffingSlotView[]): DayStaffingView => ({
    date: "2026-12-16",
    template: {
      label: "平日",
      templateId: "t1",
      templateName: "平日",
      isCustom: false,
      isDateSpecific: false,
      isNone: false,
    },
    hasRequirements: true,
    slots,
    bands: [],
    hasShortage: false,
    hasExcess: false,
    shortageCount: 0,
  });
  const options = [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00" },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00" },
    { id: "night", name: "夜番", startTime: "18:00", endTime: "24:00" },
  ];
  // 依頼の画像と同じ日。早番 2/2・1/1、遅番 3/2・0/1、夜番 0/1・0/1・1/1。
  const day = view([
    slot("early", [position(HALL, 2, 2), position(KITCHEN, 1, 1), position(DRINK, 0, null)]),
    slot("late", [position(HALL, 3, 2), position(KITCHEN, 0, 1), position(DRINK, 0, null)]),
    slot("night", [position(HALL, 0, 1), position(KITCHEN, 0, 1), position(DRINK, 1, 1)]),
  ]);

  it("ポジションごとの「配置/必要」を、足りない・ちょうど・多いに分け、合計と差の表記を出さない", () => {
    const staffing = buildShiftTypeStaffingPresentation(day, options);

    const summarize = (optionId: string) =>
      staffing.countsByOptionId.get(optionId)?.map(({ positionName, label, tone }) => ({ positionName, label, tone }));
    expect(summarize("early")).toEqual([
      { positionName: "ホール", label: "2/2", tone: "even" },
      { positionName: "キッチン", label: "1/1", tone: "even" },
      // 必要人数の指定がなく、だれも入っていないポジションは、文字を持たない。
      { positionName: "ドリンク", label: null, tone: "unset" },
    ]);
    expect(summarize("late")).toEqual([
      { positionName: "ホール", label: "3/2", tone: "excess" },
      { positionName: "キッチン", label: "0/1", tone: "shortage" },
      { positionName: "ドリンク", label: null, tone: "unset" },
    ]);
    expect(summarize("night")).toEqual([
      { positionName: "ホール", label: "0/1", tone: "shortage" },
      { positionName: "キッチン", label: "0/1", tone: "shortage" },
      { positionName: "ドリンク", label: "1/1", tone: "even" },
    ]);
  });

  it("充足率を、足りている人数と勤務パターンの長さから求める", () => {
    // (2 + 1 + 2 + 0 + 0 + 0 + 1) × 6h ÷ (2 + 1 + 2 + 1 + 1 + 1 + 1) × 6h = 6 ÷ 9 = 66.6…% → 66%
    expect(buildShiftTypeStaffingPresentation(day, options)).toMatchObject({ percent: 66, isFulfilled: false });
  });

  it("必要人数の指定がないポジションは、入っている人がいるときだけ人数を出し、その日に出すポジションへ含める", () => {
    const staffing = buildShiftTypeStaffingPresentation(
      view([
        slot("early", [position(HALL, 1, 1), position(KITCHEN, 0, null), position(DRINK, 0, null)]),
        slot("late", [position(HALL, 1, 1), position(KITCHEN, 2, null), position(DRINK, 0, null)]),
      ]),
      options,
    );

    // だれも入らず、必要人数もないドリンクは、その日のどの勤務パターンにも出さない。
    expect(staffing.positions.map(({ name }) => name)).toEqual(["ホール", "キッチン"]);
    expect(staffing.countsByOptionId.get("late")?.map(({ label, tone }) => ({ label, tone }))).toEqual([
      { label: "1/1", tone: "even" },
      { label: "2", tone: "unset" },
    ]);
    expect(staffing).toMatchObject({ percent: 100, isFulfilled: true });
  });

  it("必要人数が1つもない日は、充足率を持たない", () => {
    const staffing = buildShiftTypeStaffingPresentation(view([slot("early", [position(HALL, 2, null)])]), options);

    expect(staffing.percent).toBeNull();
    expect(staffing.countsByOptionId.get("early")?.map(({ label }) => label)).toEqual(["2"]);
  });

  it("見習いだけのポジションに印を持たせ、説明に添える", () => {
    const staffing = buildShiftTypeStaffingPresentation(view([slot("early", [position(HALL, 1, 2, true)])]), options);

    expect(staffing.countsByOptionId.get("early")).toEqual([
      {
        positionId: "hall",
        positionName: "ホール",
        color: "#60a5fa",
        label: "1/2",
        tone: "shortage",
        isNewcomerOnly: true,
        description: "ホール 1/2、見習いだけ",
      },
    ]);
  });
});
