import { Alert, Stack } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { ManagerCandidatePageContent, ManagerCandidatePageSkeleton } from "@/src/components/features/ManagerSettings";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import { useShopQuery } from "@/src/hooks/useShopQuery";

export function ManagerInviteStaffPage({ shopId }: { shopId?: string }) {
  const navigate = useNavigate();
  const [queryNow] = useState(() => Date.now());
  const overview = useShopQuery(api.organization.queries.getManagerSettingsOverview, { now: queryNow });
  const candidates = useShopQuery(api.organization.queries.getManagerCandidates, { now: queryNow });

  const onBack = () => void navigate({ to: "/settings/managers", search: { shop: shopId }, replace: true });

  return (
    <AuthenticatedPageContent>
      {overview === undefined || candidates === undefined || !shopId ? (
        <ManagerCandidatePageSkeleton />
      ) : overview.kind !== "ready" ? (
        <StackWithHeader title="既存スタッフを管理者として招待" onBack={onBack}>
          <Alert.Root status="error" borderRadius="lg" role="alert">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>管理者招待を開始できません</Alert.Title>
              <Alert.Description>{overview.message}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        </StackWithHeader>
      ) : (
        <StackWithHeader title="既存スタッフを管理者として招待" onBack={onBack}>
          <ManagerCandidatePageContent overview={overview} result={candidates} shopId={shopId} />
        </StackWithHeader>
      )}
    </AuthenticatedPageContent>
  );
}

function StackWithHeader({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <DetailPageHeader title={title} onBack={onBack} backLabel="管理者設定へ戻る" backAriaLabel="管理者設定へ戻る" />
      {children}
    </Stack>
  );
}
