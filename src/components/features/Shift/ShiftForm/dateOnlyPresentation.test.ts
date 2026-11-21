import { describe, expect, it } from "vitest";
import type { PositionSegment, ShiftData, StaffType } from "@/src/domains/shift/types";
import {
  buildDateOnlyDayPresentation,
  buildDateOnlyStaffingPresentation,
  buildDateOnlyWeekPresentation,
} from "./dateOnlyPresentation";
import { buildStaffingCountView, type DayStaffingView, type StaffingSlotView } from "./staffingPresentation";

const HALL = { id: "hall", name: "販売", color: "#60a5fa" };
const KITCHEN = { id: "kitchen", name: "製造", color: "#fb923c" };

// 11/30(月)は期間外、12/3(木)は定休日。
const dates = [
  { iso: "2026-11-30", inRange: false },
  { iso: "2026-12-01", inRange: true },
  { iso: "2026-12-02", inRange: true },
  { iso: "2026-12-03", inRange: true },
  { iso: "2026-12-04", inRange: true },
];
const holidays = ["2026-12-03"];

const staff = (id: string, name: string, isSubmitted = true): StaffType => ({ id, name, isSubmitted });
const kobayashi = staff("s1", "小林 悠斗");
const yamaguchi = staff("s2", "山口 美月");
const yamamoto = staff("s3", "山本 拓海");
const nakamura = staff("s4", "中村 蓮");
const takahashi = staff("s5", "高橋 陽菜");
const sato = staff("s6", "佐藤 健太", false);

const segment = (position: typeof HALL): PositionSegment => ({
  id: `seg-${position.id}`,
  positionId: position.id,
  positionName: position.name,
  color: position.color,
  start: "09:00",
  end: "22:00",
});

const shift = (
  target: StaffType,
  date: string,
  input: { requested?: boolean; position?: typeof HALL; isProvisional?: boolean },
): ShiftData => ({
  id: `shift-${target.id}-${date}`,
  staffId: target.id,
  staffName: target.name,
  date,
  requestedTime: input.requested ? { start: "09:00", end: "22:00" } : null,
  positions: input.position ? [segment(input.position)] : [],
  ...(input.isProvisional ? { isProvisional: true } : {}),
});

const shifts: ShiftData[] = [
  // 小林: 12/1は希望どおり、12/2は希望だけ。
  shift(kobayashi, "2026-12-01", { requested: true, position: HALL }),
  shift(kobayashi, "2026-12-02", { requested: true }),
  // 山口: 希望はなく、12/2の連絡事項だけがある。
  // 山本: 希望のない12/4に入っている。
  shift(yamamoto, "2026-12-04", { position: KITCHEN }),
  // 佐藤（未提出）: 12/1に前回の勤務を仮で入れている。
  shift(sato, "2026-12-01", { position: HALL, isProvisional: true }),
  // 定休日と期間外に残った希望と勤務は、出さない。
  shift(nakamura, "2026-12-03", { requested: true, position: HALL }),
  shift(nakamura, "2026-11-30", { requested: true, position: HALL }),
];
const staffs = [kobayashi, yamaguchi, yamamoto, nakamura, takahashi, sato];

const notes = new Map([["s2:2026-12-02", "午後からなら入れます"]]);
const getNote = (staffId: string, date: string) => notes.get(`${staffId}:${date}`);

const buildWeek = (overrides: Partial<Parameters<typeof buildDateOnlyWeekPresentation>[0]> = {}) =>
  buildDateOnlyWeekPresentation({
    staffs,
    shifts,
    dates,
    holidays,
    isConfirmedDisplay: false,
    usesPositionColors: true,
    getNote,
    ...overrides,
  });

const summarizeCell = (cell: ReturnType<typeof buildWeek>["rows"][number]["cells"][number]) => ({
  date: cell.key,
  status: cell.status,
  ring: cell.showsRequestRing,
  pill: cell.pillLabel,
  dot: cell.dot,
});

describe("buildDateOnlyWeekPresentation", () => {
  it("列は、期間外の日と定休日を見分け、営業日だけ人数を持つ", () => {
    expect(buildWeek().columns.map(({ key, status, countLabel }) => ({ key, status, countLabel }))).toEqual([
      { key: "2026-11-30", status: "outOfRange", countLabel: null },
      { key: "2026-12-01", status: "open", countLabel: "2人" },
      { key: "2026-12-02", status: "open", countLabel: "0人" },
      { key: "2026-12-03", status: "closed", countLabel: null },
      { key: "2026-12-04", status: "open", countLabel: "1人" },
    ]);
  });

  it("セルは、希望の輪と割り当てのピルの4つの状態を持ち、期間外の日と定休日には何も持たない", () => {
    const row = buildWeek().rows.find((item) => item.key === kobayashi.id);
    expect(row?.cells.map(summarizeCell)).toEqual([
      { date: "2026-11-30", status: "outOfRange", ring: false, pill: null, dot: null },
      // 希望どおり
      { date: "2026-12-01", status: "open", ring: true, pill: "販売", dot: null },
      // 希望あり・未割り当て
      { date: "2026-12-02", status: "open", ring: true, pill: null, dot: null },
      { date: "2026-12-03", status: "closed", ring: false, pill: null, dot: null },
      // 希望も割り当てもなし
      { date: "2026-12-04", status: "open", ring: false, pill: null, dot: null },
    ]);
  });

  it("希望のない日への割り当ては、輪を出さず、橙の点と理由を付ける", () => {
    const cell = buildWeek()
      .rows.find((item) => item.key === yamamoto.id)
      ?.cells.find((item) => item.key === "2026-12-04");
    expect(cell).toMatchObject({
      showsRequestRing: false,
      pillLabel: "製造",
      positionId: "kitchen",
      positionColor: "#fb923c",
      dot: "orange",
      noticeTexts: ["希望していない日です"],
      ariaLabel: "山本 拓海 12/4(金) 勤務あり、製造",
      ariaDescription: "希望していない日です",
    });
  });

  it("未提出の人は「未提出」を添え、仮で入れた勤務には「仮」を添えて、未提出の理由を付ける", () => {
    const row = buildWeek().rows.find((item) => item.key === sato.id);
    expect(row).toMatchObject({ isUnsubmitted: true, isNameMuted: true, isProvisional: true });
    expect(row?.cells.find((cell) => cell.key === "2026-12-01")).toMatchObject({
      showsRequestRing: false,
      dot: "orange",
      noticeTexts: ["未提出のスタッフです"],
      ariaDescription: "未提出のスタッフです、前回の勤務を仮で入れています",
    });
  });

  it("連絡事項は日付順に日付を付けて持ち、その日のセルに連絡事項があることを持つ", () => {
    const row = buildWeek({
      getNote: (staffId, date) =>
        staffId === yamaguchi.id && (date === "2026-12-04" || date === "2026-12-01") ? `${date}の連絡` : undefined,
    }).rows.find((item) => item.key === yamaguchi.id);
    expect(row?.notes).toEqual([
      { date: "2026-12-01", dateLabel: "12/1", note: "2026-12-01の連絡" },
      { date: "2026-12-04", dateLabel: "12/4", note: "2026-12-04の連絡" },
    ]);
    expect(row?.cells.filter((cell) => cell.hasNote).map((cell) => cell.key)).toEqual(["2026-12-01", "2026-12-04"]);
    expect(row?.cells.find((cell) => cell.key === "2026-12-01")?.ariaDescription).toBe("連絡事項あり");
  });

  it("その週に希望も割り当ても連絡事項もない人を「希望なし」にまとめ、未提出の人と連絡事項だけの人はまとめない", () => {
    const week = buildWeek();
    expect(week.rows.map((row) => row.staffName)).toEqual(["小林 悠斗", "山口 美月", "山本 拓海", "佐藤 健太"]);
    // 中村は、定休日と期間外にだけ希望と勤務が残っているため、希望なしにまとめる。
    expect(week.foldedGroup).toMatchObject({ label: "希望なし 2人", namesLabel: "中村・高橋" });
    expect(week.foldedGroup?.rows.map((row) => row.staffName)).toEqual(["中村 蓮", "高橋 陽菜"]);
  });

  it("まとめた人に勤務を入れると、通常の行へ移る。まとめる人がいなければ、まとまりを持たない", () => {
    const assigned = buildWeek({
      shifts: [
        ...shifts,
        shift(takahashi, "2026-12-02", { position: HALL }),
        shift(nakamura, "2026-12-01", { requested: true }),
      ],
    });
    expect(assigned.rows.map((row) => row.staffName)).toContain("高橋 陽菜");
    expect(assigned.foldedGroup).toBeNull();
  });

  it("ポジションを塗り分けない表示では、ピルを「○」にし、色と名前を持たない", () => {
    const cell = buildWeek({ usesPositionColors: false })
      .rows.find((item) => item.key === yamamoto.id)
      ?.cells.find((item) => item.key === "2026-12-04");
    expect(cell).toMatchObject({
      pillLabel: "○",
      positionColor: null,
      positionId: "kitchen",
      ariaLabel: "山本 拓海 12/4(金) 勤務あり",
    });
  });

  it("スタッフ向けの確定シフトでは、希望の輪、点、「未提出」、まとまりを出さず、全員を行に出す", () => {
    const week = buildWeek({ isConfirmedDisplay: true });
    expect(week.rows).toHaveLength(staffs.length);
    expect(week.foldedGroup).toBeNull();
    const cells = week.rows.flatMap((row) => row.cells);
    expect(cells.filter((cell) => cell.showsRequestRing || cell.dot !== null || cell.noticeTexts.length > 0)).toEqual(
      [],
    );
    expect(week.rows.filter((row) => row.isUnsubmitted || row.isProvisional)).toEqual([]);
    expect(cells.filter((cell) => cell.assigned).map((cell) => cell.ariaLabel)).toEqual([
      "小林 悠斗 12/1(火) 勤務あり、販売",
      "山本 拓海 12/4(金) 勤務あり、製造",
      "佐藤 健太 12/1(火) 勤務あり、販売",
    ]);
  });
});

describe("buildDateOnlyDayPresentation", () => {
  const date = "2026-12-02";
  const dayShifts: ShiftData[] = [
    // 高橋: 希望のない日に入っている。
    shift(takahashi, date, { position: KITCHEN }),
    // 小林: 希望だけ。
    shift(kobayashi, date, { requested: true }),
    // 山本: 希望どおり。
    shift(yamamoto, date, { requested: true, position: HALL }),
  ];
  const buildDay = (overrides: Partial<Parameters<typeof buildDateOnlyDayPresentation>[0]> = {}) =>
    buildDateOnlyDayPresentation({
      staffs: [takahashi, sato, kobayashi, nakamura, yamamoto, yamaguchi],
      shifts: dayShifts,
      date,
      isClosed: false,
      isConfirmedDisplay: false,
      usesPositionColors: true,
      getNote,
      ...overrides,
    });

  it("連絡事項がある人、希望がある人、希望外で割り当て済みの人、未提出の人の順に並べ、同じまとまりでは渡した順を保つ", () => {
    expect(buildDay().rows.map((row) => row.staffName)).toEqual([
      "山口 美月",
      "小林 悠斗",
      "山本 拓海",
      "高橋 陽菜",
      "佐藤 健太",
    ]);
  });

  it("その日の連絡事項を全文で持ち、ない人はnullにする", () => {
    const rows = buildDay().rows;
    expect(rows.map((row) => row.note)).toEqual(["午後からなら入れます", null, null, null, null]);
  });

  it("その日の希望も割り当ても連絡事項もない人を、下にまとめる", () => {
    const day = buildDay();
    expect(day.foldedGroup).toMatchObject({ label: "この日の希望がない人 1人", namesLabel: "中村" });
    expect(day.foldedGroup?.rows.map((row) => row.staffName)).toEqual(["中村 蓮"]);
  });

  it("人数は、その日に勤務のある人を数える", () => {
    expect(buildDay().countLabel).toBe("2人");
  });

  it("スタッフ向けの確定シフトでは、並べ替えずに渡した順で全員を出す", () => {
    const day = buildDay({ isConfirmedDisplay: true });
    expect(day.rows.map((row) => row.staffName)).toEqual([
      "高橋 陽菜",
      "佐藤 健太",
      "小林 悠斗",
      "中村 蓮",
      "山本 拓海",
      "山口 美月",
    ]);
    expect(day.foldedGroup).toBeNull();
    expect(day.rows.filter((row) => row.cell.showsRequestRing || row.cell.dot !== null)).toEqual([]);
  });
});

describe("buildDateOnlyStaffingPresentation", () => {
  const DRINK = { id: "drink", name: "ドリンク", color: "#a78bfa" };
  const position = (item: typeof HALL, count: number, required: number | null, isNewcomerOnly = false) => ({
    positionId: item.id,
    name: item.name,
    color: item.color,
    ...buildStaffingCountView({ count, required, isNewcomerOnly }),
  });
  const view = (date: string, positions: StaffingSlotView["positions"]): DayStaffingView => ({
    date,
    template: {
      label: "平日",
      templateId: "t1",
      templateName: "平日",
      isCustom: false,
      isDateSpecific: false,
      isNone: false,
    },
    hasRequirements: positions.some((item) => item.required !== null),
    slots: [
      {
        id: "allDay",
        label: "1日",
        total: positions.reduce((sum, item) => sum + item.count, 0),
        positions,
        hasShortage: false,
        hasExcess: false,
      },
    ],
    bands: [],
    hasShortage: false,
    hasExcess: false,
    shortageCount: 0,
  });
  // 12/1: 販売 3/3・製造 1/2、12/2: 販売 4/3・製造 0/2、12/4: 必要人数の指定がない日。
  const week = [
    view("2026-12-01", [position(HALL, 3, 3), position(KITCHEN, 1, 2), position(DRINK, 0, null)]),
    view("2026-12-02", [position(HALL, 4, 3), position(KITCHEN, 0, 2, false), position(DRINK, 0, null)]),
    view("2026-12-04", [position(HALL, 2, null, true), position(KITCHEN, 0, null), position(DRINK, 0, null)]),
  ];
  const summarize = (staffing: ReturnType<typeof buildDateOnlyStaffingPresentation>, date: string) =>
    staffing.countsByDate.get(date)?.map(({ positionName, label, tone }) => ({ positionName, label, tone }));

  it("ポジションごとの「配置/必要」を、足りない・ちょうど・多いに分け、合計と差の表記を出さない", () => {
    const staffing = buildDateOnlyStaffingPresentation(week);
    expect(summarize(staffing, "2026-12-01")).toEqual([
      { positionName: "販売", label: "3/3", tone: "even" },
      { positionName: "製造", label: "1/2", tone: "shortage" },
    ]);
    expect(summarize(staffing, "2026-12-02")).toEqual([
      { positionName: "販売", label: "4/3", tone: "excess" },
      { positionName: "製造", label: "0/2", tone: "shortage" },
    ]);
  });

  it("必要人数の指定がない日は、入っている人数だけを出し、だれもいないポジションは文字を持たない", () => {
    const staffing = buildDateOnlyStaffingPresentation(week);
    expect(summarize(staffing, "2026-12-04")).toEqual([
      { positionName: "販売", label: "2", tone: "unset" },
      { positionName: "製造", label: null, tone: "unset" },
    ]);
    expect(staffing.countsByDate.get("2026-12-04")?.[0]).toMatchObject({
      isNewcomerOnly: true,
      description: "販売 2、見習いだけ",
    });
  });

  it("出すポジションは週でそろえ、どの日にも必要人数がなく、だれも入っていないポジションは出さない", () => {
    const staffing = buildDateOnlyStaffingPresentation(week);
    expect(staffing.positions.map((item) => item.name)).toEqual(["販売", "製造"]);
    for (const date of ["2026-12-01", "2026-12-02", "2026-12-04"]) {
      expect(staffing.countsByDate.get(date)).toHaveLength(2);
    }
  });

  it("週の充足率は、日とポジションのすべての組み合わせで求め、多い分を足さない", () => {
    // 配置 3+1+3+0 = 7、必要 3+2+3+2 = 10
    expect(buildDateOnlyStaffingPresentation(week)).toMatchObject({ percent: 70, isFulfilled: false });
  });

  it("すべて足りている週は100%で、充足とする", () => {
    const staffing = buildDateOnlyStaffingPresentation([view("2026-12-01", [position(HALL, 3, 3)])]);
    expect(staffing).toMatchObject({ percent: 100, isFulfilled: true });
  });

  it("必要人数の指定が1つもない週は、充足率を持たない", () => {
    const staffing = buildDateOnlyStaffingPresentation([week[2]]);
    expect(staffing.percent).toBeNull();
    expect(staffing.isFulfilled).toBe(false);
  });

  it("1日分だけを渡すと、その日の充足率になる", () => {
    // 配置 3+1 = 4、必要 3+2 = 5
    expect(buildDateOnlyStaffingPresentation([week[0]]).percent).toBe(80);
  });
});
