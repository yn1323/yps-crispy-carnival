import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { RegularClosedDay, ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { OrganizationPersonRowData } from "@/src/components/shared/OrganizationPersonRow";

export type ShopDetailData = {
  id: string;
  name: string;
  regularClosedDays: RegularClosedDay[];
  submissionPattern: ShiftSubmissionPattern;
  canUpdateSettings: boolean;
  settingsDisabledReason?: string;
  canDelete: boolean;
  deleteDisabledReason?: string;
};

export type ShopDetailPerson = OrganizationPersonRowData & {
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
