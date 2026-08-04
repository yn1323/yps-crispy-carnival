import type { SessionVerificationLevel } from "@clerk/shared/types";

export const LOGIN_METHOD_MIGRATION_FLOWS = ["add-email-password", "connect-google"] as const;

export type LoginMethodMigrationFlow = (typeof LOGIN_METHOD_MIGRATION_FLOWS)[number];
export type GoogleOAuthMigrationFlow = Extract<LoginMethodMigrationFlow, "connect-google">;

/** `useReverification` のcustom UI所有者から各操作controllerへ注入する境界。 */
export type LoginMethodReverificationHandler = (request: {
  cancel: () => void;
  complete: () => void;
  level: SessionVerificationLevel | undefined;
}) => void;

export type LoginMethodOperationRunner = <Result>(operation: () => Promise<Result>) => Promise<Result | undefined>;

export type LoginMethodMigrationFeedback = {
  status: "idle" | "loading" | "success" | "error";
  message: string | null;
};

export type EmailPasswordMigrationPhase =
  | "choosingEmail"
  | "verifyingEmail"
  | "settingPassword"
  | "methodReady"
  | "unavailable";

export type GoogleConnectionPhase = "readyToConnect" | "redirecting" | "settling" | "methodReady" | "unavailable";
