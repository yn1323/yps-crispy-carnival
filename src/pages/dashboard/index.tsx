import { Alert, Stack } from "@chakra-ui/react";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo } from "react";
import { LuRefreshCw, LuStore, LuTriangleAlert } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Dashboard, type DashboardNavigation, DashboardSkeleton } from "@/src/components/features/Dashboard";
import type { DashboardPlanStatusSource } from "@/src/components/features/Dashboard/PlanStatusCard";
import { Animation } from "@/src/components/templates/Animation";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { useShopQuery } from "@/src/hooks/useShopQuery";
import { ManagerShopScopeProvider } from "@/src/providers/ManagerShopScopeProvider";
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

type DashboardShop = FunctionReturnType<typeof api.dashboard.queries.getDashboardShop>;
type DashboardPlanStatusResponse = NonNullable<NonNullable<DashboardShop>["planStatus"]>;

function toCanonicalDashboardPlanStatus(status: DashboardPlanStatusResponse): DashboardPlanStatusSource {
  const isCanonicalPaidPlan = (plan: string | undefined): plan is "standard" | "pro" =>
    plan === "standard" || plan === "pro";

  switch (status.kind) {
    case "trial":
      if (status.selectedPaidPlan !== undefined && !isCanonicalPaidPlan(status.selectedPaidPlan)) break;
      return status as DashboardPlanStatusSource;
    case "freePlan":
      return status;
    case "paidPlan":
      if (!isCanonicalPaidPlan(status.plan)) break;
      if (
        status.scheduledChange !== undefined &&
        status.scheduledChange.targetPlan !== "free" &&
        status.scheduledChange.targetPlan !== "standard"
      ) {
        break;
      }
      return status as DashboardPlanStatusSource;
    case "paymentIssue":
      if (status.plan !== undefined && !isCanonicalPaidPlan(status.plan)) break;
      return status as DashboardPlanStatusSource;
    case "paymentPending":
      if (
        (status.currentPlan !== null && status.currentPlan !== "free" && status.currentPlan !== "standard") ||
        !isCanonicalPaidPlan(status.targetPlan)
      ) {
        break;
      }
      return status as DashboardPlanStatusSource;
    case "restricted":
      if (status.displayPlan !== null && status.displayPlan !== "free" && !isCanonicalPaidPlan(status.displayPlan)) {
        break;
      }
      return status as DashboardPlanStatusSource;
  }

  throw new Error("canonical_plan_id_response_required");
}

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
          onOpenManagement={() => void navigate({ to: "/manage", search: { org: organizationId } })}
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
  const shop = useShopQuery(api.dashboard.queries.getDashboardShop, { planIdVersion: 2 });
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
      onOpenBillingSettings: () => void navigate({ to: "/manage/billing", search: { org: organizationId } }),
      onOpenOrganizationSettings: () => void navigate({ to: "/manage/organization", search: { org: organizationId } }),
      onOpenShopDetail: (shopId) =>
        void navigate({
          to: "/manage/shops/$shopId",
          params: { shopId },
          search: { org: organizationId },
        }),
      onOpenShiftBoard: (recruitmentId) =>
        void navigate({
          to: "/shifts/$recruitmentId/board",
          params: { recruitmentId },
          search: { org: organizationId },
        }),
      onOpenStaffDetail: (personId) =>
        void navigate({
          to: "/staff/$personId",
          params: { personId },
          search: { org: organizationId },
        }),
      onManageManagers: () => void navigate({ to: "/manage/managers", search: { org: organizationId } }),
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
  const planStatus = shop.planStatus ? toCanonicalDashboardPlanStatus(shop.planStatus) : shop.planStatus;

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
        planStatus={planStatus}
        billingSettingsShopId={selectedShopId}
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
  businessWriteBlockReason:
    | "paymentResultPending"
    | "restricted"
    | "usageLimitExceeded"
    | "usageLimitEvaluationUnavailable"
    | null;
}) {
  const usageLimitEvaluationUnavailable =
    memberStatus === "active" && businessWriteBlockReason === "usageLimitEvaluationUnavailable";

  return (
    <Alert.Root status="warning" borderRadius="xl" alignItems="flex-start">
      <Alert.Indicator mt={1} />
      <Alert.Content>
        <Alert.Title>
          {usageLimitEvaluationUnavailable ? "利用状況を確認してください" : "現在、この店舗では操作できません"}
        </Alert.Title>
        <Alert.Description whiteSpace="pre-line">
          {memberStatus === "readOnly"
            ? "現在のアカウント状態では、既存データを確認できますが、変更や通知送信はできません。"
            : businessWriteBlockReason === "paymentResultPending"
              ? "支払い結果を確認中です。\n確認が完了するまで、既存データの閲覧はできますが、変更や通知送信はできません。"
              : usageLimitEvaluationUnavailable
                ? "現在の利用人数・店舗・管理者数がプラン上限内か安全に確認できないため、通常の業務操作を一時的に制限しています。\n管理画面で利用状況を確認・整理し、解消しない場合はサポートへお問い合わせください。"
                : businessWriteBlockReason === "usageLimitExceeded"
                  ? "プラン上限を超過しているため、業務操作を一時的に制限しています。\n利用人数・店舗・管理者を上限内に減らすか、プランを変更してください。"
                  : "契約状態の確認が必要です。\n既存データは引き続き確認できます。"}
        </Alert.Description>
        <Button asChild size="sm" variant="outline" mt={3} alignSelf="flex-start">
          <RouterLink to="/manage" search={{ org: organizationId }}>
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
