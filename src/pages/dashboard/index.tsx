import { Alert, Stack } from "@chakra-ui/react";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { LuRefreshCw, LuStore, LuTriangleAlert } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Dashboard, type DashboardNavigation, DashboardSkeleton } from "@/src/components/features/Dashboard";
import { Animation } from "@/src/components/templates/Animation";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { useShopQuery } from "@/src/hooks/useShopQuery";
import { ManagerShopScopeProvider } from "@/src/providers/ManagerShopScopeProvider";
import { featureVisibilityAtom } from "@/src/stores/user";
import {
  buildDashboardShopContexts,
  type DashboardShopOption,
  readDashboardShopPreference,
  resolveDashboardShop,
  writeDashboardShopPreference,
} from "./script";

type Props = {
  organizationId: Id<"organizations">;
  organizationName: string;
  memberStatus: "active" | "readOnly";
  activeShops: DashboardShopOption[] | null;
  requestedShopId?: string;
};

export function DashboardRoutePage({
  organizationId,
  organizationName,
  memberStatus,
  activeShops,
  requestedShopId,
}: Props) {
  const navigate = useNavigate();
  const storage = resolveBrowserLocalStorage();
  const preferredShopId = readDashboardShopPreference(storage, organizationId);
  const resolution = resolveDashboardShop(activeShops, requestedShopId, preferredShopId);
  const canonicalShopId = resolution.kind === "ready" ? resolution.canonicalShopId : undefined;
  const shouldReplaceSearch = resolution.kind === "ready" && resolution.shouldReplaceSearch;

  useEffect(() => {
    if (!shouldReplaceSearch || !canonicalShopId) return;
    void navigate({
      to: "/dashboard",
      search: { org: organizationId, shop: canonicalShopId },
      replace: true,
    });
  }, [canonicalShopId, navigate, organizationId, shouldReplaceSearch]);

  useEffect(() => {
    if (!canonicalShopId) return;
    writeDashboardShopPreference(storage, organizationId, canonicalShopId);
  }, [canonicalShopId, organizationId, storage]);

  return (
    <AuthenticatedPageContent includeMobileNavigation>
      {resolution.kind === "empty" ? (
        <DashboardPageStateView
          state={{ kind: "empty" }}
          onOpenManagement={() => void navigate({ to: "/app/manage", search: { org: organizationId } })}
        />
      ) : (
        <Animation>
          {resolution.kind === "loading" ? (
            <DashboardPageStateView state={{ kind: "loading" }} />
          ) : (
            <ErrorBoundary
              key={`${organizationId}:${resolution.shop.id}`}
              fallback={<DashboardPageStateView state={{ kind: "error" }} onReload={() => window.location.reload()} />}
            >
              <ManagerShopScopeProvider
                key={`${organizationId}:${resolution.shop.id}`}
                shopId={resolution.shop.id}
                expectedOrganizationId={organizationId}
              >
                <ConnectedDashboard
                  organizationId={organizationId}
                  organizationName={organizationName}
                  memberStatus={memberStatus}
                  activeShops={activeShops ?? []}
                  selectedShopId={resolution.shop.id}
                />
              </ManagerShopScopeProvider>
            </ErrorBoundary>
          )}
        </Animation>
      )}
    </AuthenticatedPageContent>
  );
}

function ConnectedDashboard({
  organizationId,
  organizationName,
  memberStatus,
  activeShops,
  selectedShopId,
}: {
  organizationId: Id<"organizations">;
  organizationName: string;
  memberStatus: "active" | "readOnly";
  activeShops: DashboardShopOption[];
  selectedShopId: string;
}) {
  const navigate = useNavigate();
  const featureVisibility = useAtomValue(featureVisibilityAtom);
  const shop = useShopQuery(api.dashboard.queries.getDashboardShop, {});
  const currentUser = useQuery(api.dashboard.queries.getCurrentUser, {});
  const managerLegalConsentStatus = useQuery(api.legal.queries.getManagerConsentStatus, {});
  const shopContexts = useMemo(
    () =>
      buildDashboardShopContexts(activeShops, {
        id: organizationId,
        name: organizationName,
        memberStatus,
      }),
    [activeShops, memberStatus, organizationId, organizationName],
  );
  const selectedShop = shopContexts.find((candidate) => candidate.shopId === selectedShopId);
  const navigation = useMemo<DashboardNavigation>(
    () => ({
      onOpenBillingSettings: () => void navigate({ to: "/app/manage/billing", search: { org: organizationId } }),
      onOpenOrganizationSettings: () =>
        void navigate({ to: "/app/manage/organization", search: { org: organizationId } }),
      onOpenShopDetail: (shopId) =>
        void navigate({
          to: "/app/manage/shops/$shopId",
          params: { shopId },
          search: { org: organizationId },
        }),
      onOpenShiftBoard: (recruitmentId) =>
        void navigate({
          to: "/app/shifts/$recruitmentId/board",
          params: { recruitmentId },
          search: { org: organizationId },
        }),
      onOpenStaffDetail: (personId) =>
        void navigate({
          to: "/app/staff/$personId",
          params: { personId },
          search: { org: organizationId },
        }),
      onManageManagers: () => void navigate({ to: "/app/manage/managers", search: { org: organizationId } }),
    }),
    [navigate, organizationId],
  );

  if (shop === undefined || currentUser === undefined || managerLegalConsentStatus === undefined) {
    return <DashboardPageStateView state={{ kind: "loading" }} />;
  }

  if (shop === null || !selectedShop) {
    return <DashboardPageStateView state={{ kind: "inaccessible" }} onReload={() => window.location.reload()} />;
  }

  const isReadOnly = memberStatus === "readOnly" || !shop.canWriteBusinessData;

  return (
    <Stack gap={5}>
      {isReadOnly && (
        <DashboardReadOnlyNotice
          organizationId={organizationId}
          memberStatus={memberStatus}
          businessWriteBlockReason={shop.businessWriteBlockReason}
        />
      )}
      <Dashboard
        shop={shop}
        currentUser={currentUser && "accountDeleted" in currentUser ? null : currentUser}
        managerLegalConsentStatus={managerLegalConsentStatus}
        isReadOnly={isReadOnly}
        trialEndingNotice={shop.trialEndingNotice}
        planStatus={shop.planStatus}
        billingSettingsShopId={selectedShopId}
        isBillingFeatureVisible={featureVisibility.billing}
        expectedOrganizationId={organizationId}
        navigation={navigation}
        showOrganizationContext={false}
        operationContextData={{
          shops: shopContexts,
          selectedShop,
          onSelect: (nextShop) =>
            void navigate({
              to: "/dashboard",
              search: { org: organizationId, shop: nextShop.shopId },
            }),
        }}
      />
    </Stack>
  );
}

/** 組織未作成の認証済み利用者だけに、既存の初回Setupを新shell内で表示する。 */
export function DashboardSetupPage() {
  const currentUser = useQuery(api.dashboard.queries.getCurrentUser, {});

  return (
    <AuthenticatedPageContent>
      <Animation>
        {currentUser === undefined ? (
          <DashboardPageStateView state={{ kind: "loading" }} />
        ) : (
          <Dashboard
            shop={null}
            currentUser={currentUser && "accountDeleted" in currentUser ? null : currentUser}
            managerLegalConsentStatus={undefined}
            showOrganizationContext={false}
          />
        )}
      </Animation>
    </AuthenticatedPageContent>
  );
}

function resolveBrowserLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function DashboardReadOnlyNotice({
  organizationId,
  memberStatus,
  businessWriteBlockReason,
}: {
  organizationId: Id<"organizations">;
  memberStatus: "active" | "readOnly";
  businessWriteBlockReason: "paymentResultPending" | "restricted" | null;
}) {
  return (
    <Alert.Root status="warning" borderRadius="xl" alignItems="flex-start">
      <Alert.Indicator mt={1} />
      <Alert.Content>
        <Alert.Title>この店舗は閲覧のみです</Alert.Title>
        <Alert.Description whiteSpace="pre-line">
          {memberStatus === "readOnly"
            ? "閲覧のみの管理者は、既存データを確認できますが、変更や通知送信はできません。"
            : businessWriteBlockReason === "paymentResultPending"
              ? "支払い結果を確認中です。\n確認が完了するまで、既存データの閲覧はできますが、変更や通知送信はできません。"
              : "契約制限中です。\n既存データは引き続き確認できます。"}
        </Alert.Description>
        <Button asChild size="sm" variant="outline" mt={3} alignSelf="flex-start">
          <RouterLink to="/app/manage" search={{ org: organizationId }}>
            管理を開く
          </RouterLink>
        </Button>
      </Alert.Content>
    </Alert.Root>
  );
}

export type DashboardPageState = { kind: "loading" } | { kind: "empty" } | { kind: "inaccessible" } | { kind: "error" };

export function DashboardPageStateView({
  state,
  onOpenManagement,
  onReload,
}: {
  state: DashboardPageState;
  onOpenManagement?: () => void;
  onReload?: () => void;
}) {
  if (state.kind === "loading") {
    return <DashboardSkeleton showOrganizationContext={false} />;
  }

  if (state.kind === "empty") {
    return (
      <Empty
        icon={LuStore}
        title="利用できる店舗がありません"
        description={"この組織には利用中の店舗がありません。\n店舗の状態は管理画面から確認できます。"}
        tone="neutral"
        minH="420px"
        action={
          onOpenManagement ? (
            <Button colorPalette="teal" onClick={onOpenManagement}>
              管理を開く
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (state.kind === "inaccessible") {
    return (
      <Empty
        icon={LuTriangleAlert}
        title="この店舗を開けません"
        description={
          "店舗が削除されたか、この組織から閲覧できない可能性があります。\n最新の状態を読み込み直してください。"
        }
        tone="warning"
        minH="420px"
        action={
          onReload ? (
            <Button colorPalette="teal" onClick={onReload}>
              再読み込みする
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <Empty
      icon={LuRefreshCw}
      title="ホームを読み込めませんでした"
      description={"一時的な問題が発生しました。\n通信状況をご確認のうえ、もう一度お試しください。"}
      tone="danger"
      minH="420px"
      action={
        onReload ? (
          <Button colorPalette="teal" onClick={onReload}>
            再読み込みする
          </Button>
        ) : undefined
      }
    />
  );
}
