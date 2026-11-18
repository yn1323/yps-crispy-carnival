// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useSignIn: vi.fn(),
  useSignUp: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useSignIn: mocks.useSignIn,
  useSignUp: mocks.useSignUp,
}));

import { useSignupFlowController } from "./useSignupFlowController";

function createSignUpResource() {
  return {
    status: "missing_requirements" as string,
    createdSessionId: null as string | null,
    unverifiedFields: ["email_address"],
    password: vi.fn().mockResolvedValue({ error: null }),
    sso: vi.fn().mockResolvedValue({ error: null }),
    verifications: {
      sendEmailCode: vi.fn().mockResolvedValue({ error: null }),
      verifyEmailCode: vi.fn().mockResolvedValue({ error: null }),
    },
    finalize: vi.fn().mockResolvedValue({ error: null }),
    reset: vi.fn().mockResolvedValue({ error: null }),
  };
}

function createSignInResource() {
  return {
    reset: vi.fn().mockResolvedValue({ error: null }),
  };
}

beforeEach(() => {
  mocks.useSignIn.mockReset();
  mocks.useSignIn.mockReturnValue({ fetchStatus: "idle", signIn: createSignInResource() });
  mocks.useSignUp.mockReset();
});

describe("useSignupFlowController", () => {
  it("パスワード登録後にメールを確認してセッションをfinalizeする", async () => {
    const signUp = createSignUpResource();
    signUp.verifications.verifyEmailCode.mockImplementation(async () => {
      signUp.status = "complete";
      signUp.createdSessionId = "session-1";
      return { error: null };
    });
    mocks.useSignUp.mockReturnValue({ fetchStatus: "idle", signUp });
    const { result } = renderHook(() => useSignupFlowController({ redirectTo: "/dashboard?tab=staff" }));

    await act(async () => {
      await result.current.onSignup({ email: "manager@example.com", password: "password123" });
    });

    expect(signUp.password).toHaveBeenCalledOnce();
    expect(signUp.password).toHaveBeenCalledWith({
      emailAddress: "manager@example.com",
      password: "password123",
    });
    expect(signUp.verifications.sendEmailCode).toHaveBeenCalledOnce();
    expect(signUp.verifications.sendEmailCode).toHaveBeenCalledWith();
    expect(result.current.isVerificationStep).toBe(true);
    expect(signUp.finalize).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.onVerifyEmail({ code: "123456" });
    });

    expect(signUp.verifications.verifyEmailCode).toHaveBeenCalledOnce();
    expect(signUp.verifications.verifyEmailCode).toHaveBeenCalledWith({ code: "123456" });
    expect(signUp.finalize).toHaveBeenCalledOnce();
    expect(signUp.finalize).toHaveBeenCalledWith({ navigate: expect.any(Function) });
    expect(result.current.errorMessage).toBeUndefined();
  });

  it("password操作がerrorを返した場合は確認コード送信やfinalizeへ進まない", async () => {
    const signUp = createSignUpResource();
    signUp.password.mockResolvedValue({ error: { code: "form_identifier_exists" } });
    mocks.useSignUp.mockReturnValue({ fetchStatus: "idle", signUp });
    const { result } = renderHook(() => useSignupFlowController({ redirectTo: "/dashboard" }));

    await act(async () => {
      await result.current.onSignup({ email: "manager@example.com", password: "password123" });
    });

    expect(result.current.errorMessage).toBe(
      "このメールアドレスはすでに登録されています。\nログインをお試しください。",
    );
    expect(result.current.isVerificationStep).toBe(false);
    expect(signUp.verifications.sendEmailCode).not.toHaveBeenCalled();
    expect(signUp.finalize).not.toHaveBeenCalled();
  });

  it("確認コード送信がerrorを返した場合は確認stepへ進まない", async () => {
    const signUp = createSignUpResource();
    signUp.verifications.sendEmailCode.mockResolvedValue({ error: { code: "too_many_requests" } });
    mocks.useSignUp.mockReturnValue({ fetchStatus: "idle", signUp });
    const { result } = renderHook(() => useSignupFlowController({ redirectTo: "/dashboard" }));

    await act(async () => {
      await result.current.onSignup({ email: "manager@example.com", password: "password123" });
    });

    expect(result.current.errorMessage).toBe("試行回数が多すぎます。\n時間をおいて、もう一度お試しください。");
    expect(result.current.isVerificationStep).toBe(false);
    expect(signUp.finalize).not.toHaveBeenCalled();
  });

  it("確認コード検証がerrorを返した場合はfinalizeしない", async () => {
    const signUp = createSignUpResource();
    signUp.verifications.verifyEmailCode.mockResolvedValue({ error: { code: "form_code_incorrect" } });
    mocks.useSignUp.mockReturnValue({ fetchStatus: "idle", signUp });
    const { result } = renderHook(() => useSignupFlowController({ redirectTo: "/dashboard" }));

    await act(async () => {
      await result.current.onSignup({ email: "manager@example.com", password: "password123" });
    });
    await act(async () => {
      await result.current.onVerifyEmail({ code: "000000" });
    });

    expect(result.current.errorMessage).toBe("確認コードが誤っています。");
    expect(result.current.isVerificationStep).toBe(true);
    expect(signUp.finalize).not.toHaveBeenCalled();
  });

  it("Google登録はCore 3のsso引数を渡し、返却errorを画面へ出す", async () => {
    const signIn = createSignInResource();
    const signUp = createSignUpResource();
    signUp.sso.mockResolvedValue({ error: { code: "too_many_requests" } });
    mocks.useSignIn.mockReturnValue({ fetchStatus: "idle", signIn });
    mocks.useSignUp.mockReturnValue({ fetchStatus: "idle", signUp });
    const { result } = renderHook(() => useSignupFlowController({ redirectTo: "/dashboard?tab=staff" }));

    await act(async () => {
      await result.current.onGoogle();
    });

    expect(signIn.reset).toHaveBeenCalledOnce();
    expect(signUp.reset).toHaveBeenCalledOnce();
    expect(signUp.sso).toHaveBeenCalledOnce();
    expect(signIn.reset.mock.invocationCallOrder[0]).toBeLessThan(signUp.reset.mock.invocationCallOrder[0] ?? 0);
    expect(signUp.reset.mock.invocationCallOrder[0]).toBeLessThan(signUp.sso.mock.invocationCallOrder[0] ?? 0);
    expect(signUp.sso).toHaveBeenCalledWith({
      strategy: "oauth_google",
      redirectCallbackUrl: "/sso-callback?redirect=%2Fdashboard%3Ftab%3Dstaff",
      redirectUrl: "/dashboard?tab=staff",
    });
    expect(result.current.errorMessage).toBe("試行回数が多すぎます。\n時間をおいて、もう一度お試しください。");
    expect(signUp.finalize).not.toHaveBeenCalled();
  });

  it("Google登録はsignInのresetが失敗した場合にsignUpのresetとssoへ進まない", async () => {
    const signIn = createSignInResource();
    const signUp = createSignUpResource();
    signIn.reset.mockResolvedValue({ error: { code: "attempt_reset_failed", message: "provider detail" } });
    mocks.useSignIn.mockReturnValue({ fetchStatus: "idle", signIn });
    mocks.useSignUp.mockReturnValue({ fetchStatus: "idle", signUp });
    const { result } = renderHook(() => useSignupFlowController({ redirectTo: "/dashboard" }));

    await act(async () => {
      await result.current.onGoogle();
    });

    expect(signIn.reset).toHaveBeenCalledOnce();
    expect(signUp.reset).not.toHaveBeenCalled();
    expect(signUp.sso).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toBe("認証に失敗しました。\n入力内容を確認してください。");
    expect(result.current.errorMessage).not.toContain("provider detail");
  });

  it("signInのresourceが準備中ならGoogle登録の試行を変更しない", async () => {
    const signIn = createSignInResource();
    const signUp = createSignUpResource();
    mocks.useSignIn.mockReturnValue({ fetchStatus: "fetching", signIn });
    mocks.useSignUp.mockReturnValue({ fetchStatus: "idle", signUp });
    const { result } = renderHook(() => useSignupFlowController({ redirectTo: "/dashboard" }));

    await act(async () => {
      await result.current.onGoogle();
    });

    expect(signIn.reset).not.toHaveBeenCalled();
    expect(signUp.reset).not.toHaveBeenCalled();
    expect(signUp.sso).not.toHaveBeenCalled();
    expect(result.current.isSubmitting).toBe(true);
  });
});
