import { buildPublishableKey } from "@clerk/shared/keys";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountDeletionConfiguration } from "./config";
import { classifyProviderError, createClerkAccountDeletionProvider } from "./provider";

const clerk = vi.hoisted(() => ({
  listDomains: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    domains: { list: clerk.listDomains },
    users: { getUser: clerk.getUser, deleteUser: clerk.deleteUser },
  })),
}));

const EXPECTED_ISSUER = "https://quick-fox-12.clerk.accounts.dev";

describe("accountDeletion provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Secret Keyが指すClerk domainと受付時issuerが一致すればreadyになる", async () => {
    clerk.listDomains.mockResolvedValue({
      data: [{ frontendApiUrl: EXPECTED_ISSUER }],
      totalCount: 1,
    });
    const provider = createClerkAccountDeletionProvider(configuration());

    await expect(provider.assertReady(EXPECTED_ISSUER)).resolves.toBeUndefined();

    expect(clerk.listDomains).toHaveBeenCalledTimes(1);
  });

  it("別InstanceのSecret Keyではprovider userの取得・削除前にfail closedにする", async () => {
    clerk.listDomains.mockResolvedValue({
      data: [{ frontendApiUrl: "https://other-instance.clerk.accounts.dev" }],
      totalCount: 1,
    });
    const provider = createClerkAccountDeletionProvider(configuration());

    await expect(provider.assertReady(EXPECTED_ISSUER)).rejects.toMatchObject({
      retryable: false,
      code: "provider_instance_mismatch",
    });

    expect(clerk.getUser).not.toHaveBeenCalled();
    expect(clerk.deleteUser).not.toHaveBeenCalled();
  });

  it("publishable keyのFrontend APIがissuerと異なればClerk APIを呼ばない", async () => {
    const provider = createClerkAccountDeletionProvider(
      configuration({
        publishableKey: buildPublishableKey("other-instance.clerk.accounts.dev"),
      }),
    );

    await expect(provider.assertReady(EXPECTED_ISSUER)).rejects.toMatchObject({
      retryable: false,
      code: "provider_configuration_mismatch",
    });

    expect(clerk.listDomains).not.toHaveBeenCalled();
    expect(clerk.getUser).not.toHaveBeenCalled();
    expect(clerk.deleteUser).not.toHaveBeenCalled();
  });

  it("HTTP 408を一時的なtimeoutとして再試行する", () => {
    expect(classifyProviderError({ status: 408 })).toMatchObject({
      retryable: true,
      code: "provider_timeout",
    });
  });
});

function configuration(overrides: Partial<AccountDeletionConfiguration> = {}): AccountDeletionConfiguration {
  return {
    appOrigin: "https://shiftori.example",
    secretKey: "sk_test_example",
    publishableKey: buildPublishableKey(new URL(EXPECTED_ISSUER).hostname),
    expectedIssuer: EXPECTED_ISSUER,
    ...overrides,
  };
}
