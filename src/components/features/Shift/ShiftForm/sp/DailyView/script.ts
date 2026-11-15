import { getEffectiveBreaks } from "@/src/domains/shift/breaks";
import { computeVisualBreaks, mergeAdjacentPositions, resolveDefaultPosition } from "@/src/domains/shift/operations";
import { isLegacyCompatibleWorkPosition } from "@/src/domains/shift/positions";
import { formatShiftClockTime, formatShiftClockTimeRange, timeToMinutes } from "@/src/domains/shift/time";
import type { PositionSegment, PositionType, ShiftData, TimeRange } from "@/src/domains/shift/types";
import { addTimeSchema } from "./ShiftEditSheet.schema";

export type TimelineBarViewModel = {
  key: string;
  leftPercentage: number;
  widthPercentage: number;
};

export type RequestBarViewModel = TimelineBarViewModel & {
  label: string | null;
};

export type WorkBarViewModel = TimelineBarViewModel & {
  // くわしく表示でポジションを塗り分けるときに使う。
  color: string;
  positionName: string;
  timeLabel: string;
};

export type SPDailyCardViewModel = {
  hasAssignment: boolean;
  hasRequest: boolean;
  assignedTimeLabel: string | null;
  requestedBars: RequestBarViewModel[];
  workBars: WorkBarViewModel[];
  breakBars: TimelineBarViewModel[];
  // 時刻で入れた休憩。勤務のバーの内側に重ねる。
  explicitBreakBars: TimelineBarViewModel[];
};

const getWorkPositions = (shift: ShiftData | undefined): PositionSegment[] =>
  shift
    ? [...shift.positions]
        .filter(isLegacyCompatibleWorkPosition)
        .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
    : [];

// ==========================================
// 編集シート
// ==========================================
/** 編集シートの1行。既存の勤務は区間のID、追加した行は追加時に採番したIDをkeyに持つ。 */
export type SPShiftEditRow = {
  key: string;
  startTime: string;
  endTime: string;
  positionId: string;
};

/**
 * 編集シートの形。
 * single: 開始と終了だけを1組で編集する、従来の形。
 * multiple: 勤務を複数行で編集する形。くわしく表示、勤務が2件以上ある日、行を足したあとに使う。
 */
export type SPShiftEditLayout = "single" | "multiple";

export const getSPShiftEditLayout = ({
  shift,
  detailMode,
  hasAddedRow,
}: {
  shift: ShiftData | undefined;
  detailMode: boolean;
  /** このシートを開いてから「勤務時間を追加」を押したかどうか。足した行を消しても、複数行の形を保つ。 */
  hasAddedRow: boolean;
}): SPShiftEditLayout => (detailMode || hasAddedRow || getWorkPositions(shift).length >= 2 ? "multiple" : "single");

/** 開いたときの行。勤務を開始順に並べ、勤務がない日は空の1行を出す。 */
export const getSPShiftEditRows = (
  shift: ShiftData | undefined,
  blankRow: Pick<SPShiftEditRow, "key" | "positionId">,
): SPShiftEditRow[] => {
  const workPositions = getWorkPositions(shift);
  if (workPositions.length === 0) return [{ ...blankRow, startTime: "", endTime: "" }];
  return workPositions.map((position) => ({
    key: position.id,
    startTime: position.start,
    endTime: position.end,
    positionId: position.positionId,
  }));
};

/**
 * 「勤務時間を追加」で足す行。最も遅い終了を開始に入れ、続きの勤務をすぐ入れられるようにする。
 * その時刻より後に終了を選べない場合（受付時間の終わり）は、開始も空にする。
 */
export const buildSPShiftEditNewRow = ({
  rows,
  key,
  positionId,
  latestEndTime,
}: {
  rows: readonly SPShiftEditRow[];
  key: string;
  positionId: string;
  /** 選べる最も遅い時刻。 */
  latestEndTime: string | undefined;
}): SPShiftEditRow => {
  const lastEndTime = rows
    .map((row) => row.endTime)
    .filter((time) => time !== "")
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b))
    .at(-1);
  const canContinue =
    lastEndTime !== undefined &&
    latestEndTime !== undefined &&
    timeToMinutes(lastEndTime) < timeToMinutes(latestEndTime);
  return { key, startTime: canContinue ? lastEndTime : "", endTime: "", positionId };
};

export const SP_SHIFT_EDIT_OVERLAP_MESSAGE = "勤務時間が重なっています";

export type SPShiftEditErrors = {
  /** 行のkeyごとの、開始と終了の文言。 */
  rows: Record<string, { startTime?: string; endTime?: string }>;
  /** 行どうしの重なりの文言。 */
  overlap: string | null;
};

/** 編集シートの入力を検証する。違反がなければnullを返す。 */
export const findSPShiftEditErrors = (rows: readonly SPShiftEditRow[]): SPShiftEditErrors | null => {
  const rowErrors: SPShiftEditErrors["rows"] = {};
  const validRanges: Array<{ start: number; end: number }> = [];
  for (const row of rows) {
    const result = addTimeSchema.safeParse({ startTime: row.startTime, endTime: row.endTime });
    if (result.success) {
      validRanges.push({ start: timeToMinutes(row.startTime), end: timeToMinutes(row.endTime) });
      continue;
    }
    const fieldErrors: SPShiftEditErrors["rows"][string] = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if ((field === "startTime" || field === "endTime") && fieldErrors[field] === undefined) {
        fieldErrors[field] = issue.message;
      }
    }
    rowErrors[row.key] = fieldErrors;
  }

  // 入力が済んだ行どうしだけを比べる。未入力の行は、行ごとの文言で伝える。
  const sorted = validRanges.sort((a, b) => a.start - b.start);
  const hasOverlap = sorted.some((range, index) => index > 0 && range.start < sorted[index - 1].end);

  if (Object.keys(rowErrors).length === 0 && !hasOverlap) return null;
  return { rows: rowErrors, overlap: hasOverlap ? SP_SHIFT_EDIT_OVERLAP_MESSAGE : null };
};

/**
 * 編集シートに出す休憩の時刻。入力中の勤務時間の内側に収まる分だけを返す。
 * 入力が済んだ行が1つもない場合は、休憩を入れられないためnullを返す。
 */
export const getSPShiftEditBreakLabels = (
  rows: readonly SPShiftEditRow[],
  breaks: ShiftData["breaks"],
): string[] | null => {
  const positions = rows
    .filter((row) => addTimeSchema.safeParse({ startTime: row.startTime, endTime: row.endTime }).success)
    .map((row) => ({
      id: row.key,
      positionId: row.positionId,
      positionName: "",
      color: "",
      start: row.startTime,
      end: row.endTime,
    }));
  if (positions.length === 0) return null;
  return getEffectiveBreaks({ positions, breaks }, { clipToWork: true }).map((range) =>
    formatShiftClockTimeRange(range.start, range.end),
  );
};

export type SPShiftEditResult = { kind: "updated"; shift: ShiftData } | { kind: "cleared" };

/**
 * 編集シートの行から、その日の勤務を作る。検証を通った行を渡す。
 * 既存の区間はIDと元の情報を保ち、同じポジションで隣り合う行は1件にまとめる。行がなければ勤務を消す。
 */
export const buildSPShiftEditResult = ({
  shift,
  rows,
  positions,
}: {
  shift: ShiftData;
  rows: readonly SPShiftEditRow[];
  positions: readonly PositionType[];
}): SPShiftEditResult => {
  if (rows.length === 0) return { kind: "cleared" };

  const sourceById = new Map(getWorkPositions(shift).map((position) => [position.id, position]));
  const positionById = new Map(positions.map((position) => [position.id, position]));
  const segments = rows.map((row): PositionSegment => {
    const source = sourceById.get(row.key);
    const range = { id: row.key, start: row.startTime, end: row.endTime };
    // ポジションを変えていない行は、元の名前と色をそのまま保つ。
    if (source && source.positionId === row.positionId) return { ...source, ...range };
    const position = positionById.get(row.positionId) ?? resolveDefaultPosition(positions);
    return { ...source, ...range, positionId: position.id, positionName: position.name, color: position.color };
  });

  return { kind: "updated", shift: { ...shift, positions: mergeAdjacentPositions(segments) } };
};

export const timeToPercentage = (time: string, timeRange: TimeRange): number => {
  const [hour, minute] = time.split(":").map(Number);
  const totalMinutes = (timeRange.end - timeRange.start) * 60;
  return (((hour - timeRange.start) * 60 + minute) / totalMinutes) * 100;
};

export const getAssignedRange = (shift: ShiftData | undefined): [string, string] | null => {
  const workPositions = getWorkPositions(shift);
  if (workPositions.length === 0) return null;
  return [workPositions[0].start, workPositions[workPositions.length - 1].end];
};

const toTimelineBar = (key: string, start: string, end: string, timeRange: TimeRange): TimelineBarViewModel => {
  const leftPercentage = timeToPercentage(start, timeRange);
  return {
    key,
    leftPercentage,
    widthPercentage: timeToPercentage(end, timeRange) - leftPercentage,
  };
};

export const buildSPDailyCardViewModel = (shift: ShiftData | undefined, timeRange: TimeRange): SPDailyCardViewModel => {
  const requestedTimes = shift?.requestedTimes ?? (shift?.requestedTime ? [shift.requestedTime] : []);
  const assignedRange = getAssignedRange(shift);
  const workPositions = getWorkPositions(shift);
  const breaks = workPositions.length >= 2 ? computeVisualBreaks(workPositions) : [];

  return {
    hasAssignment: assignedRange !== null,
    hasRequest: requestedTimes.length > 0,
    assignedTimeLabel: assignedRange
      ? `${formatShiftClockTime(assignedRange[0])}–${formatShiftClockTime(assignedRange[1])}`
      : null,
    requestedBars: requestedTimes.map((request, index) => ({
      ...toTimelineBar(`${request.start}-${request.end}-${index}`, request.start, request.end, timeRange),
      // 勤務バーと重なると文字が欠けるため、勤務がない日だけ点線の中に希望時間を書く。
      label:
        assignedRange === null
          ? `希望：${formatShiftClockTime(request.start)}-${formatShiftClockTime(request.end)}`
          : null,
    })),
    workBars: workPositions.map((position) => ({
      ...toTimelineBar(position.id, position.start, position.end, timeRange),
      color: position.color,
      positionName: position.positionName,
      timeLabel: formatShiftClockTimeRange(position.start, position.end),
    })),
    breakBars: breaks.map((gap) => toTimelineBar(`break-${gap.start}-${gap.end}`, gap.start, gap.end, timeRange)),
    explicitBreakBars: getEffectiveBreaks(
      { positions: workPositions, breaks: shift?.breaks },
      { clipToWork: true },
    ).map((range) => toTimelineBar(`explicit-break-${range.start}-${range.end}`, range.start, range.end, timeRange)),
  };
};
