import { buildPublishableKey } from "@clerk/shared/keys";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClerkVerifiedEmailProvider } from "./clerkVerifiedEmailProvider";

const clerk = vi.hoisted(() => ({
  listDomains: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    domains: { list: clerk.listDomains },
    users: { getUser: clerk.getUser },
  })),
}));

const ISSUER = "https://quick-fox-12.clerk.accounts.dev";

describe("Clerk verified email provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clerk.listDomains.mockResolvedValue({ data: [{ frontendApiUrl: ISSUER }] });
  });

  it("同じClerk Userのverified EmailAddressだけを正規化して返す", async () => {
    clerk.getUser.mockResolvedValue({
      id: "user_actor",
      emailAddresses: [
        { emailAddress: " Verified@Example.com ", verification: { status: "verified" } },
        { emailAddress: "pending@example.com", verification: { status: "unverified" } },
      ],
    });
    const provider = createClerkVerifiedEmailProvider(configuration());

    await provider.assertReady(ISSUER);
    await expect(provider.getVerifiedEmails("user_actor")).resolves.toEqual(new Set(["verified@example.com"]));
  });

  it("取得resourceが別Userならfail closedにする", async () => {
    clerk.getUser.mockResolvedValue({ id: "user_other", emailAddresses: [] });
    const provider = createClerkVerifiedEmailProvider(configuration());

    await expect(provider.getVerifiedEmails("user_actor")).rejects.toMatchObject({
      retryable: false,
      code: "provider_user_mismatch",
    });
  });

  it("publishable keyと異なるClerk instanceのBackend APIなら照会前に拒否する", async () => {
    clerk.listDomains.mockResolvedValue({ data: [{ frontendApiUrl: "https://other.clerk.accounts.dev" }] });
    const provider = createClerkVerifiedEmailProvider(configuration());

    await expect(provider.assertReady(ISSUER)).rejects.toMatchObject({
      retryable: false,
      code: "provider_instance_mismatch",
    });
    expect(clerk.getUser).not.toHaveBeenCalled();
  });
});

function configuration() {
  return {
    secretKey: "sk_test_example",
    publishableKey: buildPublishableKey(new URL(ISSUER).hostname),
    expectedIssuer: ISSUER,
  };
}
