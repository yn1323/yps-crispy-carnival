export type ShopDetailTab = "information" | "settings";

export type ShopDetailData = {
  id: string;
  name: string;
  staffCount: number;
  canDelete: boolean;
  deleteDisabledReason?: string;
};
