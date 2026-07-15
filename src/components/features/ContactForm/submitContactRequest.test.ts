import { afterEach, describe, expect, it, vi } from "vitest";
import { CONVEX_SITE_URL } from "@/src/configs/env";
import { type ContactSubmitData, submitContactRequest } from "./submitContactRequest";

const input: ContactSubmitData = {
  type: "introduction",
  name: "田中 太郎",
  email: "tanaka@example.com",
  organization: "シフトリ渋谷店",
  message: "導入について相談したいです",
  acceptedPrivacy: true,
  turnstileToken: "turnstile-token",
  requestId: "6ec31541-7f1a-42d9-9659-a4cc66ab477f",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitContactRequest", () => {
  it("問い合わせHTTP actionへ同じpayloadをPOSTする", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "accepted" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await submitContactRequest(input);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(`${CONVEX_SITE_URL}/contact/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  });

  it("HTTP actionが拒否した理由を利用者向けエラーとして返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "送信回数が多すぎます。少し時間をおいてお試しください" }),
      }),
    );

    await expect(submitContactRequest(input)).rejects.toThrow("送信回数が多すぎます。少し時間をおいてお試しください");
  });
});
