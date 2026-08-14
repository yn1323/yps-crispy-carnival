import { Alert, Stack } from "@chakra-ui/react";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  isLegacyFreeManagerExchangeMode,
  ManagerExternalInviteForm,
  ManagerExternalInvitePageSkeleton,
} from "@/src/components/features/ManagerSettings";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import { useShopQuery } from "@/src/hooks/useShopQuery";

export function ManagerInviteNewPage({ shopId }: { shopId?: string }) {
  const router = useRouter();
  const [queryNow] = useState(() => Date.now());
  const overview = useShopQuery(api.organization.queries.getManagerSettingsOverview, { now: queryNow });

  const onBack = () => router.history.back();

  return (
    <AuthenticatedPageContent>
      {overview === undefined || !shopId ? (
        <ManagerExternalInvitePageSkeleton />
      ) : (
        <Stack gap={{ base: 6, md: 8 }}>
          <DetailPageHeader
            title="新しいユーザーを管理者として招待"
            onBack={onBack}
            backLabel="前の画面へ戻る"
            backAriaLabel="前の画面へ戻る"
          />
          {overview.kind !== "ready" ? (
            <Alert.Root status="error" borderRadius="lg" role="alert">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>管理者招待を開始できません</Alert.Title>
                <Alert.Description>{overview.message}</Alert.Description>
              </Alert.Content>
            </Alert.Root>
          ) : overview.mode !== "managerAddition" || !overview.actions.canInviteExternal ? (
            <Alert.Root status="warning" borderRadius="lg">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>新しいユーザーは招待できません</Alert.Title>
                <Alert.Description>
                  {isLegacyFreeManagerExchangeMode(overview.mode)
                    ? "以前の管理者交代機能は終了しました。送信済みの交代招待を取り消すか、有効期限が切れてから画面を更新してください。"
                    : (overview.actions.externalDisabledReason ?? "現在の契約では、この招待方法を利用できません。")}
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
