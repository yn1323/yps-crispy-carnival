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
