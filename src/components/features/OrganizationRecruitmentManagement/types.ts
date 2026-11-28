import type { ReactNode } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { RegularClosedDay } from "@/convex/shop/schemas";
import type { DashboardRecruitmentGroup, Recruitment } from "@/src/components/features/Dashboard/types";

export type OrganizationRecruitmentShop = {
  shopId: Id<"shops">;
  shopName: string;
  regularClosedDays: RegularClosedDay[];
  hasPastRecruitments: boolean;
  canCreate: boolean;
  createDisabledReason?: string;
};

export type OrganizationRecruitmentShopMetadata = Pick<OrganizationRecruitmentShop, "shopId" | "shopName">;

export type OrganizationRecruitmentManagementProps = {
  organizationId: Id<"organizations">;
  shopFilter: "all" | Id<"shops">;
  isSingleShop: boolean;
  groups: DashboardRecruitmentGroup[];
  shops: readonly OrganizationRecruitmentShop[];
  getRecruitmentShop: (recruitment: Recruitment) => OrganizationRecruitmentShopMetadata | undefined;
  onOpenShiftBoard: (recruitmentId: Recruitment["_id"]) => void;
  /** ページの見出しを描く。「新しい募集をつくる」を引数で受け取り、見出しの右に置く。 */
  renderHeader?: (createAction: ReactNode) => ReactNode;
};
