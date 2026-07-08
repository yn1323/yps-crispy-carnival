import type { ShopStageRowDto, ShopStagesResponse } from "@/api/analyticsTypes";

const DAY_MS = 24 * 60 * 60 * 1000;

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

function toJstDateString(value: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateStringToEpochDay(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day)) / DAY_MS);
}

function daysBetweenJstDates(from: string | null | undefined, to: string | null | undefined) {
  const fromDay = dateStringToEpochDay(from);
  const toDay = dateStringToEpochDay(to);
  if (fromDay === null || toDay === null) return null;
  return Math.max(0, toDay - fromDay);
}

function referenceDate(row: ShopStageRowDto) {
  const referenceAt = finiteNumber(row.stageReferenceAt);
  return referenceAt === null ? null : toJstDateString(referenceAt);
}

export function getDormantRows(stages: ShopStagesResponse | null) {
  return [...(stages?.rows ?? [])]
    .filter((row) => row.stage === "activeTrialDormant" || row.stage === "retainedDormant")
    .sort(
      (a, b) =>
        (getDormantDays(b) ?? -1) - (getDormantDays(a) ?? -1) ||
        (dateStringToEpochDay(b.lastShiftPeriodEnd) ?? -1) - (dateStringToEpochDay(a.lastShiftPeriodEnd) ?? -1) ||
        (finiteNumber(b.shopCreatedAt) ?? 0) - (finiteNumber(a.shopCreatedAt) ?? 0),
    );
}

export function getDormantDays(row: ShopStageRowDto) {
  const stalledDays = finiteNumber(row.stalledDays);
  if (stalledDays !== null) return stalledDays;
  const lastActivityAt = finiteNumber(row.lastActivityAt);
  const stageReferenceAt = finiteNumber(row.stageReferenceAt);
  if (lastActivityAt === null || stageReferenceAt === null) return null;
  return Math.max(0, Math.floor((stageReferenceAt - lastActivityAt) / DAY_MS));
}

export function getDaysSinceLastShift(row: ShopStageRowDto) {
  return daysBetweenJstDates(row.lastShiftPeriodEnd, referenceDate(row));
}

export function getDaysSinceLastShiftCreated(row: ShopStageRowDto) {
  const createdAt = finiteNumber(row.lastShiftCreatedAt);
  if (createdAt === null) return null;
  return daysBetweenJstDates(toJstDateString(createdAt), referenceDate(row));
}

export function getLastSubmissionRate(row: ShopStageRowDto) {
  return finiteNumber(row.lastShiftSubmissionRate) ?? finiteNumber(row.lastRecruitmentSubmissionRate);
}

export function getAverageDaysSinceLastShift(rows: ShopStageRowDto[]) {
  return averageRowValue(rows, getDaysSinceLastShift);
}

export function getAverageLastSubmissionRate(rows: ShopStageRowDto[]) {
  return averageRowValue(rows, getLastSubmissionRate);
}

export function getShopLineLinkedRate(row: ShopStageRowDto) {
  if (row.shiftTargetStaffCount === 0) return null;
  return row.lineLinkedStaffCount / row.shiftTargetStaffCount;
}
