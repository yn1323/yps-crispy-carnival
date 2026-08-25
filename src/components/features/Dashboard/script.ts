import dayjs, { type Dayjs } from "dayjs";
import {
  getRecruitmentLifecycleStatus,
  type RecruitmentLifecycleStatus,
} from "@/src/domains/shift/recruitmentLifecycle";
import type {
  DashboardRecruitmentGroup,
  DashboardRecruitmentGroupKey,
  DashboardRecruitmentGroupsResult,
  Recruitment,
  RecruitmentDisplayStatus,
} from "./types";

type RecruitmentDateStatusFields = Pick<Recruitment, "status" | "deadline" | "periodStart" | "periodEnd">;

export function getDisplayStatus(recruitment: RecruitmentDateStatusFields, now = dayjs()): RecruitmentDisplayStatus {
  return getRecruitmentLifecycleStatus(recruitment, now.format("YYYY-MM-DD"));
}

const DASHBOARD_GROUP_BY_LIFECYCLE_STATUS: Record<RecruitmentLifecycleStatus, DashboardRecruitmentGroupKey> = {
  collecting: "collecting",
  "action-required": "actionRequired",
  current: "current",
  confirmed: "confirmed",
  ended: "past",
  "ended-unconfirmed": "past",
};

export function sortRecruitmentsByPeriodStart(recruitments: Recruitment[]): Recruitment[] {
  return [...recruitments].sort((a, b) => b.periodStart.localeCompare(a.periodStart) || b.createdAt - a.createdAt);
}

export function buildDashboardRecruitmentGroups({
  recruitments,
  now = dayjs(),
}: {
  recruitments: readonly Recruitment[];
  now?: Dayjs;
}): DashboardRecruitmentGroupsResult {
  const uniqueRecruitments = Array.from(
    new Map(recruitments.map((recruitment) => [recruitment._id, recruitment])).values(),
  );
  const grouped: Record<DashboardRecruitmentGroupKey, Recruitment[]> = {
    current: [],
    actionRequired: [],
    collecting: [],
    confirmed: [],
    past: [],
  };

  for (const recruitment of uniqueRecruitments) {
    const groupKey = getDashboardRecruitmentGroupKey(recruitment, now);
    grouped[groupKey].push(recruitment);
  }

  const groups = createDashboardRecruitmentGroups({
    current: grouped.current.sort(sortCurrentRecruitments),
    actionRequired: grouped.actionRequired.sort(sortActionRequiredRecruitments),
    collecting: grouped.collecting.sort(sortCollectingRecruitments),
    confirmed: grouped.confirmed.sort(sortFutureConfirmedRecruitments),
    past: grouped.past.sort(sortPastRecruitments),
  });

  return {
    groups,
    totalCount: groups.reduce((total, group) => total + group.recruitments.length, 0),
  };
}

/**
 * サーバーでJST基準に分類済みの複数店舗groupを、分類をやり直さず一つの一覧へまとめる。
 * ブラウザのtimezoneで提出期限の境界を再判定しないため、組織横断一覧はこちらを使う。
 */
export function mergeDashboardRecruitmentGroups(
  sourceGroups: readonly DashboardRecruitmentGroup[],
): DashboardRecruitmentGroupsResult {
  const grouped: Record<DashboardRecruitmentGroupKey, Map<Recruitment["_id"], Recruitment>> = {
    current: new Map(),
    actionRequired: new Map(),
    collecting: new Map(),
    confirmed: new Map(),
    past: new Map(),
  };

  for (const group of sourceGroups) {
    for (const recruitment of group.recruitments) {
      grouped[group.key].set(recruitment._id, recruitment);
    }
  }

  const groups = createDashboardRecruitmentGroups({
    current: [...grouped.current.values()].sort(sortCurrentRecruitments),
    actionRequired: [...grouped.actionRequired.values()].sort(sortActionRequiredRecruitments),
    collecting: [...grouped.collecting.values()].sort(sortCollectingRecruitments),
    confirmed: [...grouped.confirmed.values()].sort(sortFutureConfirmedRecruitments),
    past: [...grouped.past.values()].sort(sortPastRecruitments),
  });

  return {
    groups,
    totalCount: groups.reduce((total, group) => total + group.recruitments.length, 0),
  };
}

export function sortRecruitmentsByCreatedAt(recruitments: Recruitment[]): Recruitment[] {
  return [...recruitments].sort((a, b) => b.createdAt - a.createdAt);
}

export function getDashboardRecruitmentGroupKey(
  recruitment: RecruitmentDateStatusFields,
  now = dayjs(),
): DashboardRecruitmentGroupKey {
  return DASHBOARD_GROUP_BY_LIFECYCLE_STATUS[getDisplayStatus(recruitment, now)];
}

function createDashboardRecruitmentGroups(
  groups: Record<DashboardRecruitmentGroupKey, Recruitment[]>,
): DashboardRecruitmentGroup[] {
  const orderedGroups: DashboardRecruitmentGroup[] = [
    { key: "current", title: "現在のシフト", recruitments: groups.current, totalCount: groups.current.length },
    {
      key: "actionRequired",
      title: "要シフト調整",
      recruitments: groups.actionRequired,
      totalCount: groups.actionRequired.length,
    },
    { key: "collecting", title: "募集中", recruitments: groups.collecting, totalCount: groups.collecting.length },
    { key: "confirmed", title: "確定済み", recruitments: groups.confirmed, totalCount: groups.confirmed.length },
    { key: "past", title: "過去のシフト", recruitments: groups.past, totalCount: groups.past.length },
  ];
  return orderedGroups.filter((group) => group.recruitments.length > 0);
}

function sortCurrentRecruitments(a: Recruitment, b: Recruitment): number {
  return a.periodEnd.localeCompare(b.periodEnd) || b.createdAt - a.createdAt;
}

function sortActionRequiredRecruitments(a: Recruitment, b: Recruitment): number {
  return (
    a.deadline.localeCompare(b.deadline) || a.periodStart.localeCompare(b.periodStart) || b.createdAt - a.createdAt
  );
}

function sortCollectingRecruitments(a: Recruitment, b: Recruitment): number {
  return (
    a.deadline.localeCompare(b.deadline) || a.periodStart.localeCompare(b.periodStart) || b.createdAt - a.createdAt
  );
}

function sortFutureConfirmedRecruitments(a: Recruitment, b: Recruitment): number {
  return a.periodStart.localeCompare(b.periodStart) || b.createdAt - a.createdAt;
}

function sortPastRecruitments(a: Recruitment, b: Recruitment): number {
  return (
    b.periodEnd.localeCompare(a.periodEnd) || b.periodStart.localeCompare(a.periodStart) || b.createdAt - a.createdAt
  );
}
