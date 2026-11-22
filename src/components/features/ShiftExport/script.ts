import { SHIFT_BOARD_DATE_NOTE_LIMIT, SHIFT_DATE_NOTE_MAX_LENGTH } from "@/convex/constants";
import {
  formatDateWithWeekday,
  getDateRange,
  getDayOfWeek,
  getInclusiveDateCount,
  getWeekdayLabel,
  isValidIsoDateString,
} from "@/src/domains/shift/date";
import { isSupportedShiftTime, minutesToTime, timeToMinutes } from "@/src/domains/shift/time";
import { buildExportDaily } from "./daily";
import type { ExportNoteRow, ExportSchedule, ExportView, ShiftExportData } from "./types";

export function buildExportSchedule(
  data: ShiftExportData,
  splitPeriod = false,
  includeNotes = false,
  view: ExportView = "overview",
): ExportSchedule {
  const { recruitment } = data;
  const count = getInclusiveDateCount(recruitment.periodStart, recruitment.periodEnd);
  if (
    !isValidIsoDateString(recruitment.periodStart) ||
    !isValidIsoDateString(recruitment.periodEnd) ||
    count < 1 ||
    count > 31 ||
    data.staffs.length === 0 ||
    data.staffs.length > 200 ||
    data.assignments.length > 2000
  ) {
    throw new Error("出力できるシフト表ではありません。");
  }
  const dates = getDateRange(recruitment.periodStart, recruitment.periodEnd).map((date) => ({
    date,
    label: `${Number(date.slice(8))}(${getWeekdayLabel(date)})`,
    dayOfWeek: getDayOfWeek(date),
    isClosed: recruitment.shopClosedDates.includes(date),
  }));
  const staffIds = new Set(data.staffs.map((staff) => staff.id));
  if (staffIds.size !== data.staffs.length) throw new Error("スタッフが重複しています。");
  const dateSet = new Set(dates.map(({ date }) => date));
  const byStaffDate = new Map<string, ShiftExportData["assignments"]>();
  for (const assignment of data.assignments) {
    if (!staffIds.has(assignment.staffId) || !dateSet.has(assignment.date))
      throw new Error("出力対象を確認できませんでした。");
    const key = `${assignment.staffId}:${assignment.date}`;
    const current = byStaffDate.get(key) ?? [];
    current.push(assignment);
    byStaffDate.set(key, current);
  }
  const pattern = recruitment.submissionPattern;
  const options =
    pattern.kind === "shiftType"
      ? [...pattern.options].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      : [];
  const optionIds = new Set(options.map((option) => option.id));
  // 休憩は一覧に出さないが、日別のバーに使うため、時刻をここで確かめる。
  if (
    data.assignments.some((assignment) =>
      (assignment.breaks ?? []).some(
        ({ startTime, endTime }) =>
          !isSupportedShiftTime(startTime) ||
          !isSupportedShiftTime(endTime) ||
          timeToMinutes(startTime) >= timeToMinutes(endTime),
      ),
    )
  ) {
    throw new Error("休憩時間を確認できませんでした。");
  }
  // 日付選択の「ポジション」は、「くわしく」表示で、ポジションが2つ以上ある店舗でだけ選べる。
  // 1つ以下では「○」と同じになり、「シンプル」では既定のポジションが入るだけで全員が同じに見えるためである。
  const positions = data.positions ?? [];
  const canShowPositions = pattern.kind === "dateOnly" && data.isDetailMode === true && positions.length >= 2;
  const showsPositions = canShowPositions && view === "positions";
  const positionOrder = new Map(positions.map((position, index) => [position.id, index]));
  const positionNameById = new Map(positions.map((position) => [position.id, position.name]));
  let bodyLineCount = pattern.kind === "time" ? 2 : 1;
  const rows = data.staffs.map((staff) => ({
    staffId: staff.id,
    staffName: staff.isRemoved ? `${staff.name}（削除済み）` : staff.name,
    cells: dates.map(({ date, isClosed }) => {
      const assignments = byStaffDate.get(`${staff.id}:${date}`) ?? [];
      if (isClosed || assignments.length === 0) return { lines: ["-"] };
      // 一覧には勤務の開始と終了だけを出す。ポジションと休憩は日別のバーで出す。
      if (pattern.kind === "dateOnly") {
        if (!showsPositions) return { lines: ["○"] };
        // ポジションの付いていない勤務と、設定にないポジションの勤務は「○」にする。
        const positionIds = [
          ...new Set(assignments.map(({ positionId }) => positionId).filter((id) => id && positionNameById.has(id))),
        ] as string[];
        if (positionIds.length === 0) return { lines: ["○"] };
        const lines = positionIds
          .sort((a, b) => (positionOrder.get(a) ?? 0) - (positionOrder.get(b) ?? 0))
          .map((id) => positionNameById.get(id) as string);
        bodyLineCount = Math.max(bodyLineCount, lines.length);
        return { lines };
      }
      if (pattern.kind === "time") {
        if (
          assignments.some(
            ({ startTime, endTime }) =>
              !isSupportedShiftTime(startTime) ||
              !isSupportedShiftTime(endTime) ||
              timeToMinutes(startTime) >= timeToMinutes(endTime),
          )
        )
          throw new Error("勤務時間を確認できませんでした。");
        const intervals = assignments
          .map(({ startTime, endTime }) => ({ start: timeToMinutes(startTime), end: timeToMinutes(endTime) }))
          .sort((a, b) => a.start - b.start || a.end - b.end);
        const merged: typeof intervals = [];
        for (const interval of intervals) {
          const previous = merged.at(-1);
          if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
          else merged.push({ ...interval });
        }
        const lines = merged.flatMap(({ start, end }) => [minutesToTime(start), minutesToTime(end)]);
        bodyLineCount = Math.max(bodyLineCount, lines.length);
        return { lines };
      }
      const selected = new Set(assignments.map(({ optionId }) => optionId));
      if ([...selected].some((id) => id === null || !optionIds.has(id)))
        throw new Error("勤務パターンを確認できませんでした。");
      const lines = options.filter(({ id }) => selected.has(id)).map(({ name }) => name);
      bodyLineCount = Math.max(bodyLineCount, lines.length);
      return { lines };
    }),
  }));
  if (bodyLineCount > 36) throw new Error("1日の勤務区間が多すぎるため、帳票へ収まりません。");
  const noteRows = buildExportNoteRows(data, dateSet);
  // 一覧を出すときも作る。出力画面を開く時点で、日別にできない勤務を検出するためである。
  const daily = buildExportDaily(data, dates);
  const availableViews: ExportView[] = [
    "overview",
    ...(daily ? (["daily"] as const) : []),
    ...(canShowPositions ? (["positions"] as const) : []),
  ];
  return {
    shopName: data.shopName,
    periodStart: recruitment.periodStart,
    periodEnd: recruitment.periodEnd,
    mode: pattern.kind,
    splitPeriod: splitPeriod && count >= 15,
    bodyLineCount,
    dates,
    rows,
    hasDateNotes: noteRows.length > 0,
    noteRows: includeNotes ? noteRows : [],
    view: availableViews.includes(view) ? view : "overview",
    availableViews,
    daily,
  };
}

/** 連絡事項の一覧の行。日付順、同じ日の中は出力のスタッフ順に並べる。部分的な一覧は作らない。 */
function buildExportNoteRows(data: ShiftExportData, dateSet: ReadonlySet<string>): ExportNoteRow[] {
  if (data.dateNotes.length > SHIFT_BOARD_DATE_NOTE_LIMIT) throw new Error("メモが多すぎるため、出力できません。");
  const staffIndexById = new Map(data.staffs.map((staff, index) => [staff.id, index]));
  const noteKeys = new Set<string>();
  for (const entry of data.dateNotes) {
    const key = `${entry.staffId}:${entry.date}`;
    if (
      !staffIndexById.has(entry.staffId) ||
      !dateSet.has(entry.date) ||
      entry.note.length === 0 ||
      entry.note.length > SHIFT_DATE_NOTE_MAX_LENGTH ||
      noteKeys.has(key)
    )
      throw new Error("メモを確認できませんでした。");
    noteKeys.add(key);
  }
  return [...data.dateNotes]
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        (staffIndexById.get(left.staffId) ?? 0) - (staffIndexById.get(right.staffId) ?? 0),
    )
    .map((entry) => {
      const staff = data.staffs[staffIndexById.get(entry.staffId) ?? 0];
      return {
        key: `${entry.staffId}:${entry.date}`,
        dateLabel: formatDateWithWeekday(entry.date),
        staffName: staff.isRemoved ? `${staff.name}（削除済み）` : staff.name,
        note: entry.note,
      };
    });
}

export function getExportNotesTitle(schedule: ExportSchedule): string {
  return `${getExportTitle(schedule)} 連絡事項`;
}

export function getExportFileName(schedule: ExportSchedule, format: "pdf" | "xlsx"): string {
  const shopName =
    schedule.shopName
      .replace(/[\\/:*?"<>|\p{Cc}\p{Cf}]/gu, "_")
      .trim()
      .slice(0, 60) || "店舗";
  // Excelは日別を出さないため、日別の名前はPDFにだけ付ける。ポジションはPDFとExcelの両方に付ける。
  const view =
    schedule.view === "daily" && format === "pdf" ? "_日別" : schedule.view === "positions" ? "_ポジション" : "";
  return `${shopName}_シフト表${view}_${schedule.periodStart}_${schedule.periodEnd}.${format}`;
}

export function getExportTitle(schedule: ExportSchedule): string {
  const periodStart = schedule.periodStart.replaceAll("-", "/");
  const periodEnd = schedule.periodEnd.replaceAll("-", "/");
  const displayedPeriodEnd =
    schedule.periodStart.slice(0, 4) === schedule.periodEnd.slice(0, 4) ? periodEnd.slice(5) : periodEnd;
  return `${periodStart}~${displayedPeriodEnd} ${schedule.shopName}`;
}
