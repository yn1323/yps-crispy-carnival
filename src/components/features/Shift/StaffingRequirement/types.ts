// 1時間帯 x 1ポジション の必要人員エントリ
export type StaffingEntry = {
  hour: number;
  position: string;
  requiredCount: number;
};

// AI入力情報
export type AIInput = {
  shopType: string;
  customerCount: string;
};

// ポジション（店舗ポジション参照）
export type PositionType = {
  _id: string;
  name: string;
};

// 店舗情報（StaffingRequirement用のサブセット）
export type ShopType = {
  _id: string;
  shopName: string;
  openTime: string;
  closeTime: string;
};

// SetupWizardのパターン型
export type PatternType = {
  id: string;
  staffing: StaffingEntry[];
  appliedDays: number[];
};
