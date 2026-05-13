import type { Resend } from "resend";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendResendEmail } from "./resend";

const emailPayload = {
  from: "シフトリ <noreply@example.com>",
  to: "staff@example.com",
  subject: "シフト希望の提出をお願いします",
  html: "<p>test</p>",
};

function createResendMock(send: ReturnType<typeof vi.fn>) {
  return {
    emails: {
      send,
    },
  } as unknown as Resend;
}

describe("sendResendEmail", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("成功時は送信IDを返す", async () => {
    const send = vi.fn().mockResolvedValue({
      data: { id: "email_123" },
      error: null,
      headers: { "ratelimit-remaining": "4" },
    });

    await expect(sendResendEmail(createResendMock(send), emailPayload, "test.success")).resolves.toBe("email_123");
    expect(send).toHaveBeenCalledOnce();
  });

  it("rate limit は retry-after に従って再試行する", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" },
        headers: { "retry-after": "1" },
      })
      .mockResolvedValueOnce({
        data: { id: "email_retry_ok" },
        error: null,
        headers: { "ratelimit-remaining": "3" },
      });

    const result = sendResendEmail(createResendMock(send), emailPayload, "test.retry");
    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toBe("email_retry_ok");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("validation error は再試行せず失敗にする", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn().mockResolvedValue({
      data: null,
      error: { name: "validation_error", statusCode: 400, message: "Invalid recipient" },
      headers: null,
    });

    await expect(sendResendEmail(createResendMock(send), emailPayload, "test.validation")).rejects.toThrow(
      "Resend email send failed: validation_error Invalid recipient",
    );
    expect(send).toHaveBeenCalledOnce();
  });
});
