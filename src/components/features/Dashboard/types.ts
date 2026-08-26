import type { Id } from "@/convex/_generated/dataModel";
import type { RecruitmentLifecycleStatus } from "@/src/domains/shift/recruitmentLifecycle";

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
  responseCountHasOverflow?: boolean;
  totalStaffCount: number;
  totalStaffCountHasOverflow?: boolean;
};

export type RecruitmentDisplayStatus = RecruitmentLifecycleStatus;
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
  organizationPersonId: Id<"organizationPeople"> | null;
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
  /** rolling deploy中に旧backendから欠損した場合は、承認不可として扱う。 */
  canApprove?: boolean;
  approveDisabledReason?: string | null;
};

export type DashboardNavigation = {
  onOpenBillingSettings: () => void;
  onOpenShopDetail: (shopId: string) => void;
  onOpenShiftBoard: (recruitmentId: Recruitment["_id"]) => void;
  onOpenStaffDetail: (personId: Id<"organizationPeople">, visibleUserCount: number) => void;
};

export type DashboardAnnouncement = {
  _id: Id<"dashboardAnnouncements">;
  organizationId?: string;
  shopId?: string;
  organizationPlan?: string;
  title: string;
  bodyHtml: string;
  displayDate: string;
};

export type { PaginationStatus } from "convex/browser";
