// DB関連の定数定義（Single Source of Truth）
// クライアント側（src/constants/validations.ts）からre-exportされる

export const SHOP_TIME_UNIT = [1, 5, 10, 15, 30, 60] as const;
export type ShopTimeUnitType = (typeof SHOP_TIME_UNIT)[number];

export const SHOP_SUBMIT_FREQUENCY = ["1w", "2w", "1m"] as const;
export type ShopSubmitFrequencyType = (typeof SHOP_SUBMIT_FREQUENCY)[number];

export const SHOP_MIN_LENGTH = 2;
export const SHOP_MAX_LENGTH = 50;

// 役割定義
export const SHOP_USER_ROLE = ["owner", "manager", "general"] as const;
export type ShopUserRoleType = (typeof SHOP_USER_ROLE)[number];

// ステータス定義
export const SHOP_USER_STATUS = ["pending", "active", "resigned"] as const;
export type ShopUserStatusType = (typeof SHOP_USER_STATUS)[number];

// 招待関連
export const INVITE_EXPIRY_DAYS = 14;
export const INVITE_EXPIRY_MS = INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
