import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { countShiftTypeAssignments, type ShiftTypeOptionLike } from "@/src/domains/shift/shiftTypeAssignments";
import {
  buildShiftTypeCells,
  isShiftTypeRestRequestWithoutWork,
  type ShiftTypeCellDot,
} from "@/src/domains/shift/shiftTypeCells";
import { calculateShiftTypeFulfillmentPercent } from "@/src/domains/shift/staffingFulfillment";
import { timeToMinutes } from "@/src/domains/shift/time";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { getOrderedShiftTypeOptions } from "@/src/domains/shop/submissionPattern";
import { buildAssignmentPillFields } from "./assignmentCellPresentation";
import { formatShiftTypeTimeRange } from "./shiftTypeDisplay";
import {
  type DayStaffingView,
  type PositionStaffingCountPresentation,
  selectShownStaffingPositions,
} from "./staffingPresentation";
import { buildStaffNamesLabel } from "./staffNamesLabel";

// パターン選択の日別の表（PCとスマートフォン）に出す内容。
// セルは「希望の輪」と「割り当てのピル」の2つの層で示し、色はポジションと状態だけに使う。

export type ShiftTypeDailyOptionPresentation = {
  key: string;
  option: ShiftTypeOptionLike;
  name: string;
  /** 「9:00〜15:00」 */
  timeLabel: string;
  /** 「9–15」。幅の狭いスマートフォンの見出しに使う。 */
  shortTimeLabel: string;
  /** 「3人」 */
  countLabel: string;
};

export type ShiftTypeDailyCellPresentation = {
  key: string;
  option: ShiftTypeOptionLike;
  /** 希望の輪を出すか。 */
  showsRequestRing: boolean;
  assigned: boolean;
  /** ピルの中身。ポジションを塗り分ける表示ではポジション名、それ以外は「○」。割り当てがなければnull。 */
  pillLabel: string | null;
  /** 入っている勤務のポジション。割り当てがなければnull。 */
  positionId: string | null;
  /** ピルを塗るポジションの色。ポジションを塗り分けない表示と、割り当てのないセルではnull。 */
  positionColor: string | null;
  dot: ShiftTypeCellDot | null;
  /** 点の理由。点がなければ空。 */
  noticeTexts: string[];
  /** ボタンの名前。「田中 太郎 早番 勤務あり」。既存のテストがこの形で探すため、末尾を変えない。 */
  ariaLabel: string;
  /** 名前に添える説明。希望の有無と、点の理由。なければnull。 */
  ariaDescription: string | null;
};

export type ShiftTypeDailyRowPresentation = {
  key: string;
  staff: StaffType;
  /** 表示中の日の勤務。スタッフ名に添える「仮」に使う。 */
  shift: ShiftData | undefined;
  staffName: string;
  isNameMuted: boolean;
  /** 名前に「未提出」を添えるか。 */
  isUnsubmitted: boolean;
  cells: ShiftTypeDailyCellPresentation[];
};

/** 表の下にまとめる「休み希望」。割り当てのない休み希望の人がいなければnull。 */
export type ShiftTypeDailyRestGroupPresentation = {
  /** 「休み希望 4人」 */
  label: string;
  /** 見出しの横に薄く出す名前。「中村・高橋・伊藤・ほか1人」 */
  namesLabel: string;
  rows: ShiftTypeDailyRowPresentation[];
};

export type ShiftTypeDailyPresentation = {
  options: ShiftTypeDailyOptionPresentation[];
  rows: ShiftTypeDailyRowPresentation[];
  restGroup: ShiftTypeDailyRestGroupPresentation | null;
};

const formatShortTime = (time: string): string => {
  const minutes = timeToMinutes(time);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  // 24時ちょうどは「24」、それより後は「翌5」のように書く。
  const hourLabel = hour > 24 ? `翌${hour - 24}` : `${hour}`;
  return minute === 0 ? hourLabel : `${hourLabel}:${String(minute).padStart(2, "0")}`;
};

export const formatShiftTypeShortTimeRange = (option: Pick<ShiftTypeOptionLike, "startTime" | "endTime">): string =>
  `${formatShortTime(option.startTime)}–${formatShortTime(option.endTime)}`;

export function buildShiftTypeDailyPresentation({
  submissionPattern,
  shifts,
  staffs,
  shiftByStaffId,
  isConfirmedDisplay,
  usesPositionColors = false,
  hasNote = () => false,
}: {
  submissionPattern: ShiftSubmissionPattern;
  shifts: ShiftData[];
  staffs: StaffType[];
  shiftByStaffId: ReadonlyMap<string, ShiftData | undefined>;
  /** スタッフ向けの確定シフトの表示。希望の輪、点、休み希望のまとまりを出さない。 */
  isConfirmedDisplay: boolean;
  /** ポジションを塗り分ける表示（くわしく表示で、ポジションが2つ以上）かどうか。 */
  usesPositionColors?: boolean;
  /** その日の連絡事項がある人か。連絡事項のある休み希望の人は、まとめずに通常の行へ出す。 */
  hasNote?: (staffId: string) => boolean;
}): ShiftTypeDailyPresentation {
  const options = getOrderedShiftTypeOptions(submissionPattern);
  const countsByOptionId = countShiftTypeAssignments(
    shifts,
    options.map((option) => option.id),
  );

  const toRow = (staff: StaffType): ShiftTypeDailyRowPresentation => {
    const shift = shiftByStaffId.get(staff.id);
    return {
      key: staff.id,
      staff,
      shift,
      staffName: staff.name,
      isNameMuted: !staff.isSubmitted,
      isUnsubmitted: !isConfirmedDisplay && !staff.isSubmitted,
      cells: buildShiftTypeCells({ shift, staff, options }).map((cell) => {
        const pill = buildAssignmentPillFields(cell, { isConfirmedDisplay, usesPositionColors });
        const descriptions = [...(pill.showsRequestRing ? ["希望あり"] : []), ...pill.noticeTexts];
        return {
          key: cell.option.id,
          option: cell.option,
          ...pill,
          ariaLabel: `${staff.name} ${cell.option.name} ${pill.assigned ? "勤務あり" : "勤務なし"}`,
          ariaDescription: descriptions.length > 0 ? descriptions.join("、") : null,
        };
      }),
    };
  };

  const isRest = (staff: StaffType): boolean =>
    !isConfirmedDisplay &&
    isShiftTypeRestRequestWithoutWork({ shift: shiftByStaffId.get(staff.id), staff, hasNote: hasNote(staff.id) });
  const restStaffs = staffs.filter(isRest);

  return {
    options: options.map((option) => ({
      key: option.id,
      option,
      name: option.name,
      timeLabel: formatShiftTypeTimeRange(option),
      shortTimeLabel: formatShiftTypeShortTimeRange(option),
      countLabel: `${countsByOptionId.get(option.id) ?? 0}人`,
    })),
    rows: staffs.filter((staff) => !isRest(staff)).map(toRow),
    restGroup:
      restStaffs.length > 0
        ? {
            label: `休み希望 ${restStaffs.length}人`,
            namesLabel: buildStaffNamesLabel(restStaffs.map((staff) => staff.name)),
            rows: restStaffs.map(toRow),
          }
        : null,
  };
}

// ==========================================
// 充足（くわしく表示）
// ==========================================
export type ShiftTypeStaffingPresentation = {
  /** その日の充足率（%）。必要人数が1つもない日はnull。 */
  percent: number | null;
  /** 100%のときtrue。文字の色を決める。 */
  isFulfilled: boolean;
  /** 人数を出すポジション。その日に必要人数があるか、だれかが入っているポジションを、設定の並び順で持つ。 */
  positions: Array<{ positionId: string; name: string; color: string }>;
  /** 勤務パターンのIDから、positionsと同じ並びの「配置/必要」を引く。 */
  countsByOptionId: ReadonlyMap<string, PositionStaffingCountPresentation[]>;
};

const SHIFT_TYPE_SLOT_ID_PREFIX = "shiftType:";

/**
 * その日の人数（DayStaffingView）を、勤務パターンの見出しとスマートフォンの充足の表に出す形へ直す。
 * 出すポジションは日ごとにそろえ、勤務パターンによって並びと数を変えない。状態が変わっても位置を動かさないためである。
 */
export const buildShiftTypeStaffingPresentation = (
  view: DayStaffingView,
  options: readonly ShiftTypeOptionLike[],
): ShiftTypeStaffingPresentation => {
  const slotByOptionId = new Map(
    view.slots.flatMap((slot) =>
      slot.id.startsWith(SHIFT_TYPE_SLOT_ID_PREFIX)
        ? [[slot.id.slice(SHIFT_TYPE_SLOT_ID_PREFIX.length), slot] as const]
        : [],
    ),
  );
  const slots = options.flatMap((option) => {
    const slot = slotByOptionId.get(option.id);
    return slot ? [{ option, slot }] : [];
  });
  const { positions, toCounts } = selectShownStaffingPositions(slots.map(({ slot }) => slot));

  const percent = calculateShiftTypeFulfillmentPercent(
    slots.map(({ option, slot }) => ({
      startTime: option.startTime,
      endTime: option.endTime,
      positions: slot.positions,
    })),
  );
  return {
    percent,
    // 多い分で100%を超えた日も、満たした日として同じ色で出す。
    isFulfilled: percent !== null && percent >= 100,
    positions,
    countsByOptionId: new Map(slots.map(({ option, slot }) => [option.id, toCounts(slot)])),
  };
};

/** 名前の右の確認事項に出す文言。勤務パターンごとの理由を、勤務パターン名を付けて並べる。 */
export const toShiftTypeWarningMessages = (row: ShiftTypeDailyRowPresentation): string[] =>
  row.cells
    .filter((cell) => cell.dot !== null)
    .flatMap((cell) => cell.noticeTexts.map((text) => `${cell.option.name}：${text}`));
