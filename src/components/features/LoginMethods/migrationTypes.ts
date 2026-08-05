import type { SessionVerificationLevel } from "@clerk/shared/types";
import type { LoginMethodOperationOptions } from "./reverificationTypes";

export type LoginMethodMigrationFlow = "add-email-password" | "connect-google";

/** `useReverification` のcustom UI所有者から各操作controllerへ注入する境界。 */
export type LoginMethodReverificationHandler = (request: {
  cancel: () => void;
  complete: () => void;
  level: SessionVerificationLevel | undefined;
}) => void;

export type LoginMethodOperationRunner = <Result>(
  operation: () => Promise<Result>,
  options?: LoginMethodOperationOptions,
) => Promise<Result | undefined>;

export type LoginMethodMigrationFeedback = {
  status: "idle" | "loading" | "success" | "error";
  message: string | null;
};

export type EmailPasswordMigrationPhase =
  | "loading"
  | "choosingEmail"
  | "verifyingEmail"
  | "settingPassword"
  | "methodReady"
  | "unavailable";

export type GoogleConnectionPhase = "readyToConnect" | "redirecting" | "settling" | "methodReady" | "unavailable";
