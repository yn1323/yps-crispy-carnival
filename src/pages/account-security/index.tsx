import { Heading, Stack } from "@chakra-ui/react";
import { useCallback, useState } from "react";
import {
  type LoginMethodMigrationFlow,
  LoginMethods,
  type PendingLoginMethodRemovalKind,
} from "@/src/components/features/LoginMethods";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";

export type AccountSecurityPageFlow = LoginMethodMigrationFlow;

type AccountSecurityPageProps = {
  flow?: AccountSecurityPageFlow;
  oauth?: "google";
  onStartFlow?: (flow: AccountSecurityPageFlow) => void;
  onBackToOverview?: () => void;
  onGoogleOAuthReturnHandled?: () => void;
};

export function AccountSecurityPage({
  flow,
  oauth,
  onStartFlow,
  onBackToOverview,
  onGoogleOAuthReturnHandled,
}: AccountSecurityPageProps) {
  const [pendingRemovalKind, setPendingRemovalKind] = useState<PendingLoginMethodRemovalKind | null>(null);
  const handlePreviousMethodRemoval = useCallback(
    (kind: PendingLoginMethodRemovalKind) => {
      setPendingRemovalKind(kind);
      onBackToOverview?.();
    },
    [onBackToOverview],
  );
  const handlePendingRemovalClaimed = useCallback(() => {
    setPendingRemovalKind(null);
  }, []);
  const handleStartFlow = useCallback(
    (nextFlow: AccountSecurityPageFlow) => {
      setPendingRemovalKind(null);
      onStartFlow?.(nextFlow);
    },
    [onStartFlow],
  );

  return (
    <AuthenticatedPageContent>
      <Stack gap={6}>
        <Stack gap={2}>
          <Heading as="h1" textStyle={{ base: "sectionTitle", md: "pageTitle" }} color="gray.900">
            ログイン設定
          </Heading>
        </Stack>
        <LoginMethods
          key={flow ?? "overview"}
          flow={flow}
          oauth={oauth}
          onStartFlow={handleStartFlow}
          onBackToOverview={onBackToOverview}
          onGoogleOAuthReturnHandled={onGoogleOAuthReturnHandled}
          onRequestPreviousMethodRemoval={handlePreviousMethodRemoval}
          pendingRemovalKind={pendingRemovalKind}
          onPendingRemovalClaimed={handlePendingRemovalClaimed}
        />
      </Stack>
    </AuthenticatedPageContent>
  );
}
