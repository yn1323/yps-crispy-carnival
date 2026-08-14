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

export type StaffManagerInvitationState =
  | {
      kind: "hidden";
    }
  | {
      kind: "available";
      mode: "addition" | "freeManagerExchange";
      replacesStaleInvitation: boolean;
    }
  | {
      kind: "pending";
      mode: "addition" | "freeManagerExchange";
    }
  | {
      kind: "unavailable";
      reason: string;
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
  /** 移行済みスタッフは、削除時に事業者人物を残して操作中店舗の所属だけを終了する。 */
  isOrganizationLinked: boolean;
  managerInvitationState: StaffManagerInvitationState;
};

export type StaffRegistrationRequest = {
  _id: Id<"staffRegistrationRequests">;
  name: string;
  email: string;
  createdAt: number;
};

export type DashboardNavigation = {
  onOpenBillingSettings?: () => void;
  onOpenOrganizationSettings?: () => void;
  onOpenShopDetail?: (shopId: string) => void;
  onOpenShiftBoard?: (recruitmentId: Recruitment["_id"]) => void;
  onOpenStaffDetail?: (personId: Id<"organizationPeople">, visibleUserCount: number) => void;
  onManageManagers?: () => void;
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
