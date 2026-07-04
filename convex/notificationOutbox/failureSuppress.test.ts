import { describe, expect, it } from "vitest";
import {
  SHIFT_CONFIRMATION_REMINDER_CONTEXT,
  SHOP_ACTIVATION_REMINDER_CONTEXT,
  shouldSuppressNotificationFailureInbox,
} from "./failureSuppress";

describe("shouldSuppressNotificationFailureInbox", () => {
  it("シフト確定催促リマインダーの context は failureInbox を抑止する", () => {
    expect(shouldSuppressNotificationFailureInbox(SHIFT_CONFIRMATION_REMINDER_CONTEXT)).toBe(true);
  });

  it("店舗登録後の本番募集リマインダーの context は failureInbox を抑止する", () => {
    expect(shouldSuppressNotificationFailureInbox(SHOP_ACTIVATION_REMINDER_CONTEXT)).toBe(true);
  });

  it("通常の通知 context は抑止しない", () => {
    expect(shouldSuppressNotificationFailureInbox("notification.sendReminderEmails")).toBe(false);
    expect(shouldSuppressNotificationFailureInbox("notification.sendConfirmationEmail")).toBe(false);
    expect(shouldSuppressNotificationFailureInbox("")).toBe(false);
  });
});
