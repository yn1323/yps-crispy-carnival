// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useSignIn: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useSignIn: mocks.useSignIn,
}));

import { useForgotPasswordFlowController } from "./useForgotPasswordFlowController";

function createSignInResource() {
  return {
    status: "needs_identifier" as string,
    createdSessionId: null as string | null,
    create: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordEmailCode: {
      sendCode: vi.fn().mockResolvedValue({ error: null }),
      verifyCode: vi.fn().mockResolvedValue({ error: null }),
      submitPassword: vi.fn().mockResolvedValue({ error: null }),
    },
    finalize: vi.fn().mockResolvedValue({ error: null }),
  };
}

beforeEach(() => {
  mocks.useSignIn.mockReset();
});

describe("useForgotPasswordFlowController", () => {
  it("リセットコードを送信・検証して新しいパスワードでセッションをfinalizeする", async () => {
    const signIn = createSignInResource();
    signIn.resetPasswordEmailCode.verifyCode.mockImplementation(async () => {
      signIn.status = "needs_new_password";
      return { error: null };
    });
    signIn.resetPasswordEmailCode.submitPassword.mockImplementation(async () => {
      signIn.status = "complete";
      signIn.createdSessionId = "session-1";
      return { error: null };
    });
    mocks.useSignIn.mockReturnValue({ fetchStatus: "idle", signIn });
    const { result } = renderHook(() => useForgotPasswordFlowController({ redirectTo: "/dashboard" }));

    await act(async () => {
      await result.current.onRequestReset({ email: "manager@example.com" });
    });

    expect(signIn.create).toHaveBeenCalledOnce();
    expect(signIn.create).toHaveBeenCalledWith({ identifier: "manager@example.com" });
    expect(signIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledOnce();
    expect(signIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledWith();
    expect(result.current.step).toBe("reset");
    expect(result.current.email).toBe("manager@example.com");
    expect(signIn.finalize).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.onResetPassword({ code: "123456", password: "new-password123" });
    });

    expect(signIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledOnce();
    expect(signIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledWith({ code: "123456" });
    expect(signIn.resetPasswordEmailCode.submitPassword).toHaveBeenCalledOnce();
    expect(signIn.resetPasswordEmailCode.submitPassword).toHaveBeenCalledWith({ password: "new-password123" });
    expect(signIn.finalize).toHaveBeenCalledOnce();
    expect(signIn.finalize).toHaveBeenCalledWith({ navigate: expect.any(Function) });
    expect(result.current.errorMessage).toBeUndefined();
  });

  it("create操作がerrorを返した場合はコード送信やreset stepへ進まない", async () => {
    const signIn = createSignInResource();
    signIn.create.mockResolvedValue({ error: { code: "form_identifier_not_found" } });
    mocks.useSignIn.mockReturnValue({ fetchStatus: "idle", signIn });
    const { result } = renderHook(() => useForgotPasswordFlowController({ redirectTo: "/dashboard" }));

    await act(async () => {
      await result.current.onRequestReset({ email: "missing@example.com" });
    });

    expect(result.current.errorMessage).toBe("このメールアドレスのアカウントが見つかりません。");
    expect(result.current.step).toBe("request");
    expect(result.current.email).toBe("");
    expect(signIn.resetPasswordEmailCode.sendCode).not.toHaveBeenCalled();
    expect(signIn.finalize).not.toHaveBeenCalled();
  });

  it("コード送信がerrorを返した場合はreset stepへ進まない", async () => {
    const signIn = createSignInResource();
    signIn.resetPasswordEmailCode.sendCode.mockResolvedValue({ error: { code: "too_many_requests" } });
    mocks.useSignIn.mockReturnValue({ fetchStatus: "idle", signIn });
    const { result } = renderHook(() => useForgotPasswordFlowController({ redirectTo: "/dashboard" }));

    await act(async () => {
      await result.current.onRequestReset({ email: "manager@example.com" });
    });

    expect(result.current.errorMessage).toBe("試行回数が多すぎます。時間をおいてもう一度お試しください。");
    expect(result.current.step).toBe("request");
    expect(result.current.email).toBe("");
    expect(signIn.finalize).not.toHaveBeenCalled();
  });

  it("コード検証がerrorを返した場合はパスワード送信やfinalizeをしない", async () => {
    const signIn = createSignInResource();
    signIn.resetPasswordEmailCode.verifyCode.mockResolvedValue({ error: { code: "form_code_incorrect" } });
    mocks.useSignIn.mockReturnValue({ fetchStatus: "idle", signIn });
    const { result } = renderHook(() => useForgotPasswordFlowController({ redirectTo: "/dashboard" }));

    await act(async () => {
      await result.current.onRequestReset({ email: "manager@example.com" });
    });
    await act(async () => {
      await result.current.onResetPassword({ code: "000000", password: "new-password123" });
    });

    expect(result.current.errorMessage).toBe("確認コードが正しくありません。");
    expect(result.current.step).toBe("reset");
    expect(signIn.resetPasswordEmailCode.submitPassword).not.toHaveBeenCalled();
    expect(signIn.finalize).not.toHaveBeenCalled();
  });

  it("新しいパスワード送信がerrorを返した場合はfinalizeしない", async () => {
    const signIn = createSignInResource();
    signIn.resetPasswordEmailCode.verifyCode.mockImplementation(async () => {
      signIn.status = "needs_new_password";
      return { error: null };
    });
    signIn.resetPasswordEmailCode.submitPassword.mockResolvedValue({
      error: { code: "form_password_length_too_short" },
    });
    mocks.useSignIn.mockReturnValue({ fetchStatus: "idle", signIn });
    const { result } = renderHook(() => useForgotPasswordFlowController({ redirectTo: "/dashboard" }));

    await act(async () => {
      await result.current.onRequestReset({ email: "manager@example.com" });
    });
    await act(async () => {
      await result.current.onResetPassword({ code: "123456", password: "short" });
    });

    expect(result.current.errorMessage).toBe("パスワードは8文字以上で入力してください。");
    expect(result.current.step).toBe("reset");
    expect(signIn.finalize).not.toHaveBeenCalled();
  });
});
