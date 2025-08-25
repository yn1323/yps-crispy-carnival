export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 24;

export const USER_MIN_LENGTH = 2;
export const USER_MAX_LENGTH = 20;

export const SHOP_MIN_LENGTH = 2;
export const SHOP_MAX_LENGTH = 50;

export const SHOP_TIME_UNIT = [1, 5, 10, 15, 30, 60] as const;
export type ShopTimeUnitType = (typeof SHOP_TIME_UNIT)[number];

export const SHOP_SUBMIT_FREQUENCY = ["1w", "2w", "1m"] as const;
export type ShopSubmitFrequencyType = (typeof SHOP_SUBMIT_FREQUENCY)[number];
