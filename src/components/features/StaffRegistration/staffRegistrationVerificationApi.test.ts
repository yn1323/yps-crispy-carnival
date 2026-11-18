import { afterEach, describe, expect, it, vi } from "vitest";
import { CONVEX_SITE_URL } from "@/src/configs/publicEnv";
import {
  confirmStaffRegistrationCode,
  resendStaffRegistrationCode,
  StaffRegistrationApiError,
  startStaffRegistrationVerification,
} from "./staffRegistrationVerificationApi";

const startInput = {
  token: "718cf80f-d4fb-4a5d-bf20-ad48044f31eb",
  name: "田中 花子",
  email: "hanako@example.com",
  acceptedLegal: true,
  requestId: "bb59ed1e-87ec-4409-b6dc-e2e0f3a95967",
  turnstileToken: "turnstile-token",
};
const verificationToken = "3f0c6a51-2b1f-4f0e-9d53-6c1f3b1a7a10";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function catchApiError(run: () => Promise<unknown>): Promise<StaffRegistrationApiError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof StaffRegistrationApiError) return error;
    throw error;
  }
  throw new Error("API error was not thrown");
}

describe("staffRegistrationVerificationApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("入力内容をJSONで送り、引換tokenと残り時間を受け取る", async () => {
    const fetchMock = stubFetch(
      jsonResponse({ status: "code_sent", verificationToken, resendAfterMs: 60_000, codeTtlMs: 600_000 }),
    );

    await expect(startStaffRegistrationVerification(startInput)).resolves.toEqual({
      verificationToken,
      resendAfterMs: 60_000,
      codeTtlMs: 600_000,
    });
    expect(fetchMock.mock.calls).toEqual([
      [
        `${CONVEX_SITE_URL}/staff-registration/verification/start`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(startInput) },
      ],
    ]);
  });

  it("確認コードの照合と再送を、それぞれの入口へ引換tokenつきで送る", async () => {
    const confirmInput = { token: startInput.token, verificationToken, code: "１２３ 456" };
    const resendInput = { token: startInput.token, verificationToken };
    const fetchMock = stubFetch(
      jsonResponse({ status: "accepted" }),
      jsonResponse({ status: "code_sent", resendAfterMs: 60_000, codeTtlMs: 600_000 }),
    );

    await expect(confirmStaffRegistrationCode(confirmInput)).resolves.toBeUndefined();
    await expect(resendStaffRegistrationCode(resendInput)).resolves.toEqual({
      resendAfterMs: 60_000,
      codeTtlMs: 600_000,
    });
    expect(fetchMock.mock.calls).toEqual([
      [
        `${CONVEX_SITE_URL}/staff-registration/verification/confirm`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(confirmInput) },
      ],
      [
        `${CONVEX_SITE_URL}/staff-registration/verification/resend`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(resendInput) },
      ],
    ]);
  });

  it("serverが返した文言と分類と残り時間を、エラーとして画面へ渡す", async () => {
    stubFetch(
      jsonResponse({ error: "確認コードが違います。", code: "code_mismatch" }, 400),
      jsonResponse({ error: "確認コードは1分に1回まで送れます。", code: "cooldown", resendAfterMs: 42_000 }, 429),
    );

    const mismatch = await catchApiError(() =>
      confirmStaffRegistrationCode({ token: startInput.token, verificationToken, code: "000000" }),
    );
    const cooldown = await catchApiError(() =>
      resendStaffRegistrationCode({ token: startInput.token, verificationToken }),
    );

    expect({ message: mismatch.message, code: mismatch.code, resendAfterMs: mismatch.resendAfterMs }).toEqual({
      message: "確認コードが違います。",
      code: "code_mismatch",
      resendAfterMs: undefined,
    });
    expect({ message: cooldown.message, code: cooldown.code, resendAfterMs: cooldown.resendAfterMs }).toEqual({
      message: "確認コードは1分に1回まで送れます。",
      code: "cooldown",
      resendAfterMs: 42_000,
    });
  });

  it("非JSONの応答、未知の分類、形の崩れた成功応答は、安全な文言へ一般化する", async () => {
    stubFetch(
      new Response("provider details", { status: 502 }),
      jsonResponse({ error: "送信内容を確認してください。", code: "internal_detail", resendAfterMs: "soon" }, 400),
      jsonResponse({ status: "code_sent", verificationToken, resendAfterMs: 60_000 }),
    );

    const nonJson = await catchApiError(() => startStaffRegistrationVerification(startInput));
    const unknownCode = await catchApiError(() =>
      confirmStaffRegistrationCode({ token: startInput.token, verificationToken, code: "000000" }),
    );
    const malformedSuccess = await catchApiError(() => startStaffRegistrationVerification(startInput));

    expect(nonJson.message).toBe("確認コードを送れませんでした。\n少し時間をおいてお試しください。");
    expect({ message: unknownCode.message, code: unknownCode.code, resendAfterMs: unknownCode.resendAfterMs }).toEqual({
      message: "送信内容を確認してください。",
      code: undefined,
      resendAfterMs: undefined,
    });
    expect(malformedSuccess.message).toBe("確認コードを送れませんでした。\n少し時間をおいてお試しください。");
  });
});
