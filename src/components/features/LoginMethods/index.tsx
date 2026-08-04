import { useUser } from "@clerk/react";
import type { UserResource } from "@clerk/shared/types";
import { LOGIN_METHOD_CAPABILITIES } from "./capabilities";
import { LoginMethodMigrationView } from "./LoginMethodMigrationView";
import { LoginMethodsView } from "./LoginMethodsView";
import type { LoginMethodMigrationFlow } from "./migrationTypes";
import type { LoginMethodReverificationController } from "./reverificationTypes";
import type { PendingLoginMethodRemovalKind } from "./types";
import { useEmailPasswordMigrationController } from "./useEmailPasswordMigrationController";
import { useGoogleConnectionController } from "./useGoogleConnectionController";
import { useGoogleReplacementController } from "./useGoogleReplacementController";
import { useLoginMethodReverification } from "./useLoginMethodReverification";
import { useLoginMethodsController } from "./useLoginMethodsController";

type LoginMethodsProps = {
  flow?: LoginMethodMigrationFlow;
  oauth?: "google";
  onStartFlow?: (flow: LoginMethodMigrationFlow) => void;
  onBackToOverview?: () => void;
  onGoogleOAuthReturnHandled?: () => void;
  onRequestPreviousMethodRemoval?: (kind: PendingLoginMethodRemovalKind) => void;
  pendingRemovalKind?: PendingLoginMethodRemovalKind | null;
  onPendingRemovalClaimed?: () => void;
};

const NOOP = () => undefined;

export function LoginMethods({
  flow,
  oauth,
  onStartFlow = NOOP,
  onBackToOverview = NOOP,
  onGoogleOAuthReturnHandled,
  onRequestPreviousMethodRemoval = NOOP,
  pendingRemovalKind = null,
  onPendingRemovalClaimed = NOOP,
}: LoginMethodsProps) {
  const { isLoaded, user } = useUser();
  const reverification = useLoginMethodReverification();
  const controller = useLoginMethodsController({
    isLoaded,
    user,
    // 実環境で確認済みの操作だけをdeployment単位のbuild-time設定から注入する。
    capabilities: LOGIN_METHOD_CAPABILITIES,
    onNeedsReverification: reverification.onNeedsReverification,
    runOperation: reverification.runOperation,
  });

  if (flow === "add-email-password") {
    return (
      <EmailPasswordMigration
        isLoaded={isLoaded}
        user={user}
        reverification={reverification}
        onBackToOverview={onBackToOverview}
        onRequestPreviousMethodRemoval={() => onRequestPreviousMethodRemoval("google")}
      />
    );
  }
  if (flow === "connect-google") {
    return (
      <GoogleConnectionMigration
        isLoaded={isLoaded}
        user={user}
        oauthReturn={oauth === "google"}
        reverification={reverification}
        onBackToOverview={onBackToOverview}
        onGoogleOAuthReturnHandled={onGoogleOAuthReturnHandled}
        onRequestPreviousMethodRemoval={() => onRequestPreviousMethodRemoval("password")}
      />
    );
  }
  if (flow === "replace-google") {
    return (
      <GoogleReplacementMigration
        isLoaded={isLoaded}
        user={user}
        oauthReturn={oauth === "google"}
        reverification={reverification}
        onBackToOverview={onBackToOverview}
        onGoogleOAuthReturnHandled={onGoogleOAuthReturnHandled}
        onRequestPreviousMethodRemoval={NOOP}
      />
    );
  }

  return (
    <LoginMethodsView
      controller={controller}
      onStartFlow={onStartFlow}
      reverification={reverification}
      pendingRemovalKind={pendingRemovalKind}
      onPendingRemovalClaimed={onPendingRemovalClaimed}
    />
  );
}

type MigrationProps = {
  isLoaded: boolean;
  user: UserResource | null | undefined;
  reverification: LoginMethodReverificationController;
  onBackToOverview: () => void;
  onRequestPreviousMethodRemoval: () => void;
};

function EmailPasswordMigration(props: MigrationProps) {
  const controller = useEmailPasswordMigrationController({
    isLoaded: props.isLoaded,
    user: props.user,
    enabled: LOGIN_METHOD_CAPABILITIES.setPassword,
    onNeedsReverification: props.reverification.onNeedsReverification,
    runOperation: props.reverification.runOperation,
  });
  return (
    <LoginMethodMigrationView
      flow="add-email-password"
      controller={controller}
      reverification={props.reverification}
      onBackToOverview={props.onBackToOverview}
      onRequestPreviousMethodRemoval={props.onRequestPreviousMethodRemoval}
      canRequestPreviousMethodRemoval={LOGIN_METHOD_CAPABILITIES.disconnectGoogle}
    />
  );
}

function GoogleConnectionMigration(
  props: MigrationProps & { oauthReturn: boolean; onGoogleOAuthReturnHandled?: () => void },
) {
  const controller = useGoogleConnectionController({
    isLoaded: props.isLoaded,
    user: props.user,
    enabled: LOGIN_METHOD_CAPABILITIES.connectGoogle,
    flow: "connect-google",
    oauthReturn: props.oauthReturn,
    onOAuthReturnHandled: props.onGoogleOAuthReturnHandled,
    onNeedsReverification: props.reverification.onNeedsReverification,
    runOperation: props.reverification.runOperation,
  });
  return (
    <LoginMethodMigrationView
      flow="connect-google"
      controller={controller}
      reverification={props.reverification}
      onBackToOverview={props.onBackToOverview}
      onRequestPreviousMethodRemoval={props.onRequestPreviousMethodRemoval}
      canRequestPreviousMethodRemoval={LOGIN_METHOD_CAPABILITIES.removePassword}
    />
  );
}

function GoogleReplacementMigration(
  props: MigrationProps & { oauthReturn: boolean; onGoogleOAuthReturnHandled?: () => void },
) {
  const controller = useGoogleReplacementController({
    isLoaded: props.isLoaded,
    user: props.user,
    capabilities: LOGIN_METHOD_CAPABILITIES,
    oauthReturn: props.oauthReturn,
    onOAuthReturnHandled: props.onGoogleOAuthReturnHandled,
    onNeedsReverification: props.reverification.onNeedsReverification,
    runOperation: props.reverification.runOperation,
  });
  return (
    <LoginMethodMigrationView
      flow="replace-google"
      controller={controller}
      reverification={props.reverification}
      onBackToOverview={props.onBackToOverview}
      onRequestPreviousMethodRemoval={props.onRequestPreviousMethodRemoval}
      canRequestPreviousMethodRemoval={false}
    />
  );
}

export { LoginMethodMigrationView } from "./LoginMethodMigrationView";
export { LoginMethodsView } from "./LoginMethodsView";
export type { LoginMethodMigrationFlow } from "./migrationTypes";
export type { LoginMethodsController, LoginMethodsViewModel, PendingLoginMethodRemovalKind } from "./types";
