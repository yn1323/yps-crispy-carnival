import type { ShopStageRowDto, ShopStagesResponse } from "@/api/analyticsTypes";

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageRowValue(rows: ShopStageRowDto[], getter: (row: ShopStageRowDto) => number | null | undefined) {
  return average(
    rows.flatMap((row) => {
      const value = finiteNumber(getter(row));
      return value === null ? [] : [value];
    }),
  );
}

export function getRetainedRows(stages: ShopStagesResponse | null) {
  return [...(stages?.rows ?? [])]
    .filter((row) => row.stage === "retained")
    .sort(
      (a, b) =>
        (finiteNumber(b.lastRecruitmentConfirmedAt) ?? 0) - (finiteNumber(a.lastRecruitmentConfirmedAt) ?? 0) ||
        (finiteNumber(b.shopCreatedAt) ?? 0) - (finiteNumber(a.shopCreatedAt) ?? 0),
    );
}

export function getAverageStaffCount(rows: ShopStageRowDto[]) {
  return averageRowValue(rows, (row) => row.staffCount);
}

export function getLineLinkedRate(rows: ShopStageRowDto[]) {
  const targetStaffCount = rows.reduce((sum, row) => sum + row.shiftTargetStaffCount, 0);
  if (targetStaffCount === 0) return null;
  const linkedStaffCount = rows.reduce((sum, row) => sum + row.lineLinkedStaffCount, 0);
  return linkedStaffCount / targetStaffCount;
}

export function getAverageReminderTargetRate(rows: ShopStageRowDto[]) {
  return averageRowValue(rows, (row) => row.reminderTargetRecruitmentRate);
}

export function getAverageMissingSubmissionRate(rows: ShopStageRowDto[]) {
  return averageRowValue(rows, (row) => {
    const submissionRate = finiteNumber(row.submissionRate);
    return submissionRate === null ? null : Math.max(0, 1 - submissionRate);
  });
}

export function getAverageRecruitmentOpenDays(rows: ShopStageRowDto[]) {
  return averageRowValue(rows, (row) => row.averageRecruitmentOpenDays);
}

export function getAverageDeadlineToConfirmationDays(rows: ShopStageRowDto[]) {
  return averageRowValue(rows, (row) => row.averageDeadlineToConfirmationDays);
}

export function getMissingSubmissionRate(row: ShopStageRowDto) {
  const submissionRate = finiteNumber(row.submissionRate);
  return submissionRate === null ? null : Math.max(0, 1 - submissionRate);
}

export function getShopLineLinkedRate(row: ShopStageRowDto) {
  if (row.shiftTargetStaffCount === 0) return null;
  return row.lineLinkedStaffCount / row.shiftTargetStaffCount;
}
