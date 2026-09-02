export type StaffAccessKind = "submit" | "view";

export type StaffLinkUnavailableReason =
  | "invalid_link"
  | "recruitment_deleted"
  | "submission_closed"
  | "usage_limit_exceeded"
  | "usage_limit_evaluation_unavailable";

export function parseRecruitmentSearchId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= 128 ? normalized : undefined;
}
