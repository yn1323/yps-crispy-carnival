import { getEffectiveBreaks, mergeBreaks } from "@/src/domains/shift/breaks";
import { computeVisualBreaks, mergeAdjacentPositions, resolveDefaultPosition } from "@/src/domains/shift/operations";
import { isLegacyCompatibleWorkPosition } from "@/src/domains/shift/positions";
import {
  formatShiftClockTime,
  formatShiftClockTimeRange,
  minutesToTime,
  timeToMinutes,
} from "@/src/domains/shift/time";
import type { PositionSegment, PositionType, ShiftData, ShiftTimeRange, TimeRange } from "@/src/domains/shift/types";
import { minutesToTimelinePercent, toSPTimelineRange } from "../../spTimelineScale";
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
  // くわしく表示でポジションを塗り分けるときと、そのポジションでの熟練度の印に使う。
  positionId: string;
  color: string;
  positionName: string;
  // その日の最初の勤務の左端と、最後の勤務の右端だけを丸める。
  // 隣り合う勤務の境目と、休憩の斜線をはさむ境目は、続いた1本に見えるよう角を付けない（PCの日別表示と同じ）。
  edgeShape: "isolated" | "start" | "middle" | "end";
};

/** バーの下に並べる内訳の1項目。休憩も1項目にし、ポジションの時間は休憩で区切る。 */
export type SPDailyDetailItem =
  | { kind: "position"; key: string; positionId: string; positionName: string; color: string; timeLabel: string }
  | { kind: "break"; key: string; timeLabel: string };

export type SPDailyCardViewModel = {
  hasAssignment: boolean;
  hasRequest: boolean;
  assignedTimeLabel: string | null;
  requestedBars: RequestBarViewModel[];
  workBars: WorkBarViewModel[];
  breakBars: TimelineBarViewModel[];
  // 時刻で入れた休憩。勤務のバーの内側に重ねる。
  explicitBreakBars: TimelineBarViewModel[];
  // バーと同じ左から右の順に、ポジションと休憩を時刻つきで並べる。
  detailItems: SPDailyDetailItem[];
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
 * 編集シートの行のうち、開始と終了が正しく入った行を勤務の区間として返す。休憩の入る範囲と検証に使う。
 * 1つもない場合は、休憩を入れられない。
 */
export const getSPShiftEditWorkPositions = (rows: readonly SPShiftEditRow[]): PositionSegment[] =>
  rows
    .filter((row) => addTimeSchema.safeParse({ startTime: row.startTime, endTime: row.endTime }).success)
    .map((row) => ({
      id: row.key,
      positionId: row.positionId,
      positionName: "",
      color: "",
      start: row.startTime,
      end: row.endTime,
    }));

/** 編集シートを開いたときの休憩。勤務の頭かお尻にかかった休憩は休憩として扱わないため出さない。 */
export const getSPShiftEditInitialBreaks = (shift: ShiftData | undefined): ShiftTimeRange[] =>
  shift && getWorkPositions(shift).length > 0 ? getEffectiveBreaks(shift, { clipToWork: true }) : [];

export type SPShiftEditResult = { kind: "updated"; shift: ShiftData } | { kind: "cleared" };

/**
 * 編集シートの行から、その日の勤務を作る。検証を通った行を渡す。
 * 既存の区間はIDと元の情報を保ち、同じポジションで隣り合う行は1件にまとめる。行がなければ勤務を消す。
 */
export const buildSPShiftEditResult = ({
  shift,
  rows,
  positions,
  breaks,
}: {
  shift: ShiftData;
  rows: readonly SPShiftEditRow[];
  positions: readonly PositionType[];
  /** 同じシートで編集した休憩。渡さない場合は、その日の休憩をそのまま残す。 */
  breaks?: readonly ShiftTimeRange[];
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

  const updated: ShiftData = { ...shift, positions: mergeAdjacentPositions(segments) };
  if (!breaks) return { kind: "updated", shift: updated };
  const { breaks: _breaks, ...rest } = updated;
  // 重なる休憩と隣り合う休憩は、いちばん早い開始からいちばん遅い終了までの1つにまとめる。
  const merged = mergeBreaks(breaks);
  return { kind: "updated", shift: merged.length > 0 ? { ...rest, breaks: merged } : rest };
};

/** カードのバーの位置（%）。充足の帯と同じ物差しを使う。 */
export const timeToPercentage = (time: string, timeRange: TimeRange): number =>
  minutesToTimelinePercent(timeToMinutes(time), toSPTimelineRange(timeRange));

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

const getEdgeShape = (index: number, count: number): WorkBarViewModel["edgeShape"] => {
  if (count <= 1) return "isolated";
  if (index === 0) return "start";
  if (index === count - 1) return "end";
  return "middle";
};

/** 範囲から休憩を引いた残りを返す。休憩は開始順で、重なりのないものを渡す。 */
const subtractRanges = (start: number, end: number, breaks: readonly [number, number][]): [number, number][] => {
  const pieces: [number, number][] = [];
  let cursor = start;
  for (const [breakStart, breakEnd] of breaks) {
    if (breakEnd <= cursor || breakStart >= end) continue;
    if (breakStart > cursor) pieces.push([cursor, breakStart]);
    cursor = Math.max(cursor, breakEnd);
  }
  if (cursor < end) pieces.push([cursor, end]);
  return pieces;
};

/**
 * 内訳の項目を、時刻の順に作る。ポジションの時間から休憩（勤務の間の空きと、時刻で入れた休憩）を引き、
 * 休憩を1項目として間に置く。続いた同じポジションは1項目にまとめる。
 */
const buildDetailItems = (
  workPositions: readonly PositionSegment[],
  breakRanges: readonly ShiftTimeRange[],
): SPDailyDetailItem[] => {
  const breaks = mergeBreaks(breakRanges).map((range): [number, number] => [
    timeToMinutes(range.start),
    timeToMinutes(range.end),
  ]);
  type Entry =
    | { kind: "position"; start: number; end: number; position: PositionSegment }
    | { kind: "break"; start: number; end: number };
  const entries: Entry[] = [
    ...workPositions.flatMap((position) =>
      subtractRanges(timeToMinutes(position.start), timeToMinutes(position.end), breaks).map(
        ([start, end]): Entry => ({ kind: "position", start, end, position }),
      ),
    ),
    ...breaks.map(([start, end]): Entry => ({ kind: "break", start, end })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: Entry[] = [];
  for (const entry of entries) {
    const previous = merged.at(-1);
    if (
      previous?.kind === "position" &&
      entry.kind === "position" &&
      previous.position.positionId === entry.position.positionId &&
      previous.end === entry.start
    ) {
      merged[merged.length - 1] = { ...previous, end: entry.end };
      continue;
    }
    merged.push(entry);
  }

  return merged.map((entry): SPDailyDetailItem => {
    const timeLabel = formatShiftClockTimeRange(minutesToTime(entry.start), minutesToTime(entry.end));
    const key = `${entry.kind}-${entry.start}-${entry.end}`;
    return entry.kind === "break"
      ? { kind: "break", key, timeLabel }
      : {
          kind: "position",
          key,
          positionId: entry.position.positionId,
          positionName: entry.position.positionName,
          color: entry.position.color,
          timeLabel,
        };
  });
};

export const buildSPDailyCardViewModel = (shift: ShiftData | undefined, timeRange: TimeRange): SPDailyCardViewModel => {
  const requestedTimes = shift?.requestedTimes ?? (shift?.requestedTime ? [shift.requestedTime] : []);
  const assignedRange = getAssignedRange(shift);
  const workPositions = getWorkPositions(shift);
  const breaks = workPositions.length >= 2 ? computeVisualBreaks(workPositions) : [];
  const explicitBreaks = getEffectiveBreaks({ positions: workPositions, breaks: shift?.breaks }, { clipToWork: true });

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
    workBars: workPositions.map((position, index) => ({
      ...toTimelineBar(position.id, position.start, position.end, timeRange),
      positionId: position.positionId,
      color: position.color,
      positionName: position.positionName,
      edgeShape: getEdgeShape(index, workPositions.length),
    })),
    breakBars: breaks.map((gap) => toTimelineBar(`break-${gap.start}-${gap.end}`, gap.start, gap.end, timeRange)),
    explicitBreakBars: explicitBreaks.map((range) =>
      toTimelineBar(`explicit-break-${range.start}-${range.end}`, range.start, range.end, timeRange),
    ),
    detailItems: buildDetailItems(workPositions, [...breaks, ...explicitBreaks]),
  };
};
