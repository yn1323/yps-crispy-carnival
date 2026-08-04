import { useUser } from "@clerk/react";
import type { UserResource } from "@clerk/shared/types";
import { useCallback, useEffect, useRef } from "react";
import { showSuccessToast } from "@/src/components/shared/feedback";
import { LoginMethodMigrationView } from "./LoginMethodMigrationView";
import { LoginMethodsView } from "./LoginMethodsView";
import type { LoginMethodMigrationFlow } from "./migrationTypes";
import { useEmailPasswordMigrationController } from "./useEmailPasswordMigrationController";
import { useGoogleConnectionController } from "./useGoogleConnectionController";
import { useLoginMethodReverification } from "./useLoginMethodReverification";
import { useLoginMethodsController } from "./useLoginMethodsController";

type LoginMethodsProps = {
  flow?: LoginMethodMigrationFlow;
  oauth?: "google";
  onStartFlow?: (flow: LoginMethodMigrationFlow) => void;
  onBackToOverview?: () => void;
  onGoogleOAuthReturnHandled?: () => void;
};

const NOOP = () => undefined;

export function LoginMethods(props: LoginMethodsProps) {
  const { isLoaded, user } = useUser();
  const currentActorIdRef = useRef<string | null>(user?.id ?? null);
  currentActorIdRef.current = user?.id ?? null;
  const getCurrentActorId = useCallback(() => currentActorIdRef.current, []);
  const actorKey = user?.id ?? (isLoaded ? "signed-out" : "loading");

  return (
    <CurrentUserLoginMethods
      key={actorKey}
      {...props}
      isLoaded={isLoaded}
      user={user}
      getCurrentActorId={getCurrentActorId}
    />
  );
}

function CurrentUserLoginMethods({
  isLoaded,
  user,
  getCurrentActorId,
  flow,
  oauth,
  onStartFlow = NOOP,
  onBackToOverview = NOOP,
  onGoogleOAuthReturnHandled,
}: LoginMethodsProps & {
  isLoaded: boolean;
  user: UserResource | null | undefined;
  getCurrentActorId: () => string | null;
}) {
  const reverification = useLoginMethodReverification();
  const controller = useLoginMethodsController({
    isLoaded,
    user,
    getCurrentActorId,
    onNeedsReverification: reverification.onNeedsReverification,
    runOperation: reverification.runOperation,
  });
  const emailPasswordController = useEmailPasswordMigrationController({
    isLoaded,
    user,
    getCurrentActorId,
    onNeedsReverification: reverification.onNeedsReverification,
    runOperation: reverification.runOperation,
  });
  const googleController = useGoogleConnectionController({
    isLoaded,
    user,
    getCurrentActorId,
    active: flow === "connect-google",
    oauthReturn: flow === "connect-google" && oauth === "google",
    onOAuthReturnHandled: onGoogleOAuthReturnHandled,
    onNeedsReverification: reverification.onNeedsReverification,
    runOperation: reverification.runOperation,
  });
  const handledCompletionRef = useRef<string | null>(null);

  useEffect(() => {
    const migrationController =
      flow === "add-email-password" ? emailPasswordController : flow === "connect-google" ? googleController : null;
    if (migrationController?.state.phase !== "methodReady") {
      handledCompletionRef.current = null;
      return;
    }

    if (migrationController.state.feedback.status !== "success") {
      onBackToOverview();
      return;
    }

    const completionKey = `${flow}:${migrationController.state.feedback.message ?? "completed"}`;
    if (handledCompletionRef.current === completionKey) return;
    handledCompletionRef.current = completionKey;
    const completionActorId = user?.id ?? null;

    void controller.reload().finally(() => {
      if (!completionActorId || getCurrentActorId() !== completionActorId) return;
      if (flow === "add-email-password") {
        showSuccessToast({
          title: "メールアドレスとパスワードを設定しました",
          description: "Google認証はそのまま利用できます。",
        });
      } else {
        showSuccessToast({
          title: "Googleログインを追加しました",
          description: "メールアドレスとパスワードはそのまま利用できます。",
        });
      }
      onBackToOverview();
    });
  }, [controller, emailPasswordController, flow, getCurrentActorId, googleController, onBackToOverview, user?.id]);

  return (
    <>
      <LoginMethodsView controller={controller} onStartFlow={onStartFlow} reverification={reverification} />
      {flow === "add-email-password" ? (
        <LoginMethodMigrationView
          flow="add-email-password"
          controller={emailPasswordController}
          reverification={reverification}
          onBackToOverview={onBackToOverview}
        />
      ) : null}
      {flow === "connect-google" ? (
        <LoginMethodMigrationView
          flow="connect-google"
          controller={googleController}
          reverification={reverification}
          onBackToOverview={onBackToOverview}
        />
      ) : null}
    </>
  );
}

export { LoginMethodMigrationView } from "./LoginMethodMigrationView";
export { LoginMethodsView } from "./LoginMethodsView";
export type { LoginMethodMigrationFlow } from "./migrationTypes";
export type { LoginMethodsController, LoginMethodsViewModel } from "./types";
