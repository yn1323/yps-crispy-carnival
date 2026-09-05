import { ConvexError } from "convex/values";

export const RECRUITMENT_CHANGED = "RECRUITMENT_CHANGED";

// 未編集の既存募集・旧画面は版0として扱う。
export function getRecruitmentEditVersion(recruitment: { editVersion?: number }): number {
  return recruitment.editVersion ?? 0;
}

export function assertRecruitmentEditVersion(recruitment: { editVersion?: number }, expectedEditVersion = 0): void {
  if (
    !Number.isSafeInteger(expectedEditVersion) ||
    expectedEditVersion < 0 ||
    getRecruitmentEditVersion(recruitment) !== expectedEditVersion
  ) {
    throw new ConvexError(RECRUITMENT_CHANGED);
  }
}

// 提出履歴は残したまま、現在の募集条件への回答だけを判定する。
export function isCurrentSubmission(submission: { needsResubmission?: boolean } | null | undefined): boolean {
  return submission != null && submission.needsResubmission !== true;
}
