import type { ComponentProps } from "react";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import type { ShiftForm } from "..";
import { lastPositionStorageKey } from "../lastPositionStorage";
import { buildStaffing, type StoryTemplate, staffingCounts, templateDay, unsetDay } from "./staffingHarness";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

// パターン選択の日別の表の代表例。希望どおり、希望だけ、希望外、時間の重なり、休み希望、未提出を1日に持つ。
// 遅番（15:00〜21:00）と夜番（18:00〜24:00）は、時間が重なる。

const boardShopId = "shop-board";
const boardDates = ["2026-12-16", "2026-12-17", "2026-12-18", "2026-12-19", "2026-12-20"];
const [firstDate] = boardDates;

const boardPattern: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00", sortOrder: 1 },
    { id: "night", name: "夜番", startTime: "18:00", endTime: "24:00", sortOrder: 2 },
  ],
};
const options = boardPattern.kind === "shiftType" ? boardPattern.options : [];

const boardHall: PositionType = { id: "hall", name: "ホール", color: "#60a5fa", isDefault: true };
const boardKitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#fb923c", isDefault: false };
const boardDrink: PositionType = { id: "drink", name: "ドリンク", color: "#a78bfa", isDefault: false };
const positions = [boardHall, boardKitchen, boardDrink];

const staffs: StaffType[] = [
  { id: "mori", name: "森 莉子", isSubmitted: true },
  { id: "matsumoto", name: "松本 大和", isSubmitted: true },
  { id: "yoshida", name: "吉田 蓮", isSubmitted: true },
  { id: "yamamoto", name: "山本 拓海", isSubmitted: true },
  { id: "kimura", name: "木村 湊", isSubmitted: true },
  { id: "kobayashi", name: "小林 悠斗", isSubmitted: true },
  { id: "nakamura", name: "中村 さくら", isSubmitted: true },
  { id: "takahashi", name: "高橋 翔", isSubmitted: true },
  { id: "ito", name: "伊藤 大輔", isSubmitted: true },
  { id: "yamaguchi", name: "山口 美月", isSubmitted: true },
  { id: "sato", name: "佐藤 健太", isSubmitted: false },
];

const shift = (
  staffId: string,
  requested: string[],
  assignments: Array<[optionId: string, position: PositionType]>,
): ShiftData => ({
  id: `shift-${staffId}-${firstDate}`,
  staffId,
  staffName: staffs.find((staff) => staff.id === staffId)?.name ?? staffId,
  date: firstDate,
  requestedTime: null,
  requestedShiftTypeOptionIds: requested,
  positions: assignments.map(([optionId, position]) => {
    const option = options.find((item) => item.id === optionId) ?? options[0];
    return {
      id: `seg-${staffId}-${firstDate}-${option.id}`,
      positionId: position.id,
      positionName: position.name,
      color: position.color,
      start: option.startTime,
      end: option.endTime,
      shiftTypeOptionId: option.id,
    };
  }),
});

const shifts: ShiftData[] = [
  // 希望どおりの割り当て。
  shift("mori", ["early"], [["early", boardHall]]),
  shift(
    "matsumoto",
    ["early", "late"],
    [
      ["early", boardHall],
      ["late", boardHall],
    ],
  ),
  shift("yoshida", ["late"], [["late", boardHall]]),
  // 希望だけで、まだ割り当てていない。
  shift("yamamoto", ["late"], []),
  // 遅番を希望し、希望していない早番に入っている。
  shift("kimura", ["late"], [["early", boardKitchen]]),
  // 時間が重なる遅番と夜番の両方に入っている。
  shift(
    "kobayashi",
    ["late", "night"],
    [
      ["late", boardHall],
      ["night", boardDrink],
    ],
  ),
  // 休み希望。
  shift("nakamura", [], []),
  shift("takahashi", [], []),
  shift("ito", [], []),
  shift("yamaguchi", [], []),
];

const boardWeekdayTemplate: StoryTemplate = {
  id: "weekday",
  name: "平日",
  requirements: {
    kind: "shiftType",
    options: [
      {
        optionId: "early",
        counts: staffingCounts([
          [boardHall, 2],
          [boardKitchen, 1],
        ]),
      },
      {
        optionId: "late",
        counts: staffingCounts([
          [boardHall, 2],
          [boardKitchen, 1],
        ]),
      },
      {
        optionId: "night",
        counts: staffingCounts([
          [boardHall, 1],
          [boardKitchen, 1],
          [boardDrink, 1],
        ]),
      },
    ],
  },
};
const boardWeekendTemplate: StoryTemplate = {
  id: "weekend",
  name: "土日",
  requirements: {
    kind: "shiftType",
    options: [{ optionId: "early", counts: staffingCounts([[boardHall, 3]]) }],
  },
};
const boardTemplates = [boardWeekdayTemplate, boardWeekendTemplate];

/** シンプル表示。ポジションと必要人数を見せず、「○」の付け外しだけを行う。 */
export const shiftTypeBoardSimpleArgs = {
  shopId: boardShopId,
  staffs,
  positions,
  initialShifts: shifts,
  dates: boardDates,
  timeRange: { start: 9, end: 24, unit: 30 },
  holidays: [],
  submissionPattern: boardPattern,
  dateNotes: [{ staffId: "matsumoto", date: firstDate, note: "早めに上がれると助かります" }],
} satisfies ShiftFormArgs;

/** くわしく表示。ポジションの色のピルと、見出しの「配置/必要」を出す。 */
export const shiftTypeBoardDetailArgs = {
  ...shiftTypeBoardSimpleArgs,
  staffing: buildStaffing({
    templates: boardTemplates,
    // 2日目は、必要人数のない日。
    days: boardDates.map((date, index) => (index === 1 ? unsetDay(date) : templateDay(date, boardWeekdayTemplate))),
  }),
  initialDetailMode: true,
  onDetailModeChange: () => {},
  detailActions: { onOpenSetup: () => {}, dayStaffingActions: { onApplyTemplate: async () => true, isPending: false } },
} satisfies ShiftFormArgs;

/** 前のStoryで覚えたポジションを消す。空きのセルへ入るポジションを、店舗の先頭のポジションから始めるためである。 */
export const clearRememberedBoardPosition = () => {
  localStorage.removeItem(lastPositionStorageKey(boardShopId));
};
