import { describe, expect, it } from "vitest";
import {
  getOrganizationInvitationExpiresAt,
  isOrganizationInvitationExpired,
  ORGANIZATION_MANAGER_INVITATION_TTL_MS,
} from "./constants";

describe("organization invitation expiry", () => {
  it("expires exactly seven days after issuance", () => {
    const issuedAt = Date.parse("2026-07-16T00:00:00.000Z");
    expect(getOrganizationInvitationExpiresAt(issuedAt)).toBe(issuedAt + ORGANIZATION_MANAGER_INVITATION_TTL_MS);
  });

  it("treats the exact deadline as expired", () => {
    expect(isOrganizationInvitationExpired(1_000, 999)).toBe(false);
    expect(isOrganizationInvitationExpired(1_000, 1_000)).toBe(true);
  });
});
