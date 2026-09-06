import type { Doc } from "../_generated/dataModel";
import { getDeadlineCutoff, getSubmitLinkCutoff } from "../_lib/dateFormat";

/** 変更の案内は締切後も届けるが、提出リンクを使えなくなる確定・開始後は届けない。 */
export function canSendRecruitmentNotification(
  recruitment: Pick<Doc<"recruitments">, "isDeleted" | "status" | "periodStart" | "deadline">,
  isUpdate: boolean,
  now: number,
) {
  return (
    !recruitment.isDeleted &&
    recruitment.status === "open" &&
    now < getSubmitLinkCutoff(recruitment.periodStart) &&
    (isUpdate || now < getDeadlineCutoff(recruitment.deadline))
  );
}
