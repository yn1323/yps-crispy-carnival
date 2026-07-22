import { describe, expect, it, vi } from "vitest";
import {
  findClientTrustEmailCodeFactor,
  isCompletedSignIn,
  maskEmailAddress,
  prepareClientTrustEmailCode,
  verifyClientTrustEmailCode,
} from "./loginVerification";

describe("Client Trustのメール確認", () => {
  const emailFactor = {
    strategy: "email_code" as const,
    emailAddressId: "idn_email",
    safeIdentifier: "ma***@example.com",
  };

  it.each(["needs_client_trust", "needs_second_factor"])("%sではメール確認用factorを選ぶ", (status) => {
    expect(
      findClientTrustEmailCodeFactor({
        status,
        supportedSecondFactors: [{ strategy: "totp" }, emailFactor],
      }),
    ).toEqual(emailFactor);
  });

  it("ログイン完了や未対応MFAではメール確認へ進めない", () => {
    expect(
      findClientTrustEmailCodeFactor({ status: "complete", supportedSecondFactors: [emailFactor] }),
    ).toBeUndefined();
    expect(
      findClientTrustEmailCodeFactor({
        status: "needs_second_factor",
        supportedSecondFactors: [{ strategy: "totp" }],
      }),
    ).toBeUndefined();
  });

  it("メールアドレスIDがないfactorは使わない", () => {
    expect(
      findClientTrustEmailCodeFactor({
        status: "needs_client_trust",
        supportedSecondFactors: [{ strategy: "email_code", safeIdentifier: "ma***@example.com" }],
      }),
    ).toBeUndefined();
    expect(
      findClientTrustEmailCodeFactor({
        status: "needs_client_trust",
        supportedSecondFactors: [{ strategy: "email_code", emailAddressId: "idn_email", safeIdentifier: 123 }],
      }),
    ).toBeUndefined();
  });

  it("completeかつセッションIDがある場合だけログイン完了とする", () => {
    expect(isCompletedSignIn({ status: "complete", createdSessionId: "sess_123" })).toBe(true);
    expect(isCompletedSignIn({ status: "complete", createdSessionId: null })).toBe(false);
    expect(isCompletedSignIn({ status: "needs_second_factor", createdSessionId: "sess_123" })).toBe(false);
  });

  it("Client Trustの確認コードを送信・検証し、更新後のログイン状態を返す", async () => {
    const sendEmailCode = vi.fn().mockResolvedValue({ error: null });
    const signIn = {
      status: "needs_client_trust" as string | null,
      createdSessionId: null as string | null,
      mfa: {
        sendEmailCode,
        verifyEmailCode: vi.fn().mockImplementation(async ({ code }: { code: string }) => {
          expect(code).toBe("123456");
          signIn.status = "complete";
          signIn.createdSessionId = "sess_123";
          return { error: null };
        }),
      },
    };

    await prepareClientTrustEmailCode(signIn);
    const result = await verifyClientTrustEmailCode(signIn, "123456");

    expect(sendEmailCode).toHaveBeenCalledOnce();
    expect(sendEmailCode).toHaveBeenCalledWith();
    expect(signIn.mfa.verifyEmailCode).toHaveBeenCalledOnce();
    expect(signIn.mfa.verifyEmailCode).toHaveBeenCalledWith({ code: "123456" });
    expect(result).toEqual({ status: "complete", createdSessionId: "sess_123" });
  });

  it("確認コードの送信errorを呼び出し元へ返す", async () => {
    const error = new Error("send failed");

    await expect(
      prepareClientTrustEmailCode({
        mfa: {
          sendEmailCode: vi.fn().mockResolvedValue({ error }),
          verifyEmailCode: vi.fn(),
        },
      }),
    ).rejects.toBe(error);
  });

  it("確認コードの検証errorを呼び出し元へ返す", async () => {
    const error = new Error("verify failed");

    await expect(
      verifyClientTrustEmailCode(
        {
          status: "needs_client_trust",
          createdSessionId: null,
          mfa: {
            sendEmailCode: vi.fn(),
            verifyEmailCode: vi.fn().mockResolvedValue({ error }),
          },
        },
        "123456",
      ),
    ).rejects.toBe(error);
  });

  it("画面表示用のメールアドレスを部分的に伏せる", () => {
    expect(maskEmailAddress("manager@example.com")).toBe("ma***@example.com");
    expect(maskEmailAddress("yn1323+07112@gmail.com")).toBe("yn***@gmail.com");
    expect(maskEmailAddress("a@example.com")).toBe("a***@example.com");
    expect(maskEmailAddress("ma***@example.com")).toBe("ma***@example.com");
    expect(maskEmailAddress("invalid-email")).toBe("登録メールアドレス");
  });
});
