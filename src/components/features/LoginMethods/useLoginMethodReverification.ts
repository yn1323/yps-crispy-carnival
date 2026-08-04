import { useSession } from "@clerk/react";
import type {
  SessionVerificationFirstFactor,
  SessionVerificationLevel,
  SessionVerificationResource,
  SessionVerificationSecondFactor,
  SignedInSessionResource,
} from "@clerk/react/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { maskEmailAddress } from "@/src/components/features/AuthPage/loginVerification";
import { createLoginMethodOperationCooldown, type LoginMethodOperationCooldown } from "./operationCooldown";
import {
  IDLE_LOGIN_METHOD_REVERIFICATION_STATE,
  type LoginMethodOnNeedsReverification,
  type LoginMethodReverificationController,
  type LoginMethodReverificationFactor,
  type LoginMethodReverificationStage,
  type LoginMethodReverificationState,
} from "./reverificationTypes";

type ActiveRequest = {
  operationId: number;
  sessionId: string;
  session: SignedInSessionResource;
  level: SessionVerificationLevel;
  cancel: () => void;
  complete: () => void;
  settled: boolean;
};

type OperationLock = {
  operationId: number;
  reverificationHandled: boolean;
};

type InternalFactor =
  | {
      publicFactor: LoginMethodReverificationFactor;
      stage: "first";
      factor: SessionVerificationFirstFactor;
    }
  | {
      publicFactor: LoginMethodReverificationFactor;
      stage: "second";
      factor: SessionVerificationSecondFactor;
    };

const GENERAL_FAILURE_MESSAGE = "本人確認を完了できませんでした。変更は行っていません。もう一度お試しください。";
const UNAVAILABLE_MESSAGE = "このアカウントで利用できる本人確認方法がありません。変更は行っていません。";

export function useLoginMethodReverification({
  operationCooldown,
}: {
  operationCooldown?: LoginMethodOperationCooldown;
} = {}): LoginMethodReverificationController {
  const { session } = useSession();
  const localOperationCooldown = useMemo(() => createLoginMethodOperationCooldown(), []);
  const retryCooldown = operationCooldown ?? localOperationCooldown;
  const sessionRef = useRef<SignedInSessionResource | null>(session ?? null);
  sessionRef.current = session ?? null;

  const mountedRef = useRef(true);
  const nextOperationIdRef = useRef(1);
  const operationLockRef = useRef<OperationLock | null>(null);
  const activeRequestRef = useRef<ActiveRequest | null>(null);
  const factorMapRef = useRef(new Map<string, InternalFactor>());
  const actionRunningRef = useRef(false);
  const stateRef = useRef<LoginMethodReverificationState>(IDLE_LOGIN_METHOD_REVERIFICATION_STATE);
  const [state, setState] = useState<LoginMethodReverificationState>(IDLE_LOGIN_METHOD_REVERIFICATION_STATE);

  const commitState = useCallback((nextState: LoginMethodReverificationState) => {
    stateRef.current = nextState;
    if (mountedRef.current) setState(nextState);
  }, []);

  const clearRequest = useCallback((request: ActiveRequest) => {
    if (activeRequestRef.current === request) activeRequestRef.current = null;
    factorMapRef.current.clear();
    actionRunningRef.current = false;
  }, []);

  const settle = useCallback(
    (
      request: ActiveRequest,
      outcome: "complete" | "cancel",
      nextState: LoginMethodReverificationState = IDLE_LOGIN_METHOD_REVERIFICATION_STATE,
    ) => {
      if (request.settled) return false;

      // close、unmount、Session変更が競合してもcallbackの合計を一回にする。
      request.settled = true;
      factorMapRef.current.clear();
      actionRunningRef.current = false;

      if (outcome === "complete") {
        commitState({
          status: "completing",
          operationId: request.operationId,
          level: request.level,
          stage: null,
          factors: [],
          selectedFactor: null,
          message: "本人確認が完了しました。変更処理を続けています。",
        });
        request.complete();

        // runOperation利用時は、Clerkが再試行した元要求のsettleまでownerを保持する。
        if (operationLockRef.current?.operationId !== request.operationId) {
          clearRequest(request);
          commitState(IDLE_LOGIN_METHOD_REVERIFICATION_STATE);
        }
        return true;
      }

      clearRequest(request);
      commitState(nextState);
      request.cancel();
      return true;
    },
    [clearRequest, commitState],
  );

  const failClosed = useCallback(
    (request: ActiveRequest, message = GENERAL_FAILURE_MESSAGE) => {
      settle(request, "cancel", errorState(request, message));
    },
    [settle],
  );

  const isCurrent = useCallback((request: ActiveRequest) => {
    return activeRequestRef.current === request && !request.settled && sessionRef.current?.id === request.sessionId;
  }, []);

  const showFactors = useCallback(
    (request: ActiveRequest, resource: SessionVerificationResource, stage: LoginMethodReverificationStage) => {
      if (!isCurrent(request)) return;
      if (resource.level !== request.level) {
        failClosed(request);
        return;
      }

      const factors = buildSupportedFactors(resource, stage);
      if (factors.length === 0) {
        failClosed(request, UNAVAILABLE_MESSAGE);
        return;
      }

      factorMapRef.current = new Map(factors.map((factor) => [factor.publicFactor.key, factor]));
      commitState({
        status: "selecting_factor",
        operationId: request.operationId,
        level: request.level,
        stage,
        factors: factors.map((factor) => factor.publicFactor),
        selectedFactor: null,
        message: null,
      });
    },
    [commitState, failClosed, isCurrent],
  );

  const handleStartedResource = useCallback(
    (request: ActiveRequest, resource: SessionVerificationResource) => {
      if (!isCurrent(request)) return;
      if (resource.level !== request.level) {
        failClosed(request);
        return;
      }

      switch (resource.status) {
        case "complete":
          settle(request, "complete");
          return;
        case "needs_first_factor":
          showFactors(request, resource, "first");
          return;
        case "needs_second_factor":
          showFactors(request, resource, "second");
          return;
        default:
          failClosed(request);
      }
    },
    [failClosed, isCurrent, settle, showFactors],
  );

  const onNeedsReverification = useCallback<LoginMethodOnNeedsReverification>(
    ({ cancel, complete, level }) => {
      const currentLock = operationLockRef.current;
      if (activeRequestRef.current || currentLock?.reverificationHandled) {
        // 後続要求自身だけを即時cancelし、先行要求のcallbackには触れない。
        cancel();
        return;
      }

      const operationId = currentLock?.operationId ?? nextOperationIdRef.current++;
      if (currentLock) currentLock.reverificationHandled = true;
      const currentSession = sessionRef.current;

      if (!currentSession || !level) {
        cancel();
        commitState({
          status: "error",
          operationId,
          level: level ?? null,
          stage: null,
          factors: [],
          selectedFactor: null,
          message: UNAVAILABLE_MESSAGE,
        });
        return;
      }

      const request: ActiveRequest = {
        operationId,
        sessionId: currentSession.id,
        session: currentSession,
        level,
        cancel,
        complete,
        settled: false,
      };
      activeRequestRef.current = request;
      commitState({
        status: "starting",
        operationId,
        level,
        stage: null,
        factors: [],
        selectedFactor: null,
        message: null,
      });

      void currentSession
        .startVerification({ level })
        .then((resource) => handleStartedResource(request, resource))
        .catch(() => {
          if (isCurrent(request)) failClosed(request);
        });
    },
    [commitState, failClosed, handleStartedResource, isCurrent],
  );

  const runOperation = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T | undefined> => {
      if (operationLockRef.current) return undefined;

      const lock: OperationLock = {
        operationId: nextOperationIdRef.current++,
        reverificationHandled: false,
      };
      operationLockRef.current = lock;
      try {
        return await operation();
      } finally {
        const active = activeRequestRef.current;
        if (active?.operationId === lock.operationId) {
          if (!active.settled) {
            settle(active, "cancel");
          } else {
            clearRequest(active);
            if (stateRef.current.operationId === lock.operationId) {
              commitState(IDLE_LOGIN_METHOD_REVERIFICATION_STATE);
            }
          }
        }
        if (operationLockRef.current === lock) operationLockRef.current = null;
      }
    },
    [clearRequest, commitState, settle],
  );

  const setAwaitingInput = useCallback(
    (request: ActiveRequest, selectedFactor: LoginMethodReverificationFactor, message: string | null = null) => {
      if (!isCurrent(request)) return;
      commitState({
        status: "awaiting_input",
        operationId: request.operationId,
        level: request.level,
        stage: selectedFactor.stage,
        factors: stateRef.current.factors,
        selectedFactor,
        message,
      });
    },
    [commitState, isCurrent],
  );

  const handlePreparedResource = useCallback(
    (
      request: ActiveRequest,
      internalFactor: InternalFactor,
      resource: SessionVerificationResource,
      successMessage: string | null = null,
    ) => {
      if (!isCurrent(request)) return;
      if (resource.level !== request.level) {
        failClosed(request);
        return;
      }
      if (resource.status === "complete") {
        settle(request, "complete");
        return;
      }
      if (internalFactor.stage === "first" && resource.status === "needs_second_factor") {
        showFactors(request, resource, "second");
        return;
      }
      if (resource.status !== (internalFactor.stage === "first" ? "needs_first_factor" : "needs_second_factor")) {
        failClosed(request);
        return;
      }
      setAwaitingInput(request, internalFactor.publicFactor, successMessage);
    },
    [failClosed, isCurrent, setAwaitingInput, settle, showFactors],
  );

  const selectFactor = useCallback(
    async (factorKey: string) => {
      const request = activeRequestRef.current;
      const internalFactor = factorMapRef.current.get(factorKey);
      if (!request || !internalFactor || !isCurrent(request) || actionRunningRef.current) return;

      const selectedFactor = internalFactor.publicFactor;
      if (
        selectedFactor.input === "password" ||
        selectedFactor.strategy === "totp" ||
        selectedFactor.strategy === "backup_code"
      ) {
        setAwaitingInput(request, selectedFactor);
        return;
      }

      if (selectedFactor.canResend) {
        const cooldown = retryCooldown.claim(request.sessionId, reverificationCooldownScope(internalFactor));
        if (!cooldown.allowed) {
          commitState({
            status: "selecting_factor",
            operationId: request.operationId,
            level: request.level,
            stage: selectedFactor.stage,
            factors: stateRef.current.factors,
            selectedFactor: null,
            message: verificationCooldownMessage(cooldown.retryAfterSeconds),
          });
          return;
        }
      }

      actionRunningRef.current = true;
      commitState(submittingState(request, selectedFactor, stateRef.current.factors));
      try {
        if (selectedFactor.strategy === "passkey") {
          const resource = await request.session.verifyWithPasskey();
          handlePreparedResource(request, internalFactor, resource);
          return;
        }

        const resource =
          internalFactor.stage === "first"
            ? await request.session.prepareFirstFactorVerification(toFirstFactorPreparation(internalFactor.factor))
            : await request.session.prepareSecondFactorVerification(toSecondFactorPreparation(internalFactor.factor));
        handlePreparedResource(request, internalFactor, resource);
      } catch {
        if (isCurrent(request)) failClosed(request);
      } finally {
        actionRunningRef.current = false;
      }
    },
    [commitState, failClosed, handlePreparedResource, isCurrent, retryCooldown, setAwaitingInput],
  );

  const submit = useCallback(
    async (value: string) => {
      const request = activeRequestRef.current;
      const selectedFactor = stateRef.current.selectedFactor;
      const internalFactor = selectedFactor ? factorMapRef.current.get(selectedFactor.key) : undefined;
      if (!request || !selectedFactor || !internalFactor || !isCurrent(request) || actionRunningRef.current) return;

      const submittedValue = selectedFactor.input === "password" ? value : value.trim();
      if (!submittedValue) {
        setAwaitingInput(
          request,
          selectedFactor,
          selectedFactor.input === "password"
            ? "現在のパスワードを入力してください。"
            : "確認コードを入力してください。",
        );
        return;
      }

      actionRunningRef.current = true;
      commitState(submittingState(request, selectedFactor, stateRef.current.factors));
      try {
        const resource =
          internalFactor.stage === "first"
            ? await request.session.attemptFirstFactorVerification(
                toFirstFactorAttempt(selectedFactor.strategy, submittedValue),
              )
            : await request.session.attemptSecondFactorVerification(
                toSecondFactorAttempt(selectedFactor.strategy, submittedValue),
              );

        if (!isCurrent(request)) return;
        if (resource.level !== request.level) {
          failClosed(request);
          return;
        }
        if (resource.status === "complete") {
          settle(request, "complete");
          return;
        }
        if (internalFactor.stage === "first" && resource.status === "needs_second_factor") {
          showFactors(request, resource, "second");
          return;
        }
        if (resource.status === (internalFactor.stage === "first" ? "needs_first_factor" : "needs_second_factor")) {
          setAwaitingInput(request, selectedFactor, "本人確認に失敗しました。入力内容を確認してください。");
          return;
        }
        failClosed(request);
      } catch {
        if (isCurrent(request)) failClosed(request);
      } finally {
        actionRunningRef.current = false;
      }
    },
    [commitState, failClosed, isCurrent, setAwaitingInput, settle, showFactors],
  );

  const resend = useCallback(async () => {
    const request = activeRequestRef.current;
    const selectedFactor = stateRef.current.selectedFactor;
    const internalFactor = selectedFactor ? factorMapRef.current.get(selectedFactor.key) : undefined;
    if (!request || !selectedFactor?.canResend || !internalFactor || !isCurrent(request) || actionRunningRef.current) {
      return;
    }

    const cooldown = retryCooldown.claim(request.sessionId, reverificationCooldownScope(internalFactor));
    if (!cooldown.allowed) {
      setAwaitingInput(request, selectedFactor, verificationCooldownMessage(cooldown.retryAfterSeconds));
      return;
    }

    actionRunningRef.current = true;
    commitState(submittingState(request, selectedFactor, stateRef.current.factors));
    try {
      const resource =
        internalFactor.stage === "first"
          ? await request.session.prepareFirstFactorVerification(toFirstFactorPreparation(internalFactor.factor))
          : await request.session.prepareSecondFactorVerification(toSecondFactorPreparation(internalFactor.factor));
      handlePreparedResource(request, internalFactor, resource, "新しい確認コードを送信しました。");
    } catch {
      if (isCurrent(request)) failClosed(request);
    } finally {
      actionRunningRef.current = false;
    }
  }, [commitState, failClosed, handlePreparedResource, isCurrent, retryCooldown, setAwaitingInput]);

  const useAnotherFactor = useCallback(() => {
    const request = activeRequestRef.current;
    if (!request || !isCurrent(request) || actionRunningRef.current || factorMapRef.current.size < 2) return;
    commitState({
      status: "selecting_factor",
      operationId: request.operationId,
      level: request.level,
      stage: stateRef.current.stage,
      factors: stateRef.current.factors,
      selectedFactor: null,
      message: null,
    });
  }, [commitState, isCurrent]);

  const cancel = useCallback(() => {
    const request = activeRequestRef.current;
    if (request && !request.settled) {
      settle(request, "cancel");
      return;
    }
    if (!request) commitState(IDLE_LOGIN_METHOD_REVERIFICATION_STATE);
  }, [commitState, settle]);

  useEffect(() => {
    const request = activeRequestRef.current;
    const currentSessionId = session?.id ?? null;
    if (request && !request.settled && request.sessionId !== currentSessionId) {
      settle(request, "cancel", errorState(request, "ログイン状態が変わったため、変更を中止しました。"));
    }
  }, [session?.id, settle]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const request = activeRequestRef.current;
      if (request && !request.settled) settle(request, "cancel");
    };
  }, [settle]);

  return {
    state,
    onNeedsReverification,
    runOperation,
    selectFactor,
    submit,
    resend,
    useAnotherFactor,
    cancel,
  };
}

function reverificationCooldownScope(internalFactor: InternalFactor) {
  const resourceId =
    "emailAddressId" in internalFactor.factor && typeof internalFactor.factor.emailAddressId === "string"
      ? internalFactor.factor.emailAddressId
      : "phoneNumberId" in internalFactor.factor && typeof internalFactor.factor.phoneNumberId === "string"
        ? internalFactor.factor.phoneNumberId
        : internalFactor.publicFactor.key;
  return `session-verification:${internalFactor.stage}:${internalFactor.publicFactor.strategy}:${resourceId}`;
}

function verificationCooldownMessage(retryAfterSeconds: number) {
  return `確認コードを送信した直後です。あと${retryAfterSeconds}秒ほど待ってから再送してください。`;
}

function buildSupportedFactors(
  resource: SessionVerificationResource,
  stage: LoginMethodReverificationStage,
): InternalFactor[] {
  if (stage === "first") {
    return (resource.supportedFirstFactors ?? []).flatMap((factor, index): InternalFactor[] => {
      // custom UIに実装していないfactorは、別のstrategyとして推測せず除外する。
      if (factor.strategy === "enterprise_sso" || factor.strategy === "passkey") return [];
      if (factor.strategy !== "password" && factor.strategy !== "email_code" && factor.strategy !== "phone_code") {
        return [];
      }
      return [
        {
          stage: "first",
          factor,
          publicFactor: {
            key: `first-${index}`,
            stage: "first",
            strategy: factor.strategy,
            input: factor.strategy === "password" ? "password" : "code",
            safeIdentifier: maskReverificationIdentifier(
              factor.strategy,
              "safeIdentifier" in factor && typeof factor.safeIdentifier === "string" ? factor.safeIdentifier : null,
            ),
            canResend: factor.strategy === "email_code" || factor.strategy === "phone_code",
          },
        },
      ];
    });
  }

  return (resource.supportedSecondFactors ?? []).flatMap((factor, index): InternalFactor[] => {
    if (factor.strategy !== "phone_code" && factor.strategy !== "totp" && factor.strategy !== "backup_code") return [];
    return [
      {
        stage: "second",
        factor,
        publicFactor: {
          key: `second-${index}`,
          stage: "second",
          strategy: factor.strategy,
          input: "code",
          safeIdentifier: maskReverificationIdentifier(
            factor.strategy,
            "safeIdentifier" in factor && typeof factor.safeIdentifier === "string" ? factor.safeIdentifier : null,
          ),
          canResend: factor.strategy === "phone_code",
        },
      },
    ];
  });
}

function maskReverificationIdentifier(
  strategy: LoginMethodReverificationFactor["strategy"],
  safeIdentifier: string | null | undefined,
): string | null {
  if (!safeIdentifier) return null;
  if (strategy === "email_code") return maskEmailAddress(safeIdentifier);
  if (strategy !== "phone_code") return null;

  const digits = safeIdentifier.replaceAll(/\D/g, "");
  const suffix = digits.slice(-4);
  return suffix ? `登録電話番号（末尾${suffix}）` : "登録電話番号";
}

function toFirstFactorPreparation(factor: SessionVerificationFirstFactor) {
  if (factor.strategy === "email_code") {
    return { strategy: "email_code" as const, emailAddressId: factor.emailAddressId };
  }
  if (factor.strategy === "phone_code") {
    return { strategy: "phone_code" as const, phoneNumberId: factor.phoneNumberId };
  }
  if (factor.strategy === "passkey") return { strategy: "passkey" as const };
  throw new Error("Unsupported first factor preparation");
}

function toFirstFactorAttempt(strategy: LoginMethodReverificationFactor["strategy"], value: string) {
  if (strategy === "password") return { strategy: "password" as const, password: value };
  if (strategy === "email_code") return { strategy: "email_code" as const, code: value };
  if (strategy === "phone_code") return { strategy: "phone_code" as const, code: value };
  throw new Error("Unsupported first factor attempt");
}

function toSecondFactorPreparation(factor: SessionVerificationSecondFactor) {
  if (factor.strategy === "phone_code") {
    return { strategy: "phone_code" as const, phoneNumberId: factor.phoneNumberId };
  }
  throw new Error("Unsupported second factor preparation");
}

function toSecondFactorAttempt(strategy: LoginMethodReverificationFactor["strategy"], value: string) {
  if (strategy === "phone_code") return { strategy: "phone_code" as const, code: value };
  if (strategy === "totp") return { strategy: "totp" as const, code: value };
  if (strategy === "backup_code") return { strategy: "backup_code" as const, code: value };
  throw new Error("Unsupported second factor attempt");
}

function submittingState(
  request: ActiveRequest,
  selectedFactor: LoginMethodReverificationFactor,
  factors: readonly LoginMethodReverificationFactor[],
): LoginMethodReverificationState {
  return {
    status: "submitting",
    operationId: request.operationId,
    level: request.level,
    stage: selectedFactor.stage,
    factors,
    selectedFactor,
    message: null,
  };
}

function errorState(request: ActiveRequest, message: string): LoginMethodReverificationState {
  return {
    status: "error",
    operationId: request.operationId,
    level: request.level,
    stage: null,
    factors: [],
    selectedFactor: null,
    message,
  };
}
