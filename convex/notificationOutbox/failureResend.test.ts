import { describe, expect, it } from "vitest";
import {
  ACTIONABLE_NOTIFICATION_FAILURE_CONTEXTS,
  describeNotificationFailureContext,
  isManagerActionableNotificationFailure,
} from "./failureResend";

describe("describeNotificationFailureContext", () => {
  it("LINE連携案内メールは other ではなく lineInvite 種別として扱う", () => {
    expect(describeNotificationFailureContext("line.sendInviteEmail")).toEqual({
      kind: "lineInvite",
      label: "LINE連携案内",
    });
    expect(isManagerActionableNotificationFailure("line.sendInviteEmail")).toBe(true);
    expect(ACTIONABLE_NOTIFICATION_FAILURE_CONTEXTS).toContain("line.sendInviteEmail");
  });

  it("未マッピングの context は other（ラベル「通知」）として扱う", () => {
    expect(describeNotificationFailureContext("test.unknown")).toEqual({ kind: "other", label: "通知" });
    expect(isManagerActionableNotificationFailure("test.unknown")).toBe(false);
  });

  it("ACTIONABLE_NOTIFICATION_FAILURE_CONTEXTS と isManagerActionableNotificationFailure は整合する", () => {
    for (const context of ACTIONABLE_NOTIFICATION_FAILURE_CONTEXTS) {
      expect(describeNotificationFailureContext(context).kind).not.toBe("other");
      expect(isManagerActionableNotificationFailure(context)).toBe(true);
    }
  });
});
