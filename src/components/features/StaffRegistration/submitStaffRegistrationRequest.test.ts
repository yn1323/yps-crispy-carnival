import { afterEach, describe, expect, it, vi } from "vitest";
import { CONVEX_SITE_URL } from "@/src/configs/publicEnv";
import { submitStaffRegistrationRequest } from "./submitStaffRegistrationRequest";

const input = {
  token: "718cf80f-d4fb-4a5d-bf20-ad48044f31eb",
  name: "田中 花子",
  email: "hanako@example.com",
  acceptedLegal: true,
  requestId: "bb59ed1e-87ec-4409-b6dc-e2e0f3a95967",
  turnstileToken: "turnstile-token",
};

describe("submitStaffRegistrationRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("HTTP ActionへJSONでTurnstile tokenとrequest IDを送る", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: "accepted" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitStaffRegistrationRequest(input)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(`${CONVEX_SITE_URL}/staff-registration/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  });

  it("安全なserver errorを利用者へ返し、非JSON応答は一般化する", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "セキュリティ確認をやり直してください" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response("provider details", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitStaffRegistrationRequest(input)).rejects.toThrow("セキュリティ確認をやり直してください");
    await expect(submitStaffRegistrationRequest(input)).rejects.toThrow(
      "スタッフ登録を申請できませんでした。少し時間をおいてお試しください",
    );
  });
});
