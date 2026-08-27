import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type ManagerSettingsOverview = FunctionReturnType<
  typeof api.appOrganization.manageQueries.getManagerSettingsOverview
>;

export type ReadyManagerSettingsOverview = Extract<ManagerSettingsOverview, { kind: "ready" }>;

export type ManagerSettingsCandidateResult = FunctionReturnType<
  typeof api.appOrganization.manageQueries.getManagerCandidates
>;

export type ReadyManagerSettingsCandidates = Extract<ManagerSettingsCandidateResult, { kind: "ready" }>;

export type ManagerSettingsCandidate = ReadyManagerSettingsCandidates["candidates"][number];
export type ManagerSettingsManager = ReadyManagerSettingsOverview["managers"][number];
export type ManagerSettingsInvitation = ReadyManagerSettingsOverview["invitations"][number];

export function canResendManagerInvitation(invitation: ManagerSettingsInvitation) {
  return invitation.canResend;
}

export type ManagerSettingsConfirmation =
  | {
      kind: "resend";
      invitation: ManagerSettingsInvitation;
      requestId: string;
    }
  | {
      kind: "revoke";
      invitation: ManagerSettingsInvitation;
      requestId: string;
    }
  | {
      kind: "removeRole";
      manager: ManagerSettingsManager;
      requestId: string;
    }
  | null;
