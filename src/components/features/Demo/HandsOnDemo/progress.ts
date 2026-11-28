// シフト表の案内を、利用者の操作の結果から進める。手順の番号は、そのときの下書きから決める。
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import { isLegacyCompatibleWorkPosition } from "@/src/domains/shift/positions";
import { formatShiftClockTime, timeToMinutes } from "@/src/domains/shift/time";
import type { ShiftData } from "@/src/domains/shift/types";
import {
  BREAK_STAFF_ID,
  BREAK_TIME,
  HANDS_ON_KITCHEN_ID,
  HANDS_ON_POSITIONS,
  type HandsOnScenario,
  runHandsOnAutoCreate,
  SATO_REQUEST_TIME,
  SATO_STAFF_ID,
} from "./scenario";

export type HandsOnVariant = "simple" | "detail";

type StepInput = {
  variant: HandsOnVariant;
  shifts: ShiftData[];
  /** シフト表で最初に見せる日。手順はこの日の操作だけで判定する。 */
  day1: string;
  /** 「点線の枠が希望です」を読み、「次へ」を押した。 */
  acknowledged: boolean;
  /** くわしく表示で、自動作成を終えた。 */
  autoCreated: boolean;
};

const findShift = (shifts: ShiftData[], staffId: string, date: string) =>
  shifts.find((shift) => shift.staffId === staffId && shift.date === date);

const workSegments = (shift: ShiftData | undefined) => shift?.positions.filter(isLegacyCompatibleWorkPosition) ?? [];

/**
 * いま案内する手順の番号を返す。
 * シンプル：0 希望を確かめる、1 勤務時間を設定する、2 休憩を入れる、3 確定する。
 * くわしく：0 希望を確かめる、1 勤務時間を設定する、2 ポジションを変える、3 自動で作る、4 確定する。
 */
export const getHandsOnStepIndex = ({ variant, shifts, day1, acknowledged, autoCreated }: StepInput): number => {
  if (!acknowledged) return 0;

  if (variant === "detail") {
    // 自動作成は手で入れた勤務も作り直すため、作り終えたら確定へ進める。
    if (autoCreated) return 4;
    const satoWork = workSegments(findShift(shifts, SATO_STAFF_ID, day1));
    if (satoWork.length === 0) return 1;
    if (!satoWork.some((segment) => segment.positionId === HANDS_ON_KITCHEN_ID)) return 2;
    return 3;
  }

  if (workSegments(findShift(shifts, SATO_STAFF_ID, day1)).length === 0) return 1;
  const breaks = findShift(shifts, BREAK_STAFF_ID, day1)?.breaks ?? [];
  if (breaks.length === 0) return 2;
  return 3;
};

/**
 * シフト表の手順を終えたときの下書き。シフト表を通らずに、上の段から「確定シフトを送る」へ移ったときに送る。
 * シンプル：佐藤さんの初日に希望どおりの勤務を入れ、渡辺さんの初日に休憩を入れる。
 * くわしく：最後の手順の自動作成で手で入れた勤務も作り直すため、自動作成した下書きにする。休憩は、自動作成の既定どおり入れる。
 */
export const buildHandsOnCompletedShifts = (variant: HandsOnVariant, scenario: HandsOnScenario): ShiftData[] => {
  if (variant === "detail") return runHandsOnAutoCreate(scenario, scenario.requests, true);

  const day1 = scenario.dates[0];
  const hall = HANDS_ON_POSITIONS[0];
  return scenario.simpleInitialShifts.map((shift) => {
    if (shift.date !== day1) return shift;
    if (shift.staffId === SATO_STAFF_ID) {
      return {
        ...shift,
        positions: [
          {
            id: `seg-${shift.staffId}-${day1}`,
            positionId: hall.id,
            positionName: hall.name,
            color: hall.color,
            start: SATO_REQUEST_TIME.start,
            end: SATO_REQUEST_TIME.end,
          },
        ],
      };
    }
    if (shift.staffId === BREAK_STAFF_ID) return { ...shift, breaks: [{ ...BREAK_TIME }] };
    return shift;
  });
};

export type ConfirmRow = {
  /** 「11/30(月)」の形。 */
  dateLabel: string;
  /** 「17:00-22:00」の形。勤務がない日はnull。 */
  timeLabel: string | null;
};

/** 確定したシフトのお知らせに並べる、その人の日ごとの勤務。製品のLINEと同じく、最初の開始から最後の終了までを出す。 */
export const buildConfirmRows = (shifts: ShiftData[], staffId: string, dates: string[]): ConfirmRow[] =>
  dates.map((date) => {
    const work = workSegments(findShift(shifts, staffId, date));
    if (work.length === 0) return { dateLabel: formatDateWithWeekday(date), timeLabel: null };
    const start = work.reduce(
      (min, segment) => (timeToMinutes(segment.start) < timeToMinutes(min) ? segment.start : min),
      work[0].start,
    );
    const end = work.reduce(
      (max, segment) => (timeToMinutes(segment.end) > timeToMinutes(max) ? segment.end : max),
      work[0].end,
    );
    return {
      dateLabel: formatDateWithWeekday(date),
      timeLabel: `${formatShiftClockTime(start)}-${formatShiftClockTime(end)}`,
    };
  });
