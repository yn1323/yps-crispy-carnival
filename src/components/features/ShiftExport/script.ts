import {
  getDateRange,
  getDayOfWeek,
  getInclusiveDateCount,
  getWeekdayLabel,
  isValidIsoDateString,
} from "@/src/domains/shift/date";
import { isSupportedShiftTime, minutesToTime, timeToMinutes } from "@/src/domains/shift/time";
import type { ExportSchedule, ShiftExportData } from "./types";

export function buildExportSchedule(data: ShiftExportData): ExportSchedule {
  const { recruitment } = data;
  const count = getInclusiveDateCount(recruitment.periodStart, recruitment.periodEnd);
  if (
    data.exportBlockReason ||
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
        return {
          lines: [
            minutesToTime(Math.min(...assignments.map(({ startTime }) => timeToMinutes(startTime)))),
            minutesToTime(Math.max(...assignments.map(({ endTime }) => timeToMinutes(endTime)))),
          ],
        };
      }
      const selected = new Set(assignments.map(({ optionId }) => optionId));
      if ([...selected].some((id) => id === null || !optionIds.has(id)))
        throw new Error("勤務区分を確認できませんでした。");
      const lines = options.filter(({ id }) => selected.has(id)).map(({ name }) => name);
      bodyLineCount = Math.max(bodyLineCount, lines.length);
      return { lines };
    }),
  }));
  const statusLabel =
    data.confirmationState === "unconfirmed"
      ? "下書き"
      : data.contentComparison === "different"
        ? "確定後に変更あり"
        : data.contentComparison === "same"
          ? "確定済み"
          : "確定済み（変更状況を確認できません）";
  const notificationLabels = {
    notApplicable: null,
    pending: "前回の通知は処理中",
    failed: "前回の通知に失敗あり",
    sent: "前回の通知処理は送信完了",
    unknown: "前回の通知状況を確認できません",
  };
  return {
    shopName: data.shopName,
    periodStart: recruitment.periodStart,
    periodEnd: recruitment.periodEnd,
    statusLabel,
    notificationLabel: notificationLabels[data.notificationState],
    mode: pattern.kind,
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

export function getExportBlockMessage(reason: NonNullable<ShiftExportData["exportBlockReason"]>): string {
  switch (reason) {
    case "noSavedShifts":
      return "シフト表で保存してから出力してください。";
    case "noStaffs":
      return "出力対象のスタッフがいません。";
    case "excludedStaffAssignments":
      return "シフト対象外のスタッフに割当が残っています。スタッフ設定とシフト表を確認してください。";
  }
}
