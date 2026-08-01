// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useSignIn: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useSignIn: mocks.useSignIn,
}));

import { useLoginFlowController } from "./useLoginFlowController";

function createSignInResource() {
  return {
    status: "needs_identifier" as string,
    createdSessionId: null as string | null,
    supportedSecondFactors: [] as unknown[],
    password: vi.fn().mockResolvedValue({ error: null }),
    sso: vi.fn().mockResolvedValue({ error: null }),
    mfa: {
      sendEmailCode: vi.fn().mockResolvedValue({ error: null }),
      verifyEmailCode: vi.fn().mockResolvedValue({ error: null }),
    },
    finalize: vi.fn().mockResolvedValue({ error: null }),
    reset: vi.fn().mockResolvedValue({ error: null }),
  };
}

beforeEach(() => {
  mocks.useSignIn.mockReset();
  window.history.replaceState(null, "", "/");
});

describe("useLoginFlowController", () => {
  it("メールアドレスとパスワードで完了したセッションをfinalizeする", async () => {
    const signIn = createSignInResource();
    signIn.password.mockImplementation(async () => {
      signIn.status = "complete";
      signIn.createdSessionId = "session-1";
      return { error: null };
    });
    mocks.useSignIn.mockReturnValue({ fetchStatus: "idle", signIn });
    const { result } = renderHook(() => useLoginFlowController({ redirectTo: "/dashboard?tab=staff" }));

    await act(async () => {
      await result.current.onLogin({ email: "manager@example.com", password: "password123" });
    });

    expect(signIn.password).toHaveBeenCalledOnce();
    expect(signIn.password).toHaveBeenCalledWith({
      emailAddress: "manager@example.com",
      password: "password123",
    });
    expect(signIn.finalize).toHaveBeenCalledOnce();
    expect(signIn.finalize).toHaveBeenCalledWith({ navigate: expect.any(Function) });
    const navigate = signIn.finalize.mock.calls[0]?.[0]?.navigate;
    const decorateUrl = vi.fn(() => "#dashboard?tab=staff");
    await navigate?.({ session: {} as never, decorateUrl });
    expect(decorateUrl).toHaveBeenCalledExactlyOnceWith("/dashboard?tab=staff");
    expect(window.location.hash).toBe("#dashboard?tab=staff");
    expect(result.current.errorMessage).toBeUndefined();
  });

  it("password操作がerrorを返した場合は本人確認やfinalizeへ進まない", async () => {
    const signIn = createSignInResource();
    signIn.password.mockResolvedValue({ error: { code: "form_password_incorrect" } });
    mocks.useSignIn.mockReturnValue({ fetchStatus: "idle", signIn });
    const { result } = renderHook(() => useLoginFlowController({ redirectTo: "/dashboard" }));

    await act(async () => {
      await result.current.onLogin({ email: "manager@example.com", password: "wrong-password" });
    });

    expect(result.current.errorMessage).toBe("メールアドレスまたはパスワードが正しくありません。");
    expect(result.current.loginStep).toBe("credentials");
    expect(signIn.mfa.sendEmailCode).not.toHaveBeenCalled();
    expect(signIn.finalize).not.toHaveBeenCalled();
  });

  it("Client Trustの確認コードを送信・検証してからfinalizeする", async () => {
    const signIn = createSignInResource();
    signIn.supportedSecondFactors = [
      {
        strategy: "email_code",
        emailAddressId: "email-1",
        safeIdentifier: "manager@example.com",
      },
    ];
    signIn.password.mockImplementation(async () => {
      signIn.status = "needs_client_trust";
      return { error: null };
    });
    signIn.mfa.verifyEmailCode.mockImplementation(async () => {
      signIn.status = "complete";
      signIn.createdSessionId = "session-1";
      return { error: null };
    });
    mocks.useSignIn.mockReturnValue({ fetchStatus: "idle", signIn });
    const { result } = renderHook(() => useLoginFlowController({ redirectTo: "/dashboard" }));

    await act(async () => {
      await result.current.onLogin({ email: "manager@example.com", password: "password123" });
    });

    expect(signIn.mfa.sendEmailCode).toHaveBeenCalledOnce();
    expect(signIn.mfa.sendEmailCode).toHaveBeenCalledWith();
    expect(result.current.loginStep).toBe("verify-email-code");
    expect(result.current.loginSafeIdentifier).toBe("ma***@example.com");
    expect(result.current.resendCooldownSeconds).toBe(30);
    expect(signIn.finalize).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.onVerifyLogin({ code: "123456" });
    });

    expect(signIn.mfa.verifyEmailCode).toHaveBeenCalledOnce();
    expect(signIn.mfa.verifyEmailCode).toHaveBeenCalledWith({ code: "123456" });
    expect(signIn.finalize).toHaveBeenCalledOnce();
  });

  it("Client Trustのコード送信がerrorを返した場合は確認stepへ進まない", async () => {
    const signIn = createSignInResource();
    signIn.supportedSecondFactors = [
      {
        strategy: "email_code",
        emailAddressId: "email-1",
        safeIdentifier: "ma***@example.com",
      },
    ];
    signIn.password.mockImplementation(async () => {
      signIn.status = "needs_client_trust";
      return { error: null };
    });
    signIn.mfa.sendEmailCode.mockResolvedValue({ error: { code: "form_code_expired" } });
    mocks.useSignIn.mockReturnValue({ fetchStatus: "idle", signIn });
    const { result } = renderHook(() => useLoginFlowController({ redirectTo: "/dashboard" }));

    await act(async () => {
      await result.current.onLogin({ email: "manager@example.com", password: "password123" });
    });

    expect(result.current.errorMessage).toBe("確認コードの有効期限が切れています。もう一度お試しください。");
    expect(result.current.loginStep).toBe("credentials");
    expect(signIn.finalize).not.toHaveBeenCalled();
  });

  it("GoogleログインはCore 3のsso引数を渡し、返却errorを画面へ出す", async () => {
    const signIn = createSignInResource();
    signIn.sso.mockResolvedValue({ error: { code: "too_many_requests" } });
    mocks.useSignIn.mockReturnValue({ fetchStatus: "idle", signIn });
    const { result } = renderHook(() => useLoginFlowController({ redirectTo: "/dashboard?tab=staff" }));

    await act(async () => {
      await result.current.onGoogle();
    });

    expect(signIn.sso).toHaveBeenCalledOnce();
    expect(signIn.sso).toHaveBeenCalledWith({
      strategy: "oauth_google",
      redirectCallbackUrl: "/sso-callback?redirect=%2Fdashboard%3Ftab%3Dstaff",
      redirectUrl: "/dashboard?tab=staff",
    });
    expect(result.current.errorMessage).toBe("試行回数が多すぎます。時間をおいてもう一度お試しください。");
    expect(signIn.finalize).not.toHaveBeenCalled();
  });
});
