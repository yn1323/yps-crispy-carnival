import { describe, expect, it } from "vitest";
import { safeNotificationError, safeStoredNotificationError } from "./safeError";

const SENTINEL = 'staff+secret@example.com token=capability-secret {"provider":"declined","body":"raw-response"}';

describe("safeNotificationError", () => {
  it("LINE provider bodyを固定taxonomyへ変換する", () => {
    const error = Object.assign(new Error(`LINE push failed: 400 ${SENTINEL}`), {
      name: "LineApiError",
      status: 400,
      body: SENTINEL,
    });

    const safe = safeNotificationError(error);

    expect(safe).toEqual({ code: "line_recipient_rejected" });
    expect(JSON.stringify(safe)).not.toContain(SENTINEL);
  });

  it("Resendのemail・token・JSON body・declineを固定taxonomyへ変換する", () => {
    const error = Object.assign(new Error(SENTINEL), {
      name: "ResendEmailError",
      errorName: SENTINEL,
      statusCode: 422,
      retryable: false,
    });

    const safe = safeNotificationError(error);

    expect(safe).toEqual({ code: "email_recipient_rejected" });
    expect(JSON.stringify(safe)).not.toContain(SENTINEL);
  });

  it("永続化境界はallowlist外の文字列を保持しない", () => {
    expect(safeStoredNotificationError(SENTINEL, "notification_worker_failed")).toBe("notification_worker_failed");
    expect(safeStoredNotificationError("email_rate_limited")).toBe("email_rate_limited");
  });
});
