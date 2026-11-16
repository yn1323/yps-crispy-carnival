import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { getEditableEndMinutes, getEditableStartMinutes } from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import type { NewcomerStaffIdsByPositionId } from "@/src/domains/shift/positionSkills";
import {
  buildPositionStaffingBands,
  countStaffingByDay,
  countStaffingByShiftType,
  type StaffingSlotCount,
} from "@/src/domains/shift/staffing";
import { formatShiftClockTimeRange, timeToMinutes } from "@/src/domains/shift/time";
import type {
  PositionType,
  ShiftData,
  StaffingBar,
  StaffingSlot,
  StaffType,
  TimeRange,
} from "@/src/domains/shift/types";
import type { ShiftFormDayRequirements, ShiftFormStaffing, ShiftFormStaffingDay } from "./types";

// その日の「人数 / 必要」を、画面へ出す形にまとめる。

// ==========================================
// 人数と過不足の1件分
// ==========================================
/** 過不足の状態。未設定（unset）は必要人数がなく、過不足を出さない。 */
export type StaffingTone = "shortage" | "excess" | "even" | "unset";

export type StaffingCountView = {
  count: number;
  required: number | null;
  tone: StaffingTone;
  /** 1人以上いて、全員が新人。 */
  isNewcomerOnly: boolean;
  /** 「2/3 ▲1」「2/1 ＋1」「3/3」。未設定は人数だけの「2」。 */
  label: string;
  /** 狭い場所に出す。過不足は差だけの「▲1」「＋1」、ちょうどと未設定は人数だけ。 */
  compactLabel: string;
};

export const buildStaffingCountView = (input: {
  count: number;
  required: number | null;
  isNewcomerOnly: boolean;
}): StaffingCountView => {
  const { count, required, isNewcomerOnly } = input;
  if (required === null) {
    return { count, required, tone: "unset", isNewcomerOnly, label: `${count}`, compactLabel: `${count}` };
  }
  const base = `${count}/${required}`;
  if (count < required) {
    const diff = `▲${required - count}`;
    return { count, required, tone: "shortage", isNewcomerOnly, label: `${base} ${diff}`, compactLabel: diff };
  }
  if (count > required) {
    const diff = `＋${count - required}`;
    return { count, required, tone: "excess", isNewcomerOnly, label: `${base} ${diff}`, compactLabel: diff };
  }
  return { count, required, tone: "even", isNewcomerOnly, label: base, compactLabel: `${count}` };
};

/** 過不足の色。ポジションの色と混ぜないよう、地色、枠の線の種類、文字色で示す。 */
export const STAFFING_TONE_STYLES: Record<
  StaffingTone,
  { bg?: string; borderColor: string; borderStyle: "solid" | "dashed"; color: string; fontWeight: number }
> = {
  shortage: { bg: "red.50", borderColor: "red.300", borderStyle: "solid", color: "red.700", fontWeight: 700 },
  excess: { bg: "blue.50", borderColor: "blue.300", borderStyle: "dashed", color: "blue.700", fontWeight: 600 },
  even: { borderColor: "transparent", borderStyle: "solid", color: "gray.600", fontWeight: 600 },
  unset: { borderColor: "transparent", borderStyle: "solid", color: "gray.600", fontWeight: 600 },
};

const describeTone = (view: StaffingCountView): string | null => {
  if (view.required === null) return null;
  if (view.tone === "shortage") return `${view.required - view.count}人足りません`;
  if (view.tone === "excess") return `${view.count - view.required}人多くなっています`;
  return null;
};

/** 押したときの欄と読み上げに出す、人数の説明。 */
export const describeStaffingCount = (view: StaffingCountView): string[] => [
  view.required === null ? `人数 ${view.count}人` : `人数 ${view.count}人 / 必要 ${view.required}人`,
  ...[describeTone(view), view.isNewcomerOnly ? "新人だけの時間です" : null].flatMap((line) => (line ? [line] : [])),
];

// ==========================================
// パターン選択と日付選択の区切り
// ==========================================
export type StaffingPositionView = StaffingCountView & {
  positionId: string;
  name: string;
  color: string;
};

export type StaffingSlotView = {
  id: string;
  label: string;
  total: number;
  positions: StaffingPositionView[];
  hasShortage: boolean;
  hasExcess: boolean;
};

// ==========================================
// 時間指定の帯
// ==========================================
export type StaffingBandSegmentView = StaffingCountView & {
  key: string;
  startMinutes: number;
  endMinutes: number;
  /** 「11:00–14:00」 */
  timeLabel: string;
  /** titleと読み上げに使う全文。「ホール 11:00–14:00 2/3 ▲1、新人だけ」 */
  description: string;
};

export type StaffingBandView = {
  positionId: string;
  name: string;
  color: string;
  /** その日にバーが1本でもあるポジション。falseのポジションは人数だけを出す。 */
  isConfigured: boolean;
  /** 足りない時間か、多い時間がある。 */
  hasImbalance: boolean;
  /** 表示する区間。だれもいなくて必要人数もない区間は含めない。 */
  segments: StaffingBandSegmentView[];
};

// ==========================================
// その日の型
// ==========================================
export type DayTemplateView = {
  /** メニューに出す名前。型の名前、「（この日だけ変更）」、「未設定」のいずれか。 */
  label: string;
  /** いま当たっている型。型の一覧でチェックを付ける。 */
  templateId: string | null;
  /** いま当たっている型の名前。その日だけの変更の説明に使う。 */
  templateName: string | null;
  /** その日だけ人数を変えている。 */
  isCustom: boolean;
  /** その日だけの指定がある。「曜日の設定に戻す」を出す。 */
  isDateSpecific: boolean;
};

const UNSET_TEMPLATE_LABEL = "未設定";
const CUSTOM_TEMPLATE_LABEL = "この日だけ変更";

/** その日の型のメニューに出す名前と、選べる操作の元になる状態を返す。 */
export const buildDayTemplateView = (day: ShiftFormStaffingDay | undefined): DayTemplateView => {
  const unset: DayTemplateView = {
    label: UNSET_TEMPLATE_LABEL,
    templateId: null,
    templateName: null,
    isCustom: false,
    isDateSpecific: false,
  };
  if (!day) return unset;

  const isDateSpecific = day.source === "dateCustom" || day.source === "dateTemplate";
  // その日だけ人数を変えた日。確定済みは、型の名前を持たずに必要人数だけが残っている日がこれにあたる。
  const isCustom = day.source === "dateCustom" || (day.source === "confirmed" && !day.templateName);
  if (day.requirements === null) return { ...unset, isDateSpecific };
  if (isCustom) {
    return {
      label: day.templateName ? `${day.templateName}（${CUSTOM_TEMPLATE_LABEL}）` : CUSTOM_TEMPLATE_LABEL,
      templateId: null,
      templateName: day.templateName,
      isCustom: true,
      isDateSpecific,
    };
  }
  return {
    label: day.templateName ?? UNSET_TEMPLATE_LABEL,
    templateId: day.templateId,
    templateName: day.templateName,
    isCustom: false,
    isDateSpecific,
  };
};

// ==========================================
// その日の人数
// ==========================================
export type DayStaffingView = {
  date: string;
  template: DayTemplateView;
  /** 必要人数を1つでも持つ日。falseの日は人数だけを出し、未設定と伝える。 */
  hasRequirements: boolean;
  /** パターン選択と日付選択の区切り。時間指定では空。 */
  slots: StaffingSlotView[];
  /** 時間指定の、ポジションごとの帯。パターン選択と日付選択では空。 */
  bands: StaffingBandView[];
  hasShortage: boolean;
  hasExcess: boolean;
  /** 不足している箇所の数。時間指定は区間、パターン選択と日付選択は区切りを数える。 */
  shortageCount: number;
};

type BuildInput = {
  date: string;
  // その日の勤務（シフト対象で在籍しているスタッフ分）
  shifts: readonly ShiftData[];
  positions: readonly PositionType[];
  submissionPattern: ShiftSubmissionPattern;
  timeRange: TimeRange;
  // サーバーが解決した、その日の必要人数。渡さない日は未設定として扱う。
  day: ShiftFormStaffingDay | undefined;
  // ポジションごとの、新人のstaffId
  newcomerStaffIdsByPositionId?: NewcomerStaffIdsByPositionId;
};

/**
 * その日の人数に数える勤務を返す。
 * 数えるのは、いま在籍しているシフト対象のスタッフの勤務だけである。削除済みのスタッフに残った勤務は数えない。
 */
export const selectStaffingShifts = (
  shifts: readonly ShiftData[],
  staffs: ReadonlyArray<Pick<StaffType, "id" | "isRemoved">>,
  date: string,
): ShiftData[] => {
  const staffIds = new Set(staffs.filter((staff) => !staff.isRemoved).map((staff) => staff.id));
  return shifts.filter((shift) => shift.date === date && staffIds.has(shift.staffId));
};

/** 必要人数のバーを、時間の軸に置く形へ直す。時間指定ではない必要人数と未設定はnullを返す。 */
export const toStaffingBars = (requirements: ShiftFormDayRequirements | null | undefined): StaffingBar[] | null =>
  requirements?.kind === "time"
    ? requirements.bars.map((bar) => ({ positionId: bar.positionId, start: bar.startTime, end: bar.endTime }))
    : null;

const toStaffingSlots = (requirements: ShiftFormDayRequirements | null | undefined): StaffingSlot[] => {
  if (requirements?.kind === "shiftType") {
    return requirements.options.map((option) => ({
      key: { kind: "shiftType" as const, optionId: option.optionId },
      requirements: option.counts,
    }));
  }
  if (requirements?.kind === "dateOnly") return [{ key: { kind: "allDay" }, requirements: requirements.counts }];
  return [];
};

const slotLabel = (count: StaffingSlotCount, pattern: ShiftSubmissionPattern): string => {
  if (count.key.kind === "shiftType") {
    const optionId = count.key.optionId;
    const option = pattern.kind === "shiftType" ? pattern.options.find((item) => item.id === optionId) : undefined;
    return option?.name ?? "勤務パターン";
  }
  return "1日";
};

const slotId = (count: StaffingSlotCount): string =>
  count.key.kind === "shiftType" ? `shiftType:${count.key.optionId}` : "allDay";

const buildSlotViews = (input: BuildInput): StaffingSlotView[] => {
  const base = {
    shifts: input.shifts,
    positionIds: input.positions.map((position) => position.id),
    newcomerStaffIdsByPositionId: input.newcomerStaffIdsByPositionId,
    slots: toStaffingSlots(input.day?.requirements),
  };
  const counts =
    input.submissionPattern.kind === "shiftType"
      ? countStaffingByShiftType({ ...base, optionIds: input.submissionPattern.options.map((option) => option.id) })
      : [countStaffingByDay(base)];

  const positionById = new Map(input.positions.map((position) => [position.id, position]));
  return counts.map((count) => ({
    id: slotId(count),
    label: slotLabel(count, input.submissionPattern),
    total: count.total,
    positions: count.positions.flatMap((item) => {
      const position = positionById.get(item.positionId);
      return position
        ? [{ ...buildStaffingCountView(item), positionId: position.id, name: position.name, color: position.color }]
        : [];
    }),
    hasShortage: count.hasShortage,
    hasExcess: count.hasExcess,
  }));
};

const buildBandViews = (input: BuildInput): StaffingBandView[] => {
  const bands = buildPositionStaffingBands({
    shifts: input.shifts,
    bars: toStaffingBars(input.day?.requirements),
    positionIds: input.positions.map((position) => position.id),
    newcomerStaffIdsByPositionId: input.newcomerStaffIdsByPositionId,
    startMinutes: getEditableStartMinutes(input.timeRange),
    endMinutes: getEditableEndMinutes(input.timeRange),
  });
  const positionById = new Map(input.positions.map((position) => [position.id, position]));
  return bands.flatMap((band) => {
    const position = positionById.get(band.positionId);
    if (!position) return [];
    const segments = band.segments
      // だれもいなくて必要人数もない区間は、帯に何も出さない。
      .filter((segment) => segment.count > 0 || (segment.required ?? 0) > 0)
      .map((segment): StaffingBandSegmentView => {
        const count = buildStaffingCountView(segment);
        const timeLabel = formatShiftClockTimeRange(segment.start, segment.end);
        return {
          ...count,
          key: segment.start,
          startMinutes: timeToMinutes(segment.start),
          endMinutes: timeToMinutes(segment.end),
          timeLabel,
          description: `${position.name} ${timeLabel} ${count.label}${count.isNewcomerOnly ? "、新人だけ" : ""}`,
        };
      });
    return [
      {
        positionId: position.id,
        name: position.name,
        color: position.color,
        isConfigured: band.isConfigured,
        hasImbalance: segments.some((segment) => segment.tone === "shortage" || segment.tone === "excess"),
        segments,
      },
    ];
  });
};

export const buildDayStaffingView = (input: BuildInput): DayStaffingView => {
  const template = buildDayTemplateView(input.day);
  if (input.submissionPattern.kind === "time") {
    const bands = buildBandViews(input);
    const segments = bands.flatMap((band) => band.segments);
    const shortageCount = segments.filter((segment) => segment.tone === "shortage").length;
    return {
      date: input.date,
      template,
      hasRequirements: bands.some((band) => band.isConfigured),
      slots: [],
      bands,
      hasShortage: shortageCount > 0,
      hasExcess: segments.some((segment) => segment.tone === "excess"),
      shortageCount,
    };
  }

  const slots = buildSlotViews(input);
  const shortageCount = slots.filter((slot) => slot.hasShortage).length;
  return {
    date: input.date,
    template,
    hasRequirements: slots.some((slot) => slot.positions.some((position) => position.required !== null)),
    slots,
    bands: [],
    hasShortage: shortageCount > 0,
    hasExcess: slots.some((slot) => slot.hasExcess),
    shortageCount,
  };
};

/** 人数の表示。必要人数がある場合は「2/3」、ない場合は「2」。 */
export const formatStaffingCount = (count: number, required: number | null): string =>
  required === null ? `${count}` : `${count}/${required}`;

// ==========================================
// 帯の区間に出す文字
// ==========================================
// 帯の文字（xsの太字）の、1文字あたりの幅の目安。記号の「▲」「＋」は数字より広いため、多めに見積もる。
const BAND_LABEL_CHAR_WIDTH_PX = 7;
// 区間の左右の余白と枠。
const BAND_LABEL_PADDING_PX = 8;
// 新人だけの印「新」の幅と、文字との間。
const BAND_NEWCOMER_MARK_WIDTH_PX = 16;

const estimateBandLabelWidth = (label: string): number =>
  label.length * BAND_LABEL_CHAR_WIDTH_PX + BAND_LABEL_PADDING_PX;

export type BandSegmentContent = {
  /** 区間に出す文字。入らない幅ではnull。 */
  text: string | null;
  /** 文字が全文かどうか。falseのときは、全文をtitleと押したときの欄で出す。 */
  isFullText: boolean;
  showsNewcomerMark: boolean;
};

/**
 * 区間の幅に入る文字を決める。
 * 全文（「2/3 ▲1」）が入らない幅では差だけ（「▲1」「＋1」。ちょうどと未設定は人数だけ）にし、それも入らない幅では文字を出さない。
 * 新人だけの区間は、印「新」を出せる形を先に選ぶ。全文と印が並ばない幅では、差だけにして印を残す。
 * 印が入らない幅では、印を省いて文字だけを出す。
 */
export const resolveBandSegmentContent = (
  segment: Pick<StaffingCountView, "label" | "compactLabel" | "isNewcomerOnly">,
  widthPx: number,
): BandSegmentContent => {
  const fits = (label: string, withMark: boolean) =>
    widthPx >= estimateBandLabelWidth(label) + (withMark ? BAND_NEWCOMER_MARK_WIDTH_PX : 0);
  const full = { text: segment.label, isFullText: true };
  const compact = { text: segment.compactLabel, isFullText: segment.compactLabel === segment.label };

  if (segment.isNewcomerOnly) {
    if (fits(segment.label, true)) return { ...full, showsNewcomerMark: true };
    if (fits(segment.compactLabel, true)) return { ...compact, showsNewcomerMark: true };
  }
  if (fits(segment.label, false)) return { ...full, showsNewcomerMark: false };
  if (fits(segment.compactLabel, false)) return { ...compact, showsNewcomerMark: false };
  return { text: null, isFullText: false, showsNewcomerMark: false };
};

// ==========================================
// ポジションが多い店舗の帯
// ==========================================
/** この数以上のポジションがある店舗では、過不足のあるポジションだけを先に出す。 */
export const BAND_COLLAPSE_POSITION_COUNT = 4;

export type StaffingBandSummary = {
  visibleBands: StaffingBandView[];
  /** まとめた行を開閉するボタンの文言。まとめる行がない場合はnull。 */
  toggleLabel: string | null;
};

/**
 * ポジションが多い日の帯を、過不足のあるポジションだけにまとめる。
 * 必要人数が未設定の日は過不足がないため、まとめずに全ポジションの人数を出す。
 */
export const summarizeStaffingBands = (
  view: Pick<DayStaffingView, "bands" | "hasRequirements">,
  isExpanded: boolean,
): StaffingBandSummary => {
  const { bands } = view;
  if (bands.length < BAND_COLLAPSE_POSITION_COUNT || !view.hasRequirements) {
    return { visibleBands: bands, toggleLabel: null };
  }
  const imbalanced = bands.filter((band) => band.hasImbalance);
  const balancedCount = bands.length - imbalanced.length;
  if (balancedCount === 0) return { visibleBands: bands, toggleLabel: null };
  if (isExpanded) return { visibleBands: bands, toggleLabel: "過不足のあるポジションだけにする" };
  return {
    visibleBands: imbalanced,
    toggleLabel: imbalanced.length === 0 ? `${balancedCount}つとも過不足なし` : `ほか${balancedCount}つは過不足なし`,
  };
};

// ==========================================
// 日付の一覧の印
// ==========================================
export type DayStaffingMarks = { hasShortage: boolean; hasExcess: boolean };

/** 日付の一覧に出す、不足と多い時間の印。どちらもない日は含めない。 */
export const buildDayStaffingMarks = (views: ReadonlyMap<string, DayStaffingView>): Map<string, DayStaffingMarks> =>
  new Map(
    [...views].flatMap(
      ([date, view]): Array<[string, DayStaffingMarks]> =>
        view.hasShortage || view.hasExcess
          ? [[date, { hasShortage: view.hasShortage, hasExcess: view.hasExcess }]]
          : [],
    ),
  );

/** 「くわしく」表示を初期状態にするかどうか。何も設定していない店舗では、従来の画面のままにする。 */
export const shouldDefaultToDetailMode = (input: {
  positionCount: number;
  staffing: ShiftFormStaffing | undefined;
  hasStaffProfiles: boolean;
}): boolean =>
  input.positionCount >= 2 ||
  (input.staffing?.templates.length ?? 0) > 0 ||
  (input.staffing?.days.some((day) => day.requirements !== null) ?? false) ||
  (input.staffing?.breakRule ?? null) !== null ||
  input.hasStaffProfiles;
