import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type ManagerSettingsOverview = FunctionReturnType<typeof api.organization.queries.getManagerSettingsOverview>;

export type ReadyManagerSettingsOverview = Extract<ManagerSettingsOverview, { kind: "ready" }>;

export type ManagerSettingsCandidateResult = FunctionReturnType<typeof api.organization.queries.getManagerCandidates>;

export type ReadyManagerSettingsCandidates = Extract<ManagerSettingsCandidateResult, { kind: "ready" }>;

export type ManagerSettingsCandidate = ReadyManagerSettingsCandidates["candidates"][number];
export type ManagerSettingsManager = ReadyManagerSettingsOverview["managers"][number];
export type ManagerSettingsInvitation = ReadyManagerSettingsOverview["invitations"][number];

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

export type ManagerInvitationIssueConfirmation =
  | {
      kind: "existingStaff";
      candidate: ManagerSettingsCandidate;
      mode: ReadyManagerSettingsOverview["mode"];
      requestId: string;
    }
  | {
      kind: "external";
      invitedName: string;
      email: string;
      requestId: string;
    }
  | null;
