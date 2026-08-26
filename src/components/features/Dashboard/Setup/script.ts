import { PROMOTION_CODE_INVALID_ERROR_CODE } from "@/convex/setup/constants";

export function isPromotionCodeInvalidError(error: unknown): boolean {
  if (!isRecord(error) || !("data" in error)) return false;
  const data = error.data;
  return isRecord(data) && data.code === PROMOTION_CODE_INVALID_ERROR_CODE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
