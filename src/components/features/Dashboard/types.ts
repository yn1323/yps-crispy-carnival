import dayjs from "dayjs";
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

export type RecruitmentDisplayStatus = "collecting" | "past-deadline" | "current" | "confirmed" | "ended";

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
  if (recruitment.periodEnd < today) return "ended";
  if (isCurrentRecruitment(recruitment, now)) return "current";
  if (recruitment.status === "confirmed") return "confirmed";
  return recruitment.deadline < today ? "past-deadline" : "collecting";
}

export function sortRecruitmentsByPeriodStart(recruitments: Recruitment[]): Recruitment[] {
  return [...recruitments].sort((a, b) => b.periodStart.localeCompare(a.periodStart) || b.createdAt - a.createdAt);
}

export function sortRecruitmentsByCreatedAt(recruitments: Recruitment[]): Recruitment[] {
  return [...recruitments].sort((a, b) => b.createdAt - a.createdAt);
}

export type Staff = {
  _id: Id<"staffs">;
  name: string;
  email: string;
  isManager: boolean;
  isLineLinked: boolean;
  isLineFollowing: boolean;
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
