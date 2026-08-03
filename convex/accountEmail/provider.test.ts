import { buildPublishableKey } from "@clerk/shared/keys";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClerkAccountEmailProvider } from "./provider";

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

describe("account email provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clerk.listDomains.mockResolvedValue({ data: [{ frontendApiUrl: ISSUER }] });
  });

  it("同じClerk Userのverified primaryだけを返す", async () => {
    clerk.getUser.mockResolvedValue({
      id: "user_actor",
      primaryEmailAddressId: "idn_primary",
      emailAddresses: [
        { id: "idn_secondary", emailAddress: "secondary@example.com", verification: { status: "verified" } },
        { id: "idn_primary", emailAddress: "primary@example.com", verification: { status: "verified" } },
      ],
    });
    const provider = createClerkAccountEmailProvider(configuration());

    await provider.assertReady(ISSUER);
    await expect(provider.getVerifiedPrimaryEmail("user_actor")).resolves.toBe("primary@example.com");
  });

  it("primaryが未検証ならfail closedにする", async () => {
    clerk.getUser.mockResolvedValue({
      id: "user_actor",
      primaryEmailAddressId: "idn_primary",
      emailAddresses: [
        { id: "idn_primary", emailAddress: "primary@example.com", verification: { status: "unverified" } },
      ],
    });
    const provider = createClerkAccountEmailProvider(configuration());

    await expect(provider.getVerifiedPrimaryEmail("user_actor")).rejects.toMatchObject({
      retryable: false,
      code: "provider_primary_unverified",
    });
  });

  it("取得resourceが別Userならfail closedにする", async () => {
    clerk.getUser.mockResolvedValue({
      id: "user_other",
      primaryEmailAddressId: "idn_primary",
      emailAddresses: [
        { id: "idn_primary", emailAddress: "primary@example.com", verification: { status: "verified" } },
      ],
    });
    const provider = createClerkAccountEmailProvider(configuration());

    await expect(provider.getVerifiedPrimaryEmail("user_actor")).rejects.toMatchObject({
      retryable: false,
      code: "provider_user_mismatch",
    });
  });
});

function configuration() {
  return {
    secretKey: "sk_test_example",
    publishableKey: buildPublishableKey(new URL(ISSUER).hostname),
    expectedIssuer: ISSUER,
  };
}
