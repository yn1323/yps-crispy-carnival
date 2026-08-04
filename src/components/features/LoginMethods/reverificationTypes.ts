import type { SessionVerificationLevel } from "@clerk/react/types";

export type LoginMethodReverificationStrategy =
  | "password"
  | "email_code"
  | "phone_code"
  | "passkey"
  | "totp"
  | "backup_code";

export type LoginMethodReverificationStage = "first" | "second";

export type LoginMethodReverificationFactor = {
  key: string;
  strategy: LoginMethodReverificationStrategy;
  stage: LoginMethodReverificationStage;
  input: "password" | "code" | "passkey";
  safeIdentifier: string | null;
  canResend: boolean;
};

export type LoginMethodReverificationState = {
  status: "idle" | "starting" | "selecting_factor" | "awaiting_input" | "submitting" | "completing" | "error";
  operationId: number | null;
  level: SessionVerificationLevel | null;
  stage: LoginMethodReverificationStage | null;
  factors: readonly LoginMethodReverificationFactor[];
  selectedFactor: LoginMethodReverificationFactor | null;
  message: string | null;
};

export type LoginMethodOnNeedsReverification = (request: {
  cancel: () => void;
  complete: () => void;
  level: SessionVerificationLevel | undefined;
}) => void;

export type LoginMethodReverificationController = {
  state: LoginMethodReverificationState;
  onNeedsReverification: LoginMethodOnNeedsReverification;
  runOperation: <T>(operation: () => Promise<T>) => Promise<T | undefined>;
  selectFactor: (factorKey: string) => Promise<void>;
  submit: (value: string) => Promise<void>;
  resend: () => Promise<void>;
  useAnotherFactor: () => void;
  cancel: () => void;
};

export const IDLE_LOGIN_METHOD_REVERIFICATION_STATE: LoginMethodReverificationState = {
  status: "idle",
  operationId: null,
  level: null,
  stage: null,
  factors: [],
  selectedFactor: null,
  message: null,
};
