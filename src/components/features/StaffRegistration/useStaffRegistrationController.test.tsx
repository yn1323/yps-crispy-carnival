// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startStaffRegistrationVerification: vi.fn(),
  confirmStaffRegistrationCode: vi.fn(),
  resendStaffRegistrationCode: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  trackProductEvent: vi.fn(),
}));

vi.mock("./staffRegistrationVerificationApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./staffRegistrationVerificationApi")>()),
  startStaffRegistrationVerification: mocks.startStaffRegistrationVerification,
  confirmStaffRegistrationCode: mocks.confirmStaffRegistrationCode,
  resendStaffRegistrationCode: mocks.resendStaffRegistrationCode,
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

vi.mock("@/src/lib/webMeasurement", () => ({ trackProductEvent: mocks.trackProductEvent }));

vi.mock("@/src/configs/publicEnv", () => ({ TURNSTILE_SITE_KEY: "site-key", CONVEX_SITE_URL: "https://example.test" }));

import { StaffRegistrationApiError } from "./staffRegistrationVerificationApi";
import { useStaffRegistrationController } from "./useStaffRegistrationController";

const NOW = new Date("2026-07-21T12:00:00+09:00").getTime();
const TOKEN = "718cf80f-d4fb-4a5d-bf20-ad48044f31eb";
const VERIFICATION_TOKEN = "3f0c6a51-2b1f-4f0e-9d53-6c1f3b1a7a10";
const formData = { name: "田中 花子", email: "hanako@example.com", acceptedLegal: true as const };

function storedPendingVerifications(): unknown[] {
  return Array.from({ length: window.sessionStorage.length }, (_, index) =>
    JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(index) ?? "") ?? "null"),
  );
}

/** Turnstileの確認を済ませ、入力内容を送って確認コードの入力待ちにする。 */
async function startVerification(result: { current: ReturnType<typeof useStaffRegistrationController> }) {
  act(() => result.current.turnstile.onVerify("turnstile-token"));
  await act(async () => {
    await result.current.handleSubmit(formData);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  window.sessionStorage.clear();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.startStaffRegistrationVerification.mockResolvedValue({
    verificationToken: VERIFICATION_TOKEN,
    resendAfterMs: 60_000,
    codeTtlMs: 600_000,
  });
  mocks.confirmStaffRegistrationCode.mockResolvedValue(undefined);
  mocks.resendStaffRegistrationCode.mockResolvedValue({ resendAfterMs: 60_000, codeTtlMs: 600_000 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useStaffRegistrationController", () => {
  it("Turnstileの確認が済む前は送らず、確認を待つよう案内する", async () => {
    const { result } = renderHook(() => useStaffRegistrationController(TOKEN));

    await act(async () => {
      await result.current.handleSubmit(formData);
    });

    expect(mocks.startStaffRegistrationVerification).not.toHaveBeenCalled();
    expect(result.current.verificationError).not.toBeNull();
    expect(result.current.codeStep).toBeNull();
  });

  it("入力内容を送ると確認コードの入力待ちになり、残り時間をこの端末の時刻へ直して同じtabに残す", async () => {
    const { result } = renderHook(() => useStaffRegistrationController(TOKEN));
    const widgetKeyBefore = result.current.turnstile.widgetKey;

    await startVerification(result);

    expect(mocks.startStaffRegistrationVerification.mock.calls).toEqual([
      [{ token: TOKEN, ...formData, turnstileToken: "turnstile-token", requestId: expect.any(String) }],
    ]);
    expect(result.current.codeStep).toMatchObject({ email: "hanako@example.com", resendAvailableAt: NOW + 60_000 });
    expect(result.current.isSubmitted).toBe(false);
    expect(storedPendingVerifications()).toEqual([
      {
        name: "田中 花子",
        email: "hanako@example.com",
        verificationToken: VERIFICATION_TOKEN,
        resendAvailableAt: NOW + 60_000,
        codeExpiresAt: NOW + 600_000,
      },
    ]);
    // 使い終わったTurnstileのtokenを捨て、次の送信に備えて確認欄を作り直す。
    expect(result.current.turnstile.widgetKey).toBe(widgetKeyBefore + 1);
  });

  it("再読み込み後は、同じtabに残した入力待ちから確認コードの入力を続けられる", async () => {
    const first = renderHook(() => useStaffRegistrationController(TOKEN));
    await startVerification(first.result);
    first.unmount();

    const reloaded = renderHook(() => useStaffRegistrationController(TOKEN));

    expect(reloaded.result.current.codeStep).toMatchObject({
      email: "hanako@example.com",
      resendAvailableAt: NOW + 60_000,
    });
    expect(reloaded.result.current.initialFormValues).toEqual({ name: "田中 花子", email: "hanako@example.com" });
  });

  it("入力画面へ戻って同じ内容のまま進むと、送り直さずに届いている確認コードの入力へ戻る", async () => {
    const { result } = renderHook(() => useStaffRegistrationController(TOKEN));
    await startVerification(result);

    act(() => result.current.codeStep?.onReviseEmail());
    expect(result.current.codeStep).toBeNull();
    await act(async () => {
      await result.current.handleSubmit({ ...formData, email: " Hanako@Example.com " });
    });

    expect(mocks.startStaffRegistrationVerification).toHaveBeenCalledTimes(1);
    expect(result.current.codeStep).toMatchObject({ email: "hanako@example.com" });
  });

  it("メールアドレスを直して進むと、新しい宛先へ確認コードを送り直す", async () => {
    const { result } = renderHook(() => useStaffRegistrationController(TOKEN));
    await startVerification(result);
    mocks.startStaffRegistrationVerification.mockResolvedValue({
      verificationToken: "9a1d4e0b-5c7f-4d2a-8b3e-1f6a7c9d0e21",
      resendAfterMs: 60_000,
      codeTtlMs: 600_000,
    });

    act(() => result.current.codeStep?.onReviseEmail());
    act(() => result.current.turnstile.onVerify("turnstile-token-2"));
    await act(async () => {
      await result.current.handleSubmit({ ...formData, email: "hanako@example.org" });
    });

    expect(mocks.startStaffRegistrationVerification).toHaveBeenCalledTimes(2);
    expect(result.current.codeStep).toMatchObject({ email: "hanako@example.org" });
    expect(storedPendingVerifications()).toMatchObject([
      { email: "hanako@example.org", verificationToken: "9a1d4e0b-5c7f-4d2a-8b3e-1f6a7c9d0e21" },
    ]);
  });

  it("確認コードが合うと申請完了になり、入力待ちを消して計測イベントを1回送る", async () => {
    const { result } = renderHook(() => useStaffRegistrationController(TOKEN));
    await startVerification(result);

    await act(async () => {
      await result.current.codeStep?.onConfirmCode("123456");
    });

    expect(mocks.confirmStaffRegistrationCode.mock.calls).toEqual([
      [{ token: TOKEN, verificationToken: VERIFICATION_TOKEN, code: "123456" }],
    ]);
    expect(result.current.isSubmitted).toBe(true);
    expect(storedPendingVerifications()).toEqual([]);
    expect(mocks.trackProductEvent.mock.calls).toEqual([[{ kind: "staff_register_submit" }]]);
  });

  it.each(["code_mismatch", "code_unusable"] as const)(
    "照合の%sは入力欄のエラーとして出し、入力し直すと消える",
    async (code) => {
      mocks.confirmStaffRegistrationCode.mockRejectedValue(new StaffRegistrationApiError("serverの文言", { code }));
      const { result } = renderHook(() => useStaffRegistrationController(TOKEN));
      await startVerification(result);

      await act(async () => {
        await result.current.codeStep?.onConfirmCode("000000");
      });

      expect(result.current.codeStep?.codeError).toBe("serverの文言");
      expect(result.current.isSubmitted).toBe(false);
      expect(mocks.showErrorToast).not.toHaveBeenCalled();
      expect(mocks.trackProductEvent).not.toHaveBeenCalled();

      act(() => result.current.codeStep?.onCodeChange());
      expect(result.current.codeStep?.codeError).toBeNull();
    },
  );

  it("再送に成功すると、再送できる時刻とコードの期限を更新する", async () => {
    const { result } = renderHook(() => useStaffRegistrationController(TOKEN));
    await startVerification(result);
    vi.setSystemTime(NOW + 61_000);

    await act(async () => {
      await result.current.codeStep?.onResend();
    });

    expect(mocks.resendStaffRegistrationCode.mock.calls).toEqual([
      [{ token: TOKEN, verificationToken: VERIFICATION_TOKEN }],
    ]);
    expect(result.current.codeStep?.resendAvailableAt).toBe(NOW + 61_000 + 60_000);
    expect(storedPendingVerifications()).toMatchObject([
      { resendAvailableAt: NOW + 61_000 + 60_000, codeExpiresAt: NOW + 61_000 + 600_000 },
    ]);
  });

  it("再送が早すぎたら、serverが返した残り時間で待ち時間を合わせ直す", async () => {
    mocks.resendStaffRegistrationCode.mockRejectedValue(
      new StaffRegistrationApiError("少し時間をおいてください", { code: "cooldown", resendAfterMs: 42_000 }),
    );
    const { result } = renderHook(() => useStaffRegistrationController(TOKEN));
    await startVerification(result);
    vi.setSystemTime(NOW + 5_000);

    await act(async () => {
      await result.current.codeStep?.onResend();
    });

    expect(result.current.codeStep?.resendAvailableAt).toBe(NOW + 5_000 + 42_000);
    expect(mocks.showErrorToast).toHaveBeenCalledTimes(1);
  });

  it("serverに入力待ちが残っていなければ、入力待ちを消して確認コードを送るところへ戻す", async () => {
    mocks.resendStaffRegistrationCode.mockRejectedValue(
      new StaffRegistrationApiError("入力からやり直してください", { code: "verification_unusable" }),
    );
    const { result } = renderHook(() => useStaffRegistrationController(TOKEN));
    await startVerification(result);

    await act(async () => {
      await result.current.codeStep?.onResend();
    });

    expect(result.current.codeStep).toBeNull();
    expect(storedPendingVerifications()).toEqual([]);
    expect(mocks.showErrorToast).toHaveBeenCalledTimes(1);
  });
});
