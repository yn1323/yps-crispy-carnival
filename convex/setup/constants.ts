export const PROMOTION_CODE_LENGTH = 6;
export const PROMOTION_CODE_INVALID_ERROR_CODE = "PROMOTION_CODE_INVALID";

const PROMOTION_CODE_PATTERN = /^[A-Z0-9]{6}$/;

export function normalizePromotionCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isPromotionCode(value: string): boolean {
  return PROMOTION_CODE_PATTERN.test(value);
}
