import { Alert, Stack } from "@chakra-ui/react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  ManagerExternalInviteForm,
  ManagerExternalInvitePageSkeleton,
} from "@/src/components/features/ManagerSettings";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import { useShopQuery } from "@/src/hooks/useShopQuery";

export function ManagerInviteNewPage({ shopId }: { shopId?: string }) {
  const navigate = useNavigate();
  const [queryNow] = useState(() => Date.now());
  const overview = useShopQuery(api.organization.queries.getManagerSettingsOverview, { now: queryNow });

  if (overview?.kind === "hidden") {
    return <Navigate to="/settings" search={{ shop: shopId }} replace />;
  }
  const onBack = () => void navigate({ to: "/settings/managers", search: { shop: shopId }, replace: true });

  return (
    <AuthenticatedPageContent>
      {overview === undefined || !shopId ? (
        <ManagerExternalInvitePageSkeleton />
      ) : (
        <Stack gap={{ base: 6, md: 8 }}>
          <DetailPageHeader
            title="新しいユーザーを管理者として招待"
            onBack={onBack}
            backLabel="管理者設定へ戻る"
            backAriaLabel="管理者設定へ戻る"
          />
          {overview.kind !== "ready" ? (
            <Alert.Root status="error" borderRadius="lg" role="alert">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>管理者招待を開始できません</Alert.Title>
                <Alert.Description>
                  {overview.kind === "integrityError" ? overview.message : "現在利用できません。"}
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          ) : !overview.actions.canInviteExternal ? (
            <Alert.Root status="warning" borderRadius="lg">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>新しいユーザーは招待できません</Alert.Title>
                <Alert.Description>
                  {overview.actions.externalDisabledReason ?? "現在の契約では、この招待方法を利用できません。"}
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          ) : (
            <ManagerExternalInviteForm overview={overview} shopId={shopId} />
          )}
        </Stack>
      )}
    </AuthenticatedPageContent>
  );
}
