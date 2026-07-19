import type { RegularClosedDay, ShiftSubmissionPattern, UpdateShopSettingInput } from "@/convex/shop/schemas";
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

export type ShopSettingKind = UpdateShopSettingInput["kind"];
export type UpdateShopSetting = (change: UpdateShopSettingInput) => void | Promise<void>;
