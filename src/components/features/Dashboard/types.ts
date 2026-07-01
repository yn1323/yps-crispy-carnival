import dayjs, { type Dayjs } from "dayjs";
import type { Id } from "@/convex/_generated/dataModel";

export type Recruitment = {
  _id: Id<"recruitments">;
  createdAt: number;
  periodStart: string;
  periodEnd: string;
  deadline: string;
  shopClosedDates: string[];
  status: "open" | "confirmed";
  confirmedAt: number | null;
  responseCount: number;
  totalStaffCount: number;
};

export type RecruitmentDisplayStatus = "collecting" | "action-required" | "current" | "confirmed" | "ended";
export type DashboardRecruitmentGroupKey = "current" | "actionRequired" | "collecting" | "confirmed" | "past";

export type DashboardRecruitmentGroup = {
  key: DashboardRecruitmentGroupKey;
  title: string;
  recruitments: Recruitment[];
  totalCount: number;
};

export type DashboardRecruitmentGroupsResult = {
  groups: DashboardRecruitmentGroup[];
  totalCount: number;
};

type RecruitmentDateStatusFields = Pick<Recruitment, "status" | "deadline" | "periodStart" | "periodEnd">;

export function isCurrentRecruitment(
  recruitment: Pick<Recruitment, "status" | "periodStart" | "periodEnd">,
  now = dayjs(),
): boolean {
  const today = now.format("YYYY-MM-DD");
  return recruitment.status === "confirmed" && recruitment.periodStart <= today && today <= recruitment.periodEnd;
}

export function getDisplayStatus(recruitment: RecruitmentDateStatusFields, now = dayjs()): RecruitmentDisplayStatus {
  const today = now.format("YYYY-MM-DD");
  if (recruitment.status === "open" && (recruitment.deadline < today || recruitment.periodEnd < today)) {
    return "action-required";
  }
  if (recruitment.periodEnd < today) return "ended";
  if (isCurrentRecruitment(recruitment, now)) return "current";
  if (recruitment.status === "confirmed") return "confirmed";
  return "collecting";
}

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
    if (groupKey) grouped[groupKey].push(recruitment);
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

export function sortRecruitmentsByCreatedAt(recruitments: Recruitment[]): Recruitment[] {
  return [...recruitments].sort((a, b) => b.createdAt - a.createdAt);
}

export function getDashboardRecruitmentGroupKey(
  recruitment: RecruitmentDateStatusFields,
  now = dayjs(),
): DashboardRecruitmentGroupKey | null {
  const today = now.format("YYYY-MM-DD");
  if (recruitment.status === "confirmed") {
    if (recruitment.periodStart <= today && today <= recruitment.periodEnd) return "current";
    if (today < recruitment.periodStart) return "confirmed";
    return "past";
  }
  if (recruitment.deadline < today || recruitment.periodEnd < today) return "actionRequired";
  return "collecting";
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

export type Staff = {
  _id: Id<"staffs">;
  name: string;
  email: string;
  isManager: boolean;
  isLineLinked: boolean;
  isLineFollowing: boolean;
  excludedFromShift: boolean;
};

export type StaffRegistrationRequest = {
  _id: Id<"staffRegistrationRequests">;
  name: string;
  email: string;
  createdAt: number;
};

export type DashboardAnnouncement = {
  _id: Id<"dashboardAnnouncements">;
  title: string;
  bodyHtml: string;
  displayDate: string;
};

export type { PaginationStatus } from "convex/browser";
