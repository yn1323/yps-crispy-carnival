import {
  getDateRange,
  getDayOfWeek,
  getInclusiveDateCount,
  getWeekdayLabel,
  isValidIsoDateString,
} from "@/src/domains/shift/date";
import { isSupportedShiftTime, minutesToTime, timeToMinutes } from "@/src/domains/shift/time";
import type { ExportSchedule, ShiftExportData } from "./types";

export function buildExportSchedule(data: ShiftExportData, splitPeriod = false): ExportSchedule {
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
  let bodyLineCount = pattern.kind === "time" ? 2 : 1;
  const rows = data.staffs.map((staff) => ({
    staffId: staff.id,
    staffName: staff.isRemoved ? `${staff.name}（削除済み）` : staff.name,
    cells: dates.map(({ date, isClosed }) => {
      const assignments = byStaffDate.get(`${staff.id}:${date}`) ?? [];
      if (isClosed || assignments.length === 0) return { lines: ["-"] };
      if (pattern.kind === "dateOnly") return { lines: ["○"] };
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
        const merged: { start: number; end: number }[] = [];
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
  return {
    shopName: data.shopName,
    periodStart: recruitment.periodStart,
    periodEnd: recruitment.periodEnd,
    mode: pattern.kind,
    splitPeriod: splitPeriod && count >= 15,
    bodyLineCount,
    dates,
    rows,
  };
}

export function getExportFileName(schedule: ExportSchedule, format: "pdf" | "xlsx"): string {
  const shopName =
    schedule.shopName
      .replace(/[\\/:*?"<>|\p{Cc}\p{Cf}]/gu, "_")
      .trim()
      .slice(0, 60) || "店舗";
  return `${shopName}_シフト表_${schedule.periodStart}_${schedule.periodEnd}.${format}`;
}

export function getExportTitle(schedule: ExportSchedule): string {
  const periodStart = schedule.periodStart.replaceAll("-", "/");
  const periodEnd = schedule.periodEnd.replaceAll("-", "/");
  const displayedPeriodEnd =
    schedule.periodStart.slice(0, 4) === schedule.periodEnd.slice(0, 4) ? periodEnd.slice(5) : periodEnd;
  return `${periodStart}~${displayedPeriodEnd} ${schedule.shopName}`;
}
