import type { Resend } from "resend";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RESEND_EMAIL_SEND_INTERVAL_MS,
  RESEND_EMAIL_SEND_TIMEOUT_MS,
  RESEND_RETRY_DELAY_PADDING_MS,
} from "../constants";
import { resetResendEmailQueueForTest, sendResendEmail } from "./resend";

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
  beforeEach(() => {
    resetResendEmailQueueForTest();
  });

  afterEach(() => {
    resetResendEmailQueueForTest();
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

  it("連続送信は2通目のResendリクエスト開始を送信間隔ぶん待つ", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const send = vi.fn(async () => ({
      data: { id: `email_${send.mock.calls.length}` },
      error: null,
      headers: { "ratelimit-remaining": "4" },
    }));

    const first = sendResendEmail(createResendMock(send), emailPayload, "test.first");
    await vi.advanceTimersByTimeAsync(0);

    await expect(first).resolves.toBe("email_1");
    expect(send).toHaveBeenCalledTimes(1);

    const second = sendResendEmail(createResendMock(send), emailPayload, "test.second");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(RESEND_EMAIL_SEND_INTERVAL_MS - 1);
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);

    await expect(second).resolves.toBe("email_2");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("rate limit は retry-after に従って再試行する", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(console, "warn").mockImplementation(() => {});
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
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000 + RESEND_RETRY_DELAY_PADDING_MS - 1);
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toBe("email_retry_ok");
    expect(send).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("daily quota exceeded は再試行せず失敗にする", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn().mockResolvedValue({
      data: null,
      error: { name: "daily_quota_exceeded", statusCode: 429, message: "Daily quota exceeded" },
      headers: { "retry-after": "60" },
    });

    await expect(sendResendEmail(createResendMock(send), emailPayload, "test.dailyQuota")).rejects.toThrow(
      "Resend email send failed: daily_quota_exceeded Daily quota exceeded",
    );
    expect(send).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledOnce();
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

  it("タイムアウト時は同じIdempotency-Keyで再試行する", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({
        data: { id: "email_after_timeout" },
        error: null,
        headers: { "ratelimit-remaining": "3" },
      });

    const result = sendResendEmail(createResendMock(send), emailPayload, "test.timeout");
    await vi.advanceTimersByTimeAsync(RESEND_EMAIL_SEND_TIMEOUT_MS);
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000 + RESEND_RETRY_DELAY_PADDING_MS);

    await expect(result).resolves.toBe("email_after_timeout");
    expect(send).toHaveBeenCalledTimes(2);

    const firstOptions = send.mock.calls[0][1];
    const secondOptions = send.mock.calls[1][1];
    expect(firstOptions.idempotencyKey).toBe(secondOptions.idempotencyKey);
    expect(firstOptions.signal.aborted).toBe(true);
    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("retry上限で失敗したときだけ最終attemptをerrorにする", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn().mockResolvedValue({
      data: null,
      error: { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" },
      headers: null,
    });

    const result = sendResendEmail(createResendMock(send), emailPayload, "test.retryLimit");
    const expectation = expect(result).rejects.toThrow(
      "Resend email send failed: rate_limit_exceeded Too many requests",
    );
    await vi.advanceTimersByTimeAsync(20_000);

    await expectation;
    expect(send).toHaveBeenCalledTimes(4);
    expect(console.warn).toHaveBeenCalledTimes(3);
    expect(console.error).toHaveBeenCalledOnce();
  });
});
