// DB関連の定数定義（Single Source of Truth）
// クライアント側（src/constants/validations.ts）からre-exportされる

export const SHOP_TIME_UNIT = [1, 5, 10, 15, 30, 60] as const;
export type ShopTimeUnitType = (typeof SHOP_TIME_UNIT)[number];

export const SHOP_SUBMIT_FREQUENCY = ["1w", "2w", "1m"] as const;
export type ShopSubmitFrequencyType = (typeof SHOP_SUBMIT_FREQUENCY)[number];

export const SHOP_MIN_LENGTH = 2;
export const SHOP_MAX_LENGTH = 50;
