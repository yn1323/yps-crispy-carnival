import { ConvexError } from "convex/values";

export const CREATE_RECRUITMENT_DUPLICATE_ERROR_CODE = "RECRUITMENT_DUPLICATE";
export const CREATE_RECRUITMENT_DUPLICATE_ERROR_MESSAGE =
  "同じ期間の募集がすでにあります。シフト一覧を確認してください。";

function getErrorData(error: unknown): unknown {
  if (error instanceof ConvexError) return error.data;
  if (typeof error === "object" && error !== null && "data" in error) return error.data;
  return null;
}

export function getCreateRecruitmentErrorMessage(error: unknown): string | null {
  return getErrorData(error) === CREATE_RECRUITMENT_DUPLICATE_ERROR_CODE
    ? CREATE_RECRUITMENT_DUPLICATE_ERROR_MESSAGE
    : null;
}
