import { Stack } from "@chakra-ui/react";
import { LuUserRound } from "react-icons/lu";
import { AccountDeletionSection } from "@/src/components/features/AccountDeletion";
import { type LoginMethodMigrationFlow, LoginMethods } from "@/src/components/features/LoginMethods";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";

export type AccountSecurityPageFlow = LoginMethodMigrationFlow;

type AccountSecurityPageProps = {
  includeMobileNavigation?: boolean;
  flow?: AccountSecurityPageFlow;
  oauth?: "google";
  onStartFlow?: (flow: AccountSecurityPageFlow) => void;
  onBackToOverview?: () => void;
  onGoogleOAuthReturnHandled?: () => void;
};

export function AccountSecurityPage({
  includeMobileNavigation = false,
  flow,
  oauth,
  onStartFlow,
  onBackToOverview,
  onGoogleOAuthReturnHandled,
}: AccountSecurityPageProps) {
  return (
    <AuthenticatedPageContent includeMobileNavigation={includeMobileNavigation}>
      <Stack gap={3}>
        <DetailPageHeader title="アカウント設定" icon={LuUserRound} onBack={() => window.history.back()} />
        <LoginMethods
          flow={flow}
          oauth={oauth}
          onStartFlow={onStartFlow}
          onBackToOverview={onBackToOverview}
          onGoogleOAuthReturnHandled={onGoogleOAuthReturnHandled}
        />
        <AccountDeletionSection />
      </Stack>
    </AuthenticatedPageContent>
  );
}
