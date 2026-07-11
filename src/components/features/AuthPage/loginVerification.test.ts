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

  it("確認コードの送信先と入力コードをClerkへ渡す", async () => {
    const prepareSecondFactor = vi.fn().mockResolvedValue(undefined);
    const attemptSecondFactor = vi.fn().mockResolvedValue({ status: "complete", createdSessionId: "sess_123" });

    await prepareClientTrustEmailCode({ prepareSecondFactor }, "idn_email");
    const result = await verifyClientTrustEmailCode({ attemptSecondFactor }, "123456");

    expect(prepareSecondFactor).toHaveBeenCalledOnce();
    expect(prepareSecondFactor).toHaveBeenCalledWith({ strategy: "email_code", emailAddressId: "idn_email" });
    expect(attemptSecondFactor).toHaveBeenCalledOnce();
    expect(attemptSecondFactor).toHaveBeenCalledWith({ strategy: "email_code", code: "123456" });
    expect(result).toEqual({ status: "complete", createdSessionId: "sess_123" });
  });

  it("画面表示用のメールアドレスを部分的に伏せる", () => {
    expect(maskEmailAddress("manager@example.com")).toBe("ma***@example.com");
    expect(maskEmailAddress("yn1323+07112@gmail.com")).toBe("yn***@gmail.com");
    expect(maskEmailAddress("a@example.com")).toBe("a***@example.com");
    expect(maskEmailAddress("ma***@example.com")).toBe("ma***@example.com");
    expect(maskEmailAddress("invalid-email")).toBe("登録メールアドレス");
  });
});
