import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { RegularClosedDay, ShiftSubmissionPattern } from "@/convex/shop/schemas";

export type ShopDetailData = {
  id: string;
  name: string;
  regularClosedDays: RegularClosedDay[];
  submissionPattern: ShiftSubmissionPattern;
  /** rolling deploy中の旧backendは未返却のためoptionalで受け、画面ではunknown相当として扱う。 */
  managerNotificationRecipientStatus?: "available" | "none" | "unknown";
  canUpdateSettings: boolean;
  settingsDisabledReason?: string;
  canDelete: boolean;
  deleteDisabledReason?: string;
};

export type ShopDetailPerson = {
  id: string;
  name: string;
  managerRole: "active" | "readOnly" | "none";
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

export type ShopStaffMembershipChangeInput = FunctionArgs<
  typeof api.staff.mutations.changeOrganizationShopStaffMemberships
>;
