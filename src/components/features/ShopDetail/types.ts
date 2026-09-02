import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { RegularClosedDay, ShiftSubmissionPattern } from "@/convex/shop/schemas";

export type ShopDetailData = {
  id: string;
  name: string;
  regularClosedDays: RegularClosedDay[];
  submissionPattern: ShiftSubmissionPattern;
  managerNotificationRecipientStatus: "available" | "none" | "unknown";
  canUpdateSettings: boolean;
  settingsDisabledReason?: string;
  canDelete: boolean;
  deleteDisabledReason?: string;
};

export type ShopDetailPerson = {
  id: string;
  name: string;
  managerRole: "active" | "none";
  lineStatus?: "unlinked" | "linked_following" | "linked_unfollowed";
  isLineConnected?: boolean;
  shopNames: readonly string[];
  shopIds: readonly string[];
};

export type ShopStaffMembershipData = NonNullable<
  FunctionReturnType<typeof api.staff.queries.getOrganizationShopStaffMembershipChange>
>;

export type ShopStaffMembershipRemovalPreview = NonNullable<
  FunctionReturnType<typeof api.staff.queries.previewOrganizationShopStaffMembershipRemovals>
>;

export type ShopStaffMembershipChangeInput = Omit<
  FunctionArgs<typeof api.staff.mutations.changeOrganizationShopStaffMemberships>,
  "expectedOrganizationId"
>;
