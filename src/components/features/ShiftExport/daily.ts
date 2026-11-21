import { getEffectiveBreaks } from "@/src/domains/shift/breaks";
import { getWeekdayLabel } from "@/src/domains/shift/date";
import { buildPositionStaffingBands } from "@/src/domains/shift/staffing";
import { isSupportedShiftTime, minutesToTime, timeToMinutes } from "@/src/domains/shift/time";
import type { ShiftData } from "@/src/domains/shift/types";
import type {
  ExportDaily,
  ExportDailyCountRow,
  ExportDailyRow,
  ExportDailySegment,
  ExportDailySheet,
  ExportDate,
  ShiftExportData,
} from "./types";

// 日別のバーの帳票に載せる内容を作る純粋処理。
// 休憩と人数の決まりはシフト表と同じにするため、domainの処理（getEffectiveBreaks、buildPositionStaffingBands）で求める。

/** 人数をポジションごとに出す行数の上限。これより多い日は、全体の人数の1行にまとめる。 */
export const DAILY_POSITION_COUNT_ROW_LIMIT = 8;

const TOTAL_COUNT_KEY = "all";
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

type Assignment = ShiftExportData["assignments"][number];
type WorkPiece = { start: number; end: number; label: string; color: string | null; positionId: string };

const assertWorkTime = ({ startTime, endTime }: Pick<Assignment, "startTime" | "endTime">) => {
  if (
    !isSupportedShiftTime(startTime) ||
    !isSupportedShiftTime(endTime) ||
    timeToMinutes(startTime) >= timeToMinutes(endTime)
  ) {
    throw new Error("勤務時間を確認できませんでした。");
  }
};

/** 重なる勤務は先に始まるほうを残し、同じ見た目で隣り合う勤務は1本にまとめる。 */
const toWorkPieces = (items: readonly WorkPiece[]): WorkPiece[] => {
  const pieces: WorkPiece[] = [];
  for (const item of [...items].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const previous = pieces.at(-1);
    const start = previous ? Math.max(item.start, previous.end) : item.start;
    if (start >= item.end) continue;
    if (
      previous &&
      previous.end === start &&
      previous.label === item.label &&
      previous.color === item.color &&
      previous.positionId === item.positionId
    ) {
      previous.end = item.end;
      continue;
    }
    pieces.push({ ...item, start });
  }
  return pieces;
};

/** 勤務から休憩の時間を抜き、勤務と休憩を左から右の順に並べる。 */
const toSegments = (
  pieces: readonly WorkPiece[],
  breaks: readonly { start: number; end: number }[],
): ExportDailySegment[] => {
  const segments: ExportDailySegment[] = breaks.map((range) => ({ kind: "break", ...range }));
  for (const piece of pieces) {
    let cursor = piece.start;
    for (const range of breaks) {
      if (range.end <= cursor || range.start >= piece.end) continue;
      if (range.start > cursor) {
        segments.push({ kind: "work", start: cursor, end: range.start, label: piece.label, color: piece.color });
      }
      cursor = Math.max(cursor, range.end);
    }
    if (cursor < piece.end) {
      segments.push({ kind: "work", start: cursor, end: piece.end, label: piece.label, color: piece.color });
    }
  }
  return segments.sort((a, b) => a.start - b.start || a.end - b.end);
};

/** 人数を数えるdomainの処理へ渡す形に直す。数える単位（ポジションか全体か）はpositionIdで決める。 */
const toCountShift = (staffId: string, date: string, pieces: readonly WorkPiece[], shift: DayShift): ShiftData => ({
  id: `${staffId}:${date}`,
  staffId,
  staffName: "",
  date,
  requestedTime: null,
  positions: pieces.map((piece, index) => ({
    id: `${staffId}:${date}:${index}`,
    positionId: piece.positionId,
    positionName: "",
    color: "",
    start: minutesToTime(piece.start),
    end: minutesToTime(piece.end),
  })),
  breaks: shift.breaks,
});

type DayShift = Pick<ShiftData, "positions" | "breaks">;

export function buildExportDaily(data: ShiftExportData, dates: readonly ExportDate[]): ExportDaily | null {
  const pattern = data.recruitment.submissionPattern;
  if (pattern.kind === "dateOnly") return null;

  const positions = data.positions ?? [];
  const positionById = new Map(positions.map((position) => [position.id, position]));
  // ポジション名は、一覧と同じく、ポジションが2つ以上ある店舗でだけ出す。
  const showPositions = positions.length >= 2;
  const optionNameById = new Map(
    pattern.kind === "shiftType" ? pattern.options.map((option) => [option.id, option.name]) : [],
  );
  const openDates = new Set(dates.filter(({ isClosed }) => !isClosed).map(({ date }) => date));
  const byDateStaff = new Map<string, Assignment[]>();
  const range =
    pattern.kind === "time"
      ? { start: timeToMinutes(pattern.startTime), end: timeToMinutes(pattern.endTime) }
      : {
          start: Math.min(...pattern.options.map((option) => timeToMinutes(option.startTime))),
          end: Math.max(...pattern.options.map((option) => timeToMinutes(option.endTime))),
        };
  for (const assignment of data.assignments) {
    if (!openDates.has(assignment.date)) continue;
    assertWorkTime(assignment);
    range.start = Math.min(range.start, timeToMinutes(assignment.startTime));
    range.end = Math.max(range.end, timeToMinutes(assignment.endTime));
    const key = `${assignment.date}:${assignment.staffId}`;
    const current = byDateStaff.get(key);
    if (current) current.push(assignment);
    else byDateStaff.set(key, [assignment]);
  }
  if (byDateStaff.size === 0 || !Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    return { axisStart: 0, axisEnd: 60, sheets: [] };
  }
  // 時刻の軸は正時にそろえ、期間を通して同じ範囲にする。
  const axisStart = Math.floor(range.start / 60) * 60;
  const axisEnd = Math.ceil(range.end / 60) * 60;

  const sheets: ExportDailySheet[] = [];
  for (const { date } of dates) {
    if (!openDates.has(date)) continue;
    const entries: Array<{ row: ExportDailyRow; firstStart: number; lastEnd: number }> = [];
    const countInputs: Array<{ staffId: string; pieces: WorkPiece[]; shift: DayShift }> = [];
    for (const staff of data.staffs) {
      const assignments = byDateStaff.get(`${date}:${staff.id}`);
      if (!assignments) continue;
      const pieces = toWorkPieces(
        assignments.map(({ startTime, endTime, positionId, optionId }) => {
          const position = positionId ? positionById.get(positionId) : undefined;
          const label = [
            optionId ? optionNameById.get(optionId) : undefined,
            showPositions ? position?.name : undefined,
          ]
            .filter((text): text is string => !!text)
            .join(" ");
          return {
            start: timeToMinutes(startTime),
            end: timeToMinutes(endTime),
            label,
            color: position?.color && COLOR_PATTERN.test(position.color) ? position.color : null,
            positionId: positionId ?? "",
          };
        }),
      );
      const shift: DayShift = {
        positions: pieces.map((piece, index) => ({
          id: String(index),
          positionId: piece.positionId,
          positionName: "",
          color: "",
          start: minutesToTime(piece.start),
          end: minutesToTime(piece.end),
        })),
        breaks: assignments.flatMap((assignment) =>
          (assignment.breaks ?? []).map(({ startTime, endTime }) => ({ start: startTime, end: endTime })),
        ),
      };
      const breaks = getEffectiveBreaks(shift, { clipToWork: true }).map(({ start, end }) => ({
        start: timeToMinutes(start),
        end: timeToMinutes(end),
      }));
      const firstStart = pieces[0].start;
      const lastEnd = Math.max(...pieces.map((piece) => piece.end));
      entries.push({
        row: {
          staffId: staff.id,
          staffName: staff.isRemoved ? `${staff.name}（削除済み）` : staff.name,
          timeLabel: `${minutesToTime(firstStart)}-${minutesToTime(lastEnd)}`,
          segments: toSegments(pieces, breaks),
        },
        firstStart,
        lastEnd,
      });
      // 削除済みのスタッフに残った勤務は、シフト表と同じく人数に数えない。
      if (!staff.isRemoved) countInputs.push({ staffId: staff.id, pieces, shift });
    }
    if (entries.length === 0) continue;
    // 並べ替えは安定なので、開始と終了が同じ人はスタッフの表示順のままになる。
    entries.sort((a, b) => a.firstStart - b.firstStart || a.lastEnd - b.lastEnd);

    const workedPositionIds = new Set(countInputs.flatMap(({ pieces }) => pieces.map((piece) => piece.positionId)));
    const countPositions = showPositions ? positions.filter((position) => workedPositionIds.has(position.id)) : [];
    // 一覧にないポジションの勤務がある日は、数え漏らさないよう全体の人数にする。
    const byPosition =
      countPositions.length > 0 &&
      countPositions.length <= DAILY_POSITION_COUNT_ROW_LIMIT &&
      [...workedPositionIds].every((id) => positionById.has(id));
    const countRows = byPosition
      ? countPositions.map((position) => ({ key: position.id, label: position.name }))
      : [{ key: TOTAL_COUNT_KEY, label: "時間帯人数" }];
    const bands = buildPositionStaffingBands({
      shifts: countInputs.map(({ staffId, pieces, shift }) =>
        toCountShift(
          staffId,
          date,
          byPosition ? pieces : pieces.map((piece) => ({ ...piece, positionId: TOTAL_COUNT_KEY })),
          shift,
        ),
      ),
      bars: null,
      positionIds: countRows.map(({ key }) => key),
      startMinutes: axisStart,
      endMinutes: axisEnd,
    });
    const counts: ExportDailyCountRow[] = countRows.map(({ key, label }, index) => ({
      key,
      label,
      segments: bands[index].segments.map(({ start, end, count }) => ({
        start: timeToMinutes(start),
        end: timeToMinutes(end),
        count,
      })),
    }));
    sheets.push({
      date,
      title: `${date.replaceAll("-", "/")}(${getWeekdayLabel(date)}) ${data.shopName}`,
      rows: entries.map(({ row }) => row),
      workerLabel: `出勤 ${countInputs.length}人`,
      counts,
    });
  }
  return { axisStart, axisEnd, sheets };
}
