import { describe, expect, it } from "vitest";
import { deriveInvitationToken, digestInvitationToken, invitationRateLimitKey } from "./token";

const signingSecret = "test-only-secret-with-at-least-32-characters";

describe("organization invitation token", () => {
  it("stores a deterministic SHA-256 digest instead of the raw token", async () => {
    await expect(digestInvitationToken("test")).resolves.toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    );
  });

  it("derives an opaque token that can be rebuilt for outbox delivery without storing the raw value", async () => {
    const first = await deriveInvitationToken({ invitationId: "invite-1", version: 1, signingSecret });
    const same = await deriveInvitationToken({ invitationId: "invite-1", version: 1, signingSecret });
    const nextVersion = await deriveInvitationToken({ invitationId: "invite-1", version: 2, signingSecret });

    expect(first).toBe(same);
    expect(first).not.toBe(nextVersion);
    expect(first).not.toContain("@");
    expect(first).not.toContain("invite-1");
    expect(first).toHaveLength(43);
  });

  it("rejects an undersized signing secret", async () => {
    await expect(
      deriveInvitationToken({ invitationId: "invite-1", version: 1, signingSecret: "short" }),
    ).rejects.toThrow("at least 32 characters");
  });

  it("uses only a non-reversible digest prefix for rate limiting", () => {
    expect(invitationRateLimitKey("1234567890abcdefmore")).toBe("1234567890abcdef");
  });
});
