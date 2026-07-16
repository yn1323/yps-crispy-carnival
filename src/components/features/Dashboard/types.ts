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

export type RecruitmentDisplayStatus =
  | "collecting"
  | "action-required"
  | "current"
  | "confirmed"
  | "ended"
  | "ended-unconfirmed";
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

export type Staff = {
  _id: Id<"staffs">;
  name: string;
  email: string;
  isManager: boolean;
  isLineLinked: boolean;
  isLineFollowing: boolean;
  excludedFromShift: boolean;
  /** 移行済みスタッフは、削除時に事業者人物を残して操作中店舗の所属だけを終了する。 */
  isOrganizationLinked?: boolean;
};

export type StaffRegistrationRequest = {
  _id: Id<"staffRegistrationRequests">;
  name: string;
  email: string;
  createdAt: number;
};

export type DashboardAnnouncement = {
  _id: Id<"dashboardAnnouncements">;
  organizationId?: string;
  shopId?: string;
  title: string;
  bodyHtml: string;
  displayDate: string;
};

export type { PaginationStatus } from "convex/browser";
