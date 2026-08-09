import { Stack } from "@chakra-ui/react";
import { type LoginMethodMigrationFlow, LoginMethods } from "@/src/components/features/LoginMethods";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";

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
  return (
    <AuthenticatedPageContent>
      <Stack gap={3}>
        <DetailPageHeader title="アカウント設定" onBack={() => window.history.back()} />
        <LoginMethods
          flow={flow}
          oauth={oauth}
          onStartFlow={onStartFlow}
          onBackToOverview={onBackToOverview}
          onGoogleOAuthReturnHandled={onGoogleOAuthReturnHandled}
        />
      </Stack>
    </AuthenticatedPageContent>
  );
}
