import { describe, expect, it, vi } from "vitest";
import { resetOAuthAttempts } from "./resetOAuthAttempts";

describe("resetOAuthAttempts", () => {
  it("signIn、signUpの順に古い試行を破棄する", async () => {
    const calls: string[] = [];
    const signIn = {
      reset: vi.fn(async () => {
        calls.push("signIn");
        return { error: null };
      }),
    };
    const signUp = {
      reset: vi.fn(async () => {
        calls.push("signUp");
        return { error: null };
      }),
    };

    await expect(resetOAuthAttempts({ signIn, signUp })).resolves.toBeUndefined();

    expect(calls).toEqual(["signIn", "signUp"]);
  });

  it("signInのresetが失敗した場合はsignUpへ進まない", async () => {
    const clerkError = { code: "attempt_reset_failed" };
    const signIn = { reset: vi.fn().mockResolvedValue({ error: clerkError }) };
    const signUp = { reset: vi.fn().mockResolvedValue({ error: null }) };

    await expect(resetOAuthAttempts({ signIn, signUp })).rejects.toBe(clerkError);

    expect(signUp.reset).not.toHaveBeenCalled();
  });

  it("signUpのresetが失敗した場合はそのerrorを返す", async () => {
    const clerkError = { code: "attempt_reset_failed" };
    const signIn = { reset: vi.fn().mockResolvedValue({ error: null }) };
    const signUp = { reset: vi.fn().mockResolvedValue({ error: clerkError }) };

    await expect(resetOAuthAttempts({ signIn, signUp })).rejects.toBe(clerkError);

    expect(signIn.reset).toHaveBeenCalledOnce();
    expect(signUp.reset).toHaveBeenCalledOnce();
  });
});
