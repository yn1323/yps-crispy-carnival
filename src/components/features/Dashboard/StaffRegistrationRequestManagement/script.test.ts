import { describe, expect, it } from "vitest";
import {
  DEFAULT_STAFF_REGISTRATION_APPROVAL_DISABLED_REASON,
  resolveStaffRegistrationApprovalAvailability,
} from "./script";

describe("resolveStaffRegistrationApprovalAvailability", () => {
  it.each([
    { canApprove: false, approveDisabledReason: null },
    { canApprove: false, approveDisabledReason: "" },
  ])("承認不可理由が空の場合は共通案内を使う: %o", (request) => {
    expect(resolveStaffRegistrationApprovalAvailability(request)).toEqual({
      canApprove: false,
      disabledReason: DEFAULT_STAFF_REGISTRATION_APPROVAL_DISABLED_REASON,
    });
  });

  it("backendが返した汎用理由を承認不可の説明に使う", () => {
    expect(
      resolveStaffRegistrationApprovalAvailability({
        canApprove: false,
        approveDisabledReason: "現在は承認できません。",
      }),
    ).toEqual({
      canApprove: false,
      disabledReason: "現在は承認できません。",
    });
  });

  it("明示的に承認可能な申請では理由を残さない", () => {
    expect(
      resolveStaffRegistrationApprovalAvailability({
        canApprove: true,
        approveDisabledReason: "古い理由",
      }),
    ).toEqual({
      canApprove: true,
      disabledReason: null,
    });
  });
});
