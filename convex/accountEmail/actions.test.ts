import type { UserIdentity } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import { runSyncMyPrimaryEmail } from "./actions";
import type { AccountEmailProvider } from "./provider";

const ISSUER = "https://quick-fox-12.clerk.accounts.dev";
const CONFIG = {
  secretKey: "sk_test_example",
  publishableKey: "pk_test_example",
  expectedIssuer: ISSUER,
};

describe("account email action", () => {
  it("未認証ではproviderとmutationを呼ばない", async () => {
    const provider = fakeProvider();
    const runMutation = vi.fn();

    const result = await runSyncMyPrimaryEmail(
      { auth: { getUserIdentity: vi.fn().mockResolvedValue(null) }, runMutation } as never,
      provider,
      CONFIG,
      "account-email-request",
    );

    expect(result).toEqual({ status: "conflict" });
    expect(provider.assertReady).not.toHaveBeenCalled();
    expect(provider.getVerifiedPrimaryEmail).not.toHaveBeenCalled();
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("rate limit時はClerk providerを呼ばない", async () => {
    const provider = fakeProvider();
    const runMutation = vi.fn().mockResolvedValueOnce({ status: "rateLimited" });

    const result = await runSyncMyPrimaryEmail(
      { auth: { getUserIdentity: vi.fn().mockResolvedValue(identity()) }, runMutation } as never,
      provider,
      CONFIG,
      "account-email-request",
    );

    expect(result).toEqual({ status: "rateLimited" });
    expect(provider.assertReady).not.toHaveBeenCalled();
    expect(provider.getVerifiedPrimaryEmail).not.toHaveBeenCalled();
  });

  it("認証identityとverified primaryだけをinternal mutationへ渡す", async () => {
    const provider = fakeProvider();
    vi.mocked(provider.getVerifiedPrimaryEmail).mockResolvedValue("verified@example.com");
    const runMutation = vi
      .fn()
      .mockResolvedValueOnce({ status: "ready", requestKey: "b".repeat(64) })
      .mockResolvedValueOnce({ status: "synced", changed: true });

    const result = await runSyncMyPrimaryEmail(
      { auth: { getUserIdentity: vi.fn().mockResolvedValue(identity()) }, runMutation } as never,
      provider,
      CONFIG,
      "account-email-request",
    );

    expect(result).toEqual({ status: "synced", changed: true });
    expect(provider.assertReady).toHaveBeenCalledWith(ISSUER);
    expect(provider.getVerifiedPrimaryEmail).toHaveBeenCalledWith("user_account_email");
    expect(runMutation).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        authTokenIdentifier: `${ISSUER}|user_account_email`,
        email: "verified@example.com",
        requestKey: "b".repeat(64),
      }),
    );
  });
});

function fakeProvider(): AccountEmailProvider {
  return {
    assertReady: vi.fn().mockResolvedValue(undefined),
    getVerifiedPrimaryEmail: vi.fn(),
  };
}

function identity(): UserIdentity {
  return {
    subject: "user_account_email",
    issuer: ISSUER,
    tokenIdentifier: `${ISSUER}|user_account_email`,
  };
}
