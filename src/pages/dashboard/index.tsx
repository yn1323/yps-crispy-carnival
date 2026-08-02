import { Alert, Box, Stack } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { Dashboard, DashboardSkeleton } from "@/src/components/features/Dashboard";
import { Animation } from "@/src/components/templates/Animation";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { RootContentWrapper } from "@/src/components/templates/RootContentWrapper";
import { Button } from "@/src/components/ui/Button";
import { isSelectableShop, normalizeShopContextOptions } from "@/src/domains/shop/context";
import { useShopQuery } from "@/src/hooks/useShopQuery";
import { selectedShopAtom } from "@/src/stores/shop";
import { featureVisibilityAtom } from "@/src/stores/user";

type Props = {
  visibleUserCount?: number;
  focusedPersonId?: string;
  onVisibleUserCountChange?: (count: number) => void;
};

export function DashboardPage({ visibleUserCount, focusedPersonId, onVisibleUserCountChange }: Props) {
  const selectedContext = useAtomValue(selectedShopAtom);
  const featureVisibility = useAtomValue(featureVisibilityAtom);
  const showGroupSettings = featureVisibility.organizationSettingsNavigation;
  const myShops = useQuery(api.dashboard.queries.getMyShops, {});
  const selectedShop = useShopQuery(api.dashboard.queries.getDashboardShop, {});
  const selectableShops =
    myShops === undefined ? undefined : normalizeShopContextOptions(myShops).filter(isSelectableShop);
  const shop = selectableShops === undefined ? undefined : selectableShops.length === 0 ? null : selectedShop;
  const currentUser = useQuery(api.dashboard.queries.getCurrentUser, {});
  const managerLegalConsentStatus = useQuery(
    api.legal.queries.getManagerConsentStatus,
    shop === undefined || shop === null ? "skip" : {},
  );

  const isDashboardInitialLoading =
    shop === undefined || (shop !== null && (currentUser === undefined || managerLegalConsentStatus === undefined));

  if (isDashboardInitialLoading) {
    return (
      <DashboardPageShell>
        <Animation>
          <DashboardSkeleton />
        </Animation>
      </DashboardPageShell>
    );
  }

  const isShopOrMemberReadOnly = Boolean(
    selectedContext && (selectedContext.shopStatus !== "active" || selectedContext.memberStatus === "readOnly"),
  );
  const isBillingReadOnly = shop?.canWriteBusinessData === false;
  const isReadOnly = isShopOrMemberReadOnly || isBillingReadOnly;

  return (
    <DashboardPageShell>
      <Animation>
        <Stack gap={5}>
          {selectedContext && isReadOnly && (
            <Alert.Root status="warning" borderRadius="xl" alignItems="flex-start">
              <Alert.Indicator mt={1} />
              <Alert.Content>
                <Alert.Title>この店舗は閲覧のみです</Alert.Title>
                <Alert.Description whiteSpace="pre-line">
                  {selectedContext.shopStatus === "archived"
                    ? showGroupSettings
                      ? "アーカイブ済みのため、シフトや利用者の追加・変更はできません。\n再開するときは、グループ設定から再稼働してください。"
                      : "アーカイブ済みのため、シフトや利用者の追加・変更はできません。"
                    : selectedContext.shopStatus === "planSuspended"
                      ? "現在のプランでは、この店舗を利用できません。\n既存データは削除されていません。"
                      : shop?.businessWriteBlockReason === "paymentResultPending"
                        ? "支払い結果を確認中です。\n確認が完了するまで、既存データの閲覧はできますが、変更や通知送信はできません。"
                        : shop?.businessWriteBlockReason === "restricted"
                          ? featureVisibility.billing
                            ? "契約制限中です。\n既存データを閲覧しながら、グループ設定で契約の復旧や利用状況の整理を進めてください。"
                            : showGroupSettings
                              ? "契約制限中です。\n既存データを閲覧しながら、グループ設定で利用状況の整理を進めてください。"
                              : "契約制限中です。\n既存データは引き続き確認できます。"
                          : "閲覧のみの管理者は、既存データを確認できますが、変更や通知送信はできません。"}
                </Alert.Description>
                {showGroupSettings && (selectedContext.shopStatus !== "active" || isBillingReadOnly) && (
                  <Button asChild size="sm" variant="outline" mt={3} alignSelf="flex-start">
                    <RouterLink to="/settings" search={{ shop: selectedContext.shopId }}>
                      グループ設定を開く
                    </RouterLink>
                  </Button>
                )}
              </Alert.Content>
            </Alert.Root>
          )}
          <Dashboard
            shop={shop}
            currentUser={currentUser && "accountDeleted" in currentUser ? null : currentUser}
            managerLegalConsentStatus={managerLegalConsentStatus}
            isReadOnly={isReadOnly}
            visibleUserCount={visibleUserCount}
            focusedPersonId={focusedPersonId}
            onVisibleUserCountChange={onVisibleUserCountChange}
            trialEndingNotice={shop?.trialEndingNotice ?? null}
            billingSettingsShopId={selectedContext?.shopId}
            isBillingFeatureVisible={featureVisibility.billing}
            operationContextData={
              selectedContext && selectableShops ? { shops: selectableShops, selectedShop: selectedContext } : undefined
            }
          />
        </Stack>
      </Animation>
    </DashboardPageShell>
  );
}

const DashboardPageShell = ({ children }: { children: ReactNode }) => (
  <Box
    minH={{
      base: `calc(100dvh - ${HEADER_HEIGHT.base})`,
      md: `calc(100dvh - ${HEADER_HEIGHT.md})`,
    }}
    bg="gray.50"
  >
    <RootContentWrapper>{children}</RootContentWrapper>
  </Box>
);
