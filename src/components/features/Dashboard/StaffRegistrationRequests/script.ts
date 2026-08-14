import type { StaffRegistrationRequest } from "../types";

export const DEFAULT_STAFF_REGISTRATION_APPROVAL_DISABLED_REASON =
  "この申請は現在承認できません。不要な申請は却下できます。";

export function resolveStaffRegistrationApprovalAvailability(
  request: Pick<StaffRegistrationRequest, "canApprove" | "approveDisabledReason">,
) {
  if (request.canApprove === true) {
    return { canApprove: true as const, disabledReason: null };
  }

  return {
    canApprove: false as const,
    disabledReason: request.approveDisabledReason?.trim() || DEFAULT_STAFF_REGISTRATION_APPROVAL_DISABLED_REASON,
  };
}
