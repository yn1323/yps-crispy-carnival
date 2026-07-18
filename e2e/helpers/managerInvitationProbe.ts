import { convexRunJson } from "./convex";

export type ManagerInvitationTokenProbeResult = {
  token: string | null;
  invitationId: string | null;
  version: number | null;
  status: "pending" | "accepted" | "issued" | "linked" | "revoked" | "expired" | null;
  expiresAt: number | null;
};

export type ManagerInvitationTokenProbeArgs = {
  organizationId: string;
  invitationId: string;
};

const POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 500;

export function getManagerInvitationTokenProbe(
  args: ManagerInvitationTokenProbeArgs,
): ManagerInvitationTokenProbeResult {
  return convexRunJson<ManagerInvitationTokenProbeResult>("testing:getManagerInvitationTokenProbe", args);
}

export async function waitForManagerInvitationTokenProbe(
  args: ManagerInvitationTokenProbeArgs,
): Promise<ManagerInvitationTokenProbeResult & { token: string }> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const result = getManagerInvitationTokenProbe(args);
    if (result.token) return { ...result, token: result.token };
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Manager invitation token was not available: ${args.invitationId}`);
}
