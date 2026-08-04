import { Heading, Stack, Text } from "@chakra-ui/react";
import { LoginMethods } from "@/src/components/features/LoginMethods";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";

type AccountSecurityPageProps = {
  googleOAuthReturn?: boolean;
  onGoogleOAuthReturnHandled?: () => void;
};

export function AccountSecurityPage({ googleOAuthReturn, onGoogleOAuthReturnHandled }: AccountSecurityPageProps) {
  return (
    <AuthenticatedPageContent>
      <Stack gap={6}>
        <Stack gap={2}>
          <Heading as="h1" textStyle={{ base: "sectionTitle", md: "pageTitle" }} color="gray.900">
            ログイン方法とセキュリティ
          </Heading>
          <Text color="fg.muted">シフトリへのログインに使う方法を確認します。</Text>
        </Stack>
        <LoginMethods googleOAuthReturn={googleOAuthReturn} onGoogleOAuthReturnHandled={onGoogleOAuthReturnHandled} />
      </Stack>
    </AuthenticatedPageContent>
  );
}
