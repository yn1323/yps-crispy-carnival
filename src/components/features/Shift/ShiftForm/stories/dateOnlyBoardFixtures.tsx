import type { ComponentProps } from "react";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import type { ShiftForm } from "..";
import { lastPositionStorageKey } from "../lastPositionStorage";
import { buildStaffing, type StoryTemplate, staffingCounts, templateDay, unsetDay } from "./staffingHarness";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

// 日付選択の表の代表例。希望どおり、希望だけ、希望外、連絡事項、希望なし、未提出、期間外の日、定休日を1週間に持つ。
// 募集は 2026-12-01(火)〜12-07(月)。1週目の 11/30(月) は期間外、12/3(木) は定休日である。

const dateOnlyBoardShopId = "shop-date-only-board";
const dateOnlyBoardDates = [
  "2026-12-01",
  "2026-12-02",
  "2026-12-03",
  "2026-12-04",
  "2026-12-05",
  "2026-12-06",
  "2026-12-07",
];

const sales: PositionType = { id: "sales", name: "販売", color: "#60a5fa", isDefault: true };
const bakery: PositionType = { id: "bakery", name: "製造", color: "#fb923c", isDefault: false };
const dateOnlyBoardPositions = [sales, bakery];

const staffs: StaffType[] = [
  { id: "kobayashi", name: "小林 悠斗", isSubmitted: true },
  { id: "yamaguchi", name: "山口 美月", isSubmitted: true },
  { id: "kato", name: "加藤 愛", isSubmitted: true },
  { id: "sato", name: "佐藤 健太", isSubmitted: true },
  { id: "hayashi", name: "林 心春", isSubmitted: true },
  { id: "yamamoto", name: "山本 拓海", isSubmitted: true },
  // その週に希望が1日もない人。
  { id: "nakamura", name: "中村 蓮", isSubmitted: true },
  { id: "takahashi", name: "高橋 陽菜", isSubmitted: true },
  { id: "ito", name: "伊藤 大輔", isSubmitted: false },
];

const request = { start: "09:00", end: "22:00" };

const shift = (staffId: string, day: number, requested: boolean, position: PositionType | null): ShiftData => {
  const date = `2026-12-0${day}`;
  return {
    id: `shift-${staffId}-${date}`,
    staffId,
    staffName: staffs.find((staff) => staff.id === staffId)?.name ?? staffId,
    date,
    requestedTime: requested ? request : null,
    requestedTimes: requested ? [request] : [],
    positions: position
      ? [
          {
            id: `seg-${staffId}-${date}`,
            positionId: position.id,
            positionName: position.name,
            color: position.color,
            start: "09:00",
            end: "22:00",
          },
        ]
      : [],
  };
};

const shifts: ShiftData[] = [
  shift("kobayashi", 1, true, sales),
  shift("kobayashi", 4, true, bakery),
  shift("kobayashi", 5, true, sales),
  shift("yamaguchi", 1, true, sales),
  shift("yamaguchi", 2, true, sales),
  // 希望だけで、まだ割り当てていない。
  shift("yamaguchi", 5, true, null),
  shift("kato", 1, true, bakery),
  shift("kato", 2, true, bakery),
  shift("kato", 4, true, sales),
  shift("sato", 1, true, sales),
  shift("sato", 2, true, sales),
  shift("sato", 4, true, null),
  shift("sato", 6, true, bakery),
  shift("hayashi", 2, true, null),
  // 希望していない12/5に入っている。
  shift("yamamoto", 5, false, sales),
  shift("yamamoto", 6, true, null),
];

const weekdayTemplate: StoryTemplate = {
  id: "weekday",
  name: "平日",
  requirements: {
    kind: "dateOnly",
    counts: staffingCounts([
      [sales, 3],
      [bakery, 2],
    ]),
  },
};
const weekendTemplate: StoryTemplate = {
  id: "weekend",
  name: "土日祝",
  requirements: {
    kind: "dateOnly",
    counts: staffingCounts([
      [sales, 4],
      [bakery, 3],
    ]),
  },
};
const dateOnlyBoardTemplates = [weekdayTemplate, weekendTemplate];

/** シンプル表示。ポジションと必要人数を見せず、「○」の付け外しだけを行う。 */
export const dateOnlyBoardSimpleArgs = {
  shopId: dateOnlyBoardShopId,
  staffs,
  positions: dateOnlyBoardPositions,
  initialShifts: shifts,
  dates: dateOnlyBoardDates,
  timeRange: { start: 9, end: 22, unit: 30 },
  holidays: ["2026-12-03"],
  submissionPattern: { kind: "dateOnly" },
  dateNotes: [
    { staffId: "yamaguchi", date: "2026-12-01", note: "朝早くから入れます。10時までに上がれると助かります" },
    { staffId: "yamaguchi", date: "2026-12-02", note: "午後からなら入れます" },
    { staffId: "kato", date: "2026-12-06", note: "法事のため終日入れません" },
    { staffId: "sato", date: "2026-12-04", note: "ほかの日と交代でも大丈夫です" },
    {
      staffId: "hayashi",
      date: "2026-12-02",
      note: "短めの時間だと助かります。できれば15時までで、難しければ相談させてください。学校の行事があるので遅くとも16時には出たいです",
    },
  ],
} satisfies ShiftFormArgs;

/** くわしく表示。ポジションの色のピルと、日ごとの「配置/必要」、週の充足率を出す。1週目の充足率は41%である。 */
export const dateOnlyBoardDetailArgs = {
  ...dateOnlyBoardSimpleArgs,
  staffing: buildStaffing({
    templates: dateOnlyBoardTemplates,
    days: dateOnlyBoardDates.map((date) => {
      // 2週目の12/7は、必要人数のない日。
      if (date === "2026-12-07") return unsetDay(date);
      return templateDay(date, date === "2026-12-05" || date === "2026-12-06" ? weekendTemplate : weekdayTemplate);
    }),
  }),
  initialDetailMode: true,
  onDetailModeChange: () => {},
  detailActions: { onOpenSetup: () => {}, dayStaffingActions: { onApplyTemplate: async () => true, isPending: false } },
} satisfies ShiftFormArgs;

/** くわしく表示で、1週目の12/2だけ必要人数がない。ポジションの人数のない日も、テンプレートの位置をほかの日とそろえる。 */
export const dateOnlyBoardDayWithoutTemplateArgs = {
  ...dateOnlyBoardDetailArgs,
  staffing: buildStaffing({
    templates: dateOnlyBoardTemplates,
    days: dateOnlyBoardDates.map((date) => {
      if (date === "2026-12-02") return unsetDay(date);
      return templateDay(date, date === "2026-12-05" || date === "2026-12-06" ? weekendTemplate : weekdayTemplate);
    }),
  }),
} satisfies ShiftFormArgs;

/** 前のStoryで覚えたポジションを消す。空きのセルへ入るポジションを、店舗の先頭のポジションから始めるためである。 */
export const clearRememberedDateOnlyBoardPosition = () => {
  localStorage.removeItem(lastPositionStorageKey(dateOnlyBoardShopId));
};
