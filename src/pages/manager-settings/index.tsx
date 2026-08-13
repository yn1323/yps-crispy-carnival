import { Alert, Stack } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { ManagerSettings, ManagerSettingsSkeleton } from "@/src/components/features/ManagerSettings";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { Button } from "@/src/components/ui/Button";
import { useShopQuery } from "@/src/hooks/useShopQuery";

export function ManagerSettingsPage({ shopId }: { shopId?: string }) {
  const [queryNow] = useState(() => Date.now());
  const overview = useShopQuery(api.organization.queries.getManagerSettingsOverview, { now: queryNow });

  return (
    <AuthenticatedPageContent>
      {overview === undefined || !shopId ? (
        <ManagerSettingsSkeleton />
      ) : overview.kind === "integrityError" ? (
        <ManagerSettingsPageError message={overview.message} shopId={shopId} />
      ) : (
        <ManagerSettings overview={overview} shopId={shopId} />
      )}
    </AuthenticatedPageContent>
  );
}

function ManagerSettingsPageError({ message, shopId }: { message: string; shopId: string }) {
  return (
    <Stack gap={5} py={{ base: 8, md: 12 }}>
      <Alert.Root status="error" borderRadius="xl" role="alert">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>管理者設定を表示できません</Alert.Title>
          <Alert.Description>{message}</Alert.Description>
        </Alert.Content>
      </Alert.Root>
      <Button asChild colorPalette="teal" alignSelf="flex-start">
        <RouterLink to="/settings" search={{ shop: shopId }}>
          組織設定へ戻る
        </RouterLink>
      </Button>
    </Stack>
  );
}
