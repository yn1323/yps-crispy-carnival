import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type ManagerSettingsOverview = FunctionReturnType<typeof api.organization.queries.getManagerSettingsOverview>;

type CurrentReadyManagerSettingsOverview = Extract<ManagerSettingsOverview, { kind: "ready" }>;

/** rolling deploy中の旧backendが返す交代modeも、取消・表示のため読み取れるようにする。 */
export type ReadyManagerSettingsOverview = Omit<CurrentReadyManagerSettingsOverview, "mode"> & {
  mode: CurrentReadyManagerSettingsOverview["mode"] | "freeManagerExchange";
};

/** generated型が新backendへ更新済みでも、rolling中の旧DTOをruntimeで判定する。 */
export function isLegacyFreeManagerExchangeMode(mode: string) {
  return mode === "freeManagerExchange";
}

export type ManagerSettingsCandidateResult = FunctionReturnType<typeof api.organization.queries.getManagerCandidates>;

export type ReadyManagerSettingsCandidates = Extract<ManagerSettingsCandidateResult, { kind: "ready" }>;

export type ManagerSettingsCandidate = ReadyManagerSettingsCandidates["candidates"][number];
export type ManagerSettingsManager = ReadyManagerSettingsOverview["managers"][number];
export type ManagerSettingsInvitation = ReadyManagerSettingsOverview["invitations"][number];

/** rolling中の旧backendが旧交代招待を再送可能として返しても、新しい意味では再送しない。 */
export function canResendManagerInvitation(invitation: ManagerSettingsInvitation) {
  return invitation.canResend && invitation.purpose !== "freeManagerExchange";
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
