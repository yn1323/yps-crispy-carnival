import { DAY_MS } from "../constants";

export const ORGANIZATION_MANAGER_INVITATION_TTL_MS = 7 * DAY_MS;

export function getOrganizationInvitationExpiresAt(issuedAt: number): number {
  return issuedAt + ORGANIZATION_MANAGER_INVITATION_TTL_MS;
}

export function isOrganizationInvitationExpired(expiresAt: number, now = Date.now()): boolean {
  return expiresAt <= now;
}
