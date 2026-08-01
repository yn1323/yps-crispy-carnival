import { describe, expect, it } from "vitest";
import { notificationContextForPayload, redactNotificationPayload } from "./redaction";

describe("redactNotificationPayload", () => {
  it("emailの宛先・本文・capability URLを除去し安全なmetadataだけを残す", () => {
    const payload = {
      kind: "email" as const,
      from: "sender@example.com",
      to: "staff@example.com",
      subject: "token付き通知",
      html: '<a href="https://app.example.com/shifts/view?token=capability-secret">open</a>',
      context: "notification.sendConfirmationEmail",
      suppressDelivery: true,
    };

    const redacted = redactNotificationPayload(payload, notificationContextForPayload(payload, "email:test:1"));

    expect(redacted).toEqual({
      kind: "email",
      from: "",
      to: "",
      subject: "",
      html: "",
      context: "notification.sendConfirmationEmail",
      suppressDelivery: true,
    });
    expect(JSON.stringify(redacted)).not.toContain("capability-secret");
    expect(JSON.stringify(redacted)).not.toContain("staff@example.com");
  });

  it("LINEの宛先・本文・fallback emailを除去する", () => {
    const payload = {
      kind: "line" as const,
      toUserId: "U_secret_recipient",
      text: "https://app.example.com/shifts/submit?token=capability-secret",
      fallbackEmail: {
        dedupeKey: "email:secret",
        payload: {
          kind: "email" as const,
          from: "sender@example.com",
          to: "staff@example.com",
          subject: "fallback",
          html: "raw body",
          context: "notification.sendRecruitmentNotificationEmails",
        },
      },
    };

    const redacted = redactNotificationPayload(payload, notificationContextForPayload(payload, "line:test:1"));

    expect(redacted).toEqual({ kind: "line", toUserId: "", text: "" });
    expect(JSON.stringify(redacted)).not.toContain("secret");
    expect(JSON.stringify(redacted)).not.toContain("staff@example.com");
  });
});
