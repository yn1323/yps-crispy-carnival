import type { ShopStageRowDto, ShopStagesResponse } from "@/api/analyticsTypes";

const DAY_MS = 24 * 60 * 60 * 1000;

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getActiveTrialRows(stages: ShopStagesResponse | null) {
  return [...(stages?.rows ?? [])]
    .filter((row) => row.stage === "activeTrial")
    .sort((a, b) => (finiteNumber(b.shopCreatedAt) ?? 0) - (finiteNumber(a.shopCreatedAt) ?? 0));
}

export function getAverageSubmissionRate(rows: ShopStageRowDto[]) {
  const values = rows.flatMap((row) => {
    const value = finiteNumber(row.submissionRate);
    return value === null ? [] : [value];
  });
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getLineLinkedRate(rows: ShopStageRowDto[]) {
  const targetStaffCount = rows.reduce((sum, row) => sum + row.shiftTargetStaffCount, 0);
  if (targetStaffCount === 0) return null;
  const linkedStaffCount = rows.reduce((sum, row) => sum + row.lineLinkedStaffCount, 0);
  return linkedStaffCount / targetStaffCount;
}

export function getNotificationFailureShopCount(rows: ShopStageRowDto[]) {
  return rows.filter((row) => (row.openNotificationFailureCount ?? 0) > 0).length;
}

export function getFirstConfirmedShopCount(rows: ShopStageRowDto[]) {
  return rows.filter((row) => (row.confirmedRecruitmentCount ?? 0) > 0).length;
}

export function getFirstConfirmedShopNames(rows: ShopStageRowDto[]) {
  return rows.flatMap((row) => ((row.confirmedRecruitmentCount ?? 0) > 0 ? [row.shopName] : []));
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

export function getFirstRecruitmentDurationDays(row: ShopStageRowDto) {
  const createdAt = finiteNumber(row.firstRecruitmentCreatedAt);
  if (createdAt === null) return null;
  const openedDay = dateStringToEpochDay(toJstDateString(createdAt));
  const deadlineDay = dateStringToEpochDay(row.firstRecruitmentDeadline);
  if (openedDay === null || deadlineDay === null) return null;
  return Math.max(0, deadlineDay - openedDay + 1);
}
