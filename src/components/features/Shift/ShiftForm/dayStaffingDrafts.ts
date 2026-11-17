import { DAY_TEMPLATE_ISSUE_MESSAGES, findDayRequirementsIssue } from "@/convex/shiftSetup/dayTemplates";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { getDayOfWeek, getWeekdayLabel } from "@/src/domains/shift/date";
import {
  barsToStaffingSegments,
  type StaffingSegment,
  staffingSegmentsToBars,
} from "@/src/domains/shift/staffingSegments";
import { formatShiftClockTimeRange } from "@/src/domains/shift/time";
import { buildDayTemplateView, toStaffingBars } from "./staffingPresentation";
import type { ShiftFormDayRequirements, ShiftFormStaffingDay } from "./types";

// その日のテンプレートのDialog（この日だけ人数を変える、ほかの日もまとめて変える）に閉じる純粋処理。

// ==========================================
// この日だけ人数を変える
// ==========================================
/** 行のID → ポジションのID → 人数。0人は持たなくてよい。 */
type DraftCounts = Record<string, Record<string, number>>;

/**
 * 編集中の必要人数。時間指定は時間ごとの人数の区間、パターン選択と日付選択は人数の表で持つ。
 * 保存の形は、時間指定ではバー（1本が1人分）のままで、読み込みと保存の境目で区間と変える。
 */
export type DayRequirementsDraft =
  | { kind: "time"; segments: StaffingSegment[] }
  | { kind: "counts"; counts: DraftCounts };

/** 日付選択の表の、1日を表す行のID。 */
export const DATE_ONLY_ROW_ID = "day";

const toDraftCounts = (counts: ReadonlyArray<{ positionId: string; count: number }>): Record<string, number> =>
  Object.fromEntries(counts.map((entry) => [entry.positionId, entry.count]));

/** いまの必要人数を、編集の初期値にする。未設定の日と、集め方に合わない必要人数は、空から始める。 */
export const buildDayRequirementsDraft = (
  requirements: ShiftFormDayRequirements | null,
  pattern: ShiftSubmissionPattern,
): DayRequirementsDraft => {
  if (pattern.kind === "time") {
    return { kind: "time", segments: barsToStaffingSegments(toStaffingBars(requirements) ?? []) };
  }
  if (pattern.kind === "shiftType") {
    const options = requirements?.kind === "shiftType" ? requirements.options : [];
    return {
      kind: "counts",
      counts: Object.fromEntries(options.map((option) => [option.optionId, toDraftCounts(option.counts)])),
    };
  }
  return {
    kind: "counts",
    counts: { [DATE_ONLY_ROW_ID]: toDraftCounts(requirements?.kind === "dateOnly" ? requirements.counts : []) },
  };
};

/** 人数の表の行。パターン選択は勤務パターン、日付選択は1日の1行にする。時間指定では使わない。 */
export const buildCountTableRows = (
  pattern: ShiftSubmissionPattern,
): Array<{ id: string; label: string; detail?: string }> => {
  if (pattern.kind === "shiftType") {
    return pattern.options.map((option) => ({
      id: option.id,
      label: option.name,
      detail: formatShiftClockTimeRange(option.startTime, option.endTime),
    }));
  }
  return pattern.kind === "dateOnly" ? [{ id: DATE_ONLY_ROW_ID, label: "1日" }] : [];
};

/** 人数の表の1マスを変える。 */
export const setDraftCount = (
  draft: DayRequirementsDraft,
  rowId: string,
  positionId: string,
  count: number,
): DayRequirementsDraft =>
  draft.kind === "counts"
    ? { kind: "counts", counts: { ...draft.counts, [rowId]: { ...draft.counts[rowId], [positionId]: count } } }
    : draft;

const toCounts = (
  counts: Readonly<Record<string, number>> | undefined,
  positionIds: readonly string[],
): Array<{ positionId: string; count: number }> =>
  // 0人は未設定と同じ意味なので送らない。並びはポジションの表示順にそろえる。
  positionIds.flatMap((positionId) => {
    const count = counts?.[positionId] ?? 0;
    return count > 0 ? [{ positionId, count }] : [];
  });

/** 編集中の必要人数を、保存する形へ直す。 */
export const toDayRequirements = (
  draft: DayRequirementsDraft,
  pattern: ShiftSubmissionPattern,
  positionIds: readonly string[],
): ShiftFormDayRequirements => {
  if (draft.kind === "time") {
    return {
      kind: "time",
      // 人数の区間を、同じ人数の並びを表せる最少の本数のバーへ変える。
      bars: staffingSegmentsToBars(draft.segments).map((bar) => ({
        positionId: bar.positionId,
        startTime: bar.start,
        endTime: bar.end,
      })),
    };
  }
  if (pattern.kind === "shiftType") {
    return {
      kind: "shiftType",
      options: pattern.options
        .map((option) => ({ optionId: option.id, counts: toCounts(draft.counts[option.id], positionIds) }))
        .filter((option) => option.counts.length > 0),
    };
  }
  return { kind: "dateOnly", counts: toCounts(draft.counts[DATE_ONLY_ROW_ID], positionIds) };
};

/** サーバーと同じ決まりで必要人数を確かめ、保存できない場合は理由の文を返す。 */
export const findDayRequirementsError = (
  requirements: ShiftFormDayRequirements,
  pattern: ShiftSubmissionPattern,
): string | null => {
  const issue = findDayRequirementsIssue(requirements, pattern);
  return issue ? DAY_TEMPLATE_ISSUE_MESSAGES[issue] : null;
};

/** 「11月23日（月）の必要人数」 */
export const formatDayRequirementsTitle = (date: string): string => {
  const [, month, day] = date.split("-").map(Number);
  return `${month}月${day}日（${getWeekdayLabel(date)}）の必要人数`;
};

/** その日だけの変更で、テンプレートが変わらないことを伝える文。 */
export const describeCustomRequirements = (templateName: string | null): string =>
  templateName
    ? `この日だけの変更です。テンプレート「${templateName}」は変わりません。`
    : "この日だけの変更です。テンプレートは変わりません。";

// ==========================================
// ほかの日もまとめて変える
// ==========================================
/** テンプレートの選択で「曜日の設定に戻す」を表す値。テンプレートのIDと重ならない。 */
export const BULK_RESET_VALUE = "__reset__";

export type BulkApplyRow = {
  date: string;
  /** いま当たっているテンプレートの名前。 */
  templateLabel: string;
  /** 定休日。選べない。 */
  isClosed: boolean;
  isWeekend: boolean;
};

export const buildBulkApplyRows = (input: {
  dates: readonly string[];
  holidays: readonly string[];
  days: readonly ShiftFormStaffingDay[];
}): BulkApplyRow[] => {
  const dayByDate = new Map(input.days.map((day) => [day.date, day]));
  const closedDates = new Set(input.holidays);
  return input.dates.map((date) => {
    const weekday = getDayOfWeek(date);
    return {
      date,
      templateLabel: buildDayTemplateView(dayByDate.get(date)).label,
      isClosed: closedDates.has(date),
      isWeekend: weekday === 0 || weekday === 6,
    };
  });
};

export type BulkApplyPreset = "weekday" | "weekend" | "all";

/** まとめて選ぶボタンで選ぶ日。定休日は選ばない。 */
export const selectBulkApplyDates = (rows: readonly BulkApplyRow[], preset: BulkApplyPreset): string[] =>
  rows
    .filter((row) => !row.isClosed && (preset === "all" || row.isWeekend === (preset === "weekend")))
    .map((row) => row.date);

/** 選んだテンプレートの値を、当てるテンプレートのIDへ直す。「曜日の設定に戻す」はnull。 */
export const toBulkTemplateId = (choice: string): string | null => (choice === BULK_RESET_VALUE ? null : choice);
