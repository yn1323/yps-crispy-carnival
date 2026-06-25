import { describe, expect, it } from "vitest";
import { SHIFT_CONFIRMATION_REMINDER_CONTEXT, shouldSuppressNotificationFailureInbox } from "./failureSuppress";

describe("shouldSuppressNotificationFailureInbox", () => {
  it("シフト確定催促リマインダーの context は failureInbox を抑止する", () => {
    expect(shouldSuppressNotificationFailureInbox(SHIFT_CONFIRMATION_REMINDER_CONTEXT)).toBe(true);
  });

  it("通常の通知 context は抑止しない", () => {
    expect(shouldSuppressNotificationFailureInbox("notification.sendReminderEmails")).toBe(false);
    expect(shouldSuppressNotificationFailureInbox("notification.sendConfirmationEmail")).toBe(false);
    expect(shouldSuppressNotificationFailureInbox("")).toBe(false);
  });
});
