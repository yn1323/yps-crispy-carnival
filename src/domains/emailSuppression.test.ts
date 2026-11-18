import { describe, expect, it } from "vitest";
import { shouldShowEmailSuppression } from "./emailSuppression";

describe("shouldShowEmailSuppression", () => {
  it("配信停止かつLINEで通知できない場合だけ表示する", () => {
    expect(shouldShowEmailSuppression({ isEmailSuppressed: true, canNotifyByLine: false })).toBe(true);
  });

  it("配信停止でもLINEで通知できる場合は表示しない", () => {
    expect(shouldShowEmailSuppression({ isEmailSuppressed: true, canNotifyByLine: true })).toBe(false);
  });

  it("配信停止でない場合は表示しない", () => {
    expect(shouldShowEmailSuppression({ isEmailSuppressed: false, canNotifyByLine: false })).toBe(false);
    expect(shouldShowEmailSuppression({ isEmailSuppressed: false, canNotifyByLine: true })).toBe(false);
  });
});
