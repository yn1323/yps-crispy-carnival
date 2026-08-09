import { Heading, Stack } from "@chakra-ui/react";
import { type LoginMethodMigrationFlow, LoginMethods } from "@/src/components/features/LoginMethods";
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
  return (
    <AuthenticatedPageContent>
      <Stack gap={3}>
        <Stack gap={2}>
          <Heading as="h1" textStyle={{ base: "sectionTitle", md: "pageTitle" }} color="gray.900">
            アカウント設定
          </Heading>
        </Stack>
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
