// 体験デモ「シフトを作ってみよう！」の架空の店舗、スタッフ、募集。
// 募集の期間は開いた日の翌月の1日から2週間にし、日付が過去にならないようにする。

import { getLegalDocumentsForAudience } from "@/convex/legal/documents";
import { buildAutoAssignments } from "@/convex/shiftBoard/autoCreate/buildAutoAssignments";
import type { AutoCreateInput } from "@/convex/shiftBoard/autoCreate/types";
import type { ShiftFormStaffing } from "@/src/components/features/Shift/ShiftForm";
import type { SubmissionData } from "@/src/components/features/StaffSubmit";
import { applyAutoAssignments } from "@/src/domains/shift/autoAssignments";
import { addDays, formatDateShort, formatDateWithWeekday, getDayOfWeek, todayJST } from "@/src/domains/shift/date";
import type { PositionType, ShiftData, StaffType, TimeRange } from "@/src/domains/shift/types";

export const HANDS_ON_SHOP_NAME = "居酒屋シフトリ";
const PERIOD_DAYS = 14;

const HALL_ID = "position-hall";
const KITCHEN_ID = "position-kitchen";

export const HANDS_ON_POSITIONS: PositionType[] = [
  { id: HALL_ID, name: "ホール", color: "#60a5fa", isDefault: true },
  { id: KITCHEN_ID, name: "キッチン", color: "#fb923c", isDefault: false },
];
export const HANDS_ON_KITCHEN_ID = KITCHEN_ID;

const PATTERN = { kind: "time", startTime: "10:00", endTime: "23:00" } as const;
export const HANDS_ON_SUBMISSION_PATTERN = PATTERN;
export const HANDS_ON_TIME_RANGE: TimeRange = { start: 10, end: 23, unit: 30 };

/** 操作の対象は、全体を通して佐藤さんにそろえる。1章で希望を出し、2章で勤務を入れ、確定のお知らせが届く。 */
export const SATO_STAFF_ID = "s9";
export const SATO_STAFF_NAME = "佐藤 大輔";
/** 佐藤さんが希望を出す日（募集の初日から数えた日）と時間。1章の提出画面で、この3日を同じ時間で出す。 */
export const SATO_REQUEST_DAY_INDEXES = [0, 2, 4] as const;
export const SATO_REQUEST_TIME = { start: "17:00", end: "22:00" } as const;
/** 2章で休憩を入れる渡辺さんと、入れる休憩の時間。渡辺さんは、初日には曜日によらず、この時間を含む希望を持つ。 */
export const BREAK_STAFF_ID = "s1";
const BREAK_STAFF_FIRST_DAY_REQUEST = ["10:00", "17:00"] as const;
export const BREAK_TIME = { start: "12:00", end: "13:00" } as const;

type Request = readonly [start: string, end: string] | null;
type StaffSkill = NonNullable<StaffType["positionSkills"]>[number];
type StaffSeed = {
  id: string;
  name: string;
  skills: StaffSkill[];
  /** 月曜から日曜までの希望。佐藤さんは日付で決めるため持たない。 */
  week?: readonly Request[];
};

const off = null;
const STAFF_SEEDS: StaffSeed[] = [
  {
    id: BREAK_STAFF_ID,
    name: "渡辺 優子",
    skills: [],
    week: [
      ["10:00", "17:00"],
      ["10:00", "17:00"],
      ["10:00", "17:00"],
      ["10:00", "17:00"],
      ["10:00", "17:00"],
      off,
      off,
    ],
  },
  {
    id: "s2",
    name: "鈴木 太郎",
    skills: [],
    week: [
      ["11:00", "22:00"],
      off,
      ["11:00", "22:00"],
      ["11:00", "22:00"],
      ["17:00", "22:00"],
      ["11:00", "22:00"],
      ["11:00", "17:00"],
    ],
  },
  {
    id: "s3",
    name: "高橋 翔太",
    skills: [{ positionId: KITCHEN_ID, level: "unavailable" }],
    week: [
      off,
      ["17:00", "22:00"],
      ["17:00", "22:00"],
      ["17:00", "22:00"],
      ["17:00", "22:00"],
      ["17:00", "22:00"],
      ["17:00", "22:00"],
    ],
  },
  {
    id: "s4",
    name: "中村 真理",
    skills: [{ positionId: KITCHEN_ID, level: "unavailable" }],
    week: [
      ["11:00", "15:00"],
      ["11:00", "15:00"],
      ["11:00", "15:00"],
      ["11:00", "15:00"],
      ["11:00", "15:00"],
      ["11:00", "22:00"],
      off,
    ],
  },
  {
    id: "s5",
    name: "加藤 美穂",
    skills: [{ positionId: KITCHEN_ID, level: "newcomer" }],
    week: [
      ["16:00", "22:00"],
      off,
      ["16:00", "22:00"],
      off,
      ["16:00", "22:00"],
      ["16:00", "22:00"],
      ["16:00", "22:00"],
    ],
  },
  {
    id: "s6",
    name: "伊藤 健一",
    skills: [{ positionId: HALL_ID, level: "unavailable" }],
    week: [
      ["10:00", "18:00"],
      ["10:00", "18:00"],
      ["10:00", "18:00"],
      ["10:00", "18:00"],
      ["10:00", "18:00"],
      ["10:00", "16:00"],
      off,
    ],
  },
  {
    id: "s7",
    name: "山田 美咲",
    skills: [],
    week: [
      off,
      off,
      ["12:00", "22:00"],
      ["12:00", "22:00"],
      ["12:00", "22:00"],
      ["12:00", "22:00"],
      ["12:00", "22:00"],
    ],
  },
  {
    id: "s8",
    name: "田中 次郎",
    skills: [{ positionId: HALL_ID, level: "unavailable" }],
    week: [
      ["17:00", "22:00"],
      ["17:00", "22:00"],
      off,
      ["17:00", "22:00"],
      ["17:00", "22:00"],
      ["11:00", "22:00"],
      ["11:00", "22:00"],
    ],
  },
  { id: SATO_STAFF_ID, name: SATO_STAFF_NAME, skills: [{ positionId: HALL_ID, level: "newcomer" }] },
  {
    id: "s10",
    name: "小林 あかり",
    skills: [],
    week: [
      ["17:00", "21:00"],
      ["17:00", "21:00"],
      ["17:00", "21:00"],
      ["17:00", "21:00"],
      off,
      ["15:00", "22:00"],
      ["15:00", "22:00"],
    ],
  },
];

type Bar = { positionId: string; startTime: string; endTime: string };
const bars = (specs: Array<[positionId: string, startTime: string, endTime: string, count?: number]>): Bar[] =>
  specs.flatMap(([positionId, startTime, endTime, count = 1]) =>
    Array.from({ length: count }, () => ({ positionId, startTime, endTime })),
  );

const WEEKDAY_TEMPLATE = {
  id: "template-weekday",
  name: "平日",
  bars: bars([
    [HALL_ID, "11:00", "22:00"],
    [HALL_ID, "11:30", "14:00"],
    [HALL_ID, "17:00", "21:00"],
    [KITCHEN_ID, "11:00", "22:00"],
    [KITCHEN_ID, "17:30", "21:00"],
  ]),
};

const WEEKEND_TEMPLATE = {
  id: "template-weekend",
  name: "土日",
  bars: bars([
    [HALL_ID, "11:00", "22:00", 2],
    [HALL_ID, "17:00", "21:00"],
    [KITCHEN_ID, "11:00", "22:00"],
    [KITCHEN_ID, "11:30", "14:00"],
    [KITCHEN_ID, "17:00", "21:00"],
  ]),
};

/** 月曜を0、日曜を6にした曜日の番号。 */
const mondayBasedWeekday = (date: string) => (getDayOfWeek(date) + 6) % 7;

/** 開いた日の翌月の1日を、募集の初日にする。 */
export const getHandsOnPeriodStart = (today: string = todayJST()): string => {
  const [year, month] = today.split("-").map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
};

export type HandsOnScenario = {
  dates: string[];
  /** 「11/30(月)〜12/13(日)」の形。お知らせの本文に使う。 */
  periodLabel: string;
  /** 募集を開始するボタンの文言。 */
  startLabel: string;
  /** 提出期限。お知らせに「11/29(日) 23:59」の形で出す。 */
  deadline: string;
  staffs: StaffType[];
  /** スタッフが出した希望。勤務はまだ入っていない。 */
  requests: ShiftData[];
  /** シンプル表示の始まり。希望から作った勤務を入れ、佐藤さんの初日だけは希望の点線の枠を残す。 */
  simpleInitialShifts: ShiftData[];
  staffing: ShiftFormStaffing;
};

const requestOf = (seed: StaffSeed, date: string, dayIndex: number): Request => {
  // 初日は月によって曜日が変わるため、休憩を入れる渡辺さんには、休みの曜日でも勤務できる希望を持たせる。
  if (seed.id === BREAK_STAFF_ID && dayIndex === 0) return BREAK_STAFF_FIRST_DAY_REQUEST;
  if (seed.id === SATO_STAFF_ID) {
    return (SATO_REQUEST_DAY_INDEXES as readonly number[]).includes(dayIndex)
      ? [SATO_REQUEST_TIME.start, SATO_REQUEST_TIME.end]
      : null;
  }
  return seed.week?.[mondayBasedWeekday(date)] ?? null;
};

export const buildHandsOnScenario = (periodStart: string): HandsOnScenario => {
  const dates = Array.from({ length: PERIOD_DAYS }, (_, index) => addDays(periodStart, index));
  const first = dates[0];
  const last = dates[dates.length - 1];

  const staffs: StaffType[] = STAFF_SEEDS.map((seed, index) => ({
    id: seed.id,
    name: seed.name,
    isSubmitted: true,
    displayOrder: index,
    positionSkills: seed.skills,
  }));

  const requests: ShiftData[] = STAFF_SEEDS.flatMap((seed) =>
    dates.flatMap((date, dayIndex) => {
      const request = requestOf(seed, date, dayIndex);
      if (!request) return [];
      return [
        {
          id: `shift-${seed.id}-${date}`,
          staffId: seed.id,
          staffName: seed.name,
          date,
          requestedTime: { start: request[0], end: request[1] },
          positions: [],
        },
      ];
    }),
  );

  const hall = HANDS_ON_POSITIONS[0];
  const simpleInitialShifts: ShiftData[] = requests.map((shift) => {
    const leavesRequestOnly = shift.staffId === SATO_STAFF_ID && shift.date === first;
    if (!shift.requestedTime || leavesRequestOnly) return shift;
    return {
      ...shift,
      positions: [
        {
          id: `seg-${shift.staffId}-${shift.date}`,
          positionId: hall.id,
          positionName: hall.name,
          color: hall.color,
          start: shift.requestedTime.start,
          end: shift.requestedTime.end,
        },
      ],
    };
  });

  const staffing: ShiftFormStaffing = {
    breakRule: null,
    isLocked: false,
    templates: [
      { id: WEEKDAY_TEMPLATE.id, name: WEEKDAY_TEMPLATE.name },
      { id: WEEKEND_TEMPLATE.id, name: WEEKEND_TEMPLATE.name },
    ],
    days: dates.map((date) => {
      const template = mondayBasedWeekday(date) >= 5 ? WEEKEND_TEMPLATE : WEEKDAY_TEMPLATE;
      return {
        date,
        source: "weekday",
        templateId: template.id,
        templateName: template.name,
        requirements: { kind: "time", bars: template.bars },
      };
    }),
  };

  return {
    dates,
    periodLabel: `${formatDateWithWeekday(first)}〜${formatDateWithWeekday(last)}`,
    startLabel: `${formatDateShort(first)}〜${formatDateShort(last)}の募集を開始`,
    deadline: addDays(first, -1),
    staffs,
    requests,
    simpleInitialShifts,
    staffing,
  };
};

/** 製品と同じ手順で自動作成し、下書きを置き換える。手で入れた勤務も作り直す。 */
export const runHandsOnAutoCreate = (
  scenario: HandsOnScenario,
  current: ShiftData[],
  includesBreaks: boolean,
): ShiftData[] => {
  const input: AutoCreateInput = {
    pattern: PATTERN,
    periodStart: scenario.dates[0],
    dates: scenario.dates,
    staffs: scenario.staffs.map((staff) => ({ id: staff.id, positionSkills: staff.positionSkills ?? [] })),
    positionIds: HANDS_ON_POSITIONS.map((position) => position.id),
    requestedSlots: scenario.requests.flatMap((shift) =>
      shift.requestedTime
        ? [
            {
              staffId: shift.staffId,
              date: shift.date,
              startTime: shift.requestedTime.start,
              endTime: shift.requestedTime.end,
            },
          ]
        : [],
    ),
    requestedDates: [],
    days: scenario.staffing.days.map((day) => ({ date: day.date, requirements: day.requirements })),
    history: null,
    includesBreaks,
  };
  const result = buildAutoAssignments(input);
  return applyAutoAssignments({ shifts: current, created: result.shifts, positions: HANDS_ON_POSITIONS });
};

/** 1章で、佐藤さんが開く提出画面のデータ。まだ何も出していない状態から始める。 */
export const buildStaffSubmissionData = (scenario: HandsOnScenario): SubmissionData => ({
  shopName: HANDS_ON_SHOP_NAME,
  staffName: SATO_STAFF_NAME,
  periodStart: scenario.dates[0],
  periodEnd: scenario.dates[scenario.dates.length - 1],
  deadline: scenario.deadline,
  shopClosedDates: [],
  submissionPattern: PATTERN,
  isBeforeDeadline: true,
  hasSubmitted: false,
  existingRequests: [],
  existingSelection: { kind: "time", requests: [] },
  legalConsentRequired: false,
  legalDocuments: getLegalDocumentsForAudience("staff"),
  timeRange: { startTime: PATTERN.startTime, endTime: PATTERN.endTime },
  previousWeeklyPattern: null,
  previousDateOnlyPattern: null,
});
