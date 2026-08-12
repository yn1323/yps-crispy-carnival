export type StaffAccessKind = "submit" | "view";

export type StaffLinkUnavailableReason = "invalid_link" | "recruitment_deleted" | "submission_closed";

export function parseRecruitmentSearchId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= 128 ? normalized : undefined;
}
