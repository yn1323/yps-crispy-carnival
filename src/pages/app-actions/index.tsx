import { Alert, Box, Flex, Heading, HStack, Icon, Skeleton, Stack, Text } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo } from "react";
import { LuChevronDown, LuMessageCircle, LuRefreshCw } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { ActionInboxConfirmationDialog, ActionInboxView } from "@/src/components/features/ActionInbox";
import { ShopFilterMenu } from "@/src/components/features/AuthenticatedApp/ShopFilterMenu";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { Button } from "@/src/components/ui/Button";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { useActionInboxController } from "./useActionInboxController";
import { useActionInboxData } from "./useActionInboxData";

type ShopOption = { id: string; name: string };

export function AppActionsRoutePage({
  organizationId,
  memberStatus,
  activeShops,
  requestedShopFilter,
}: {
  organizationId: Id<"organizations">;
  memberStatus: "active" | "readOnly";
  activeShops: ShopOption[] | null;
  requestedShopFilter?: string;
}) {
  const navigate = useNavigate();
  const resolvedFilter = useMemo(
    () => resolveActionShopFilter(activeShops, requestedShopFilter),
    [activeShops, requestedShopFilter],
  );
  const filterKind = resolvedFilter.kind;
  const shouldReplaceSearch = resolvedFilter.kind === "ready" && resolvedFilter.shouldReplaceSearch;
  const resolvedShopFilter = resolvedFilter.kind === "ready" ? resolvedFilter.shopFilter : "all";

  useEffect(() => {
    if (filterKind !== "ready" || !shouldReplaceSearch) return;
    void navigate({
      to: "/actions",
      search: {
        org: organizationId,
        ...(resolvedShopFilter === "all" ? {} : { shopFilter: resolvedShopFilter }),
      },
      replace: true,
    });
  }, [filterKind, navigate, organizationId, resolvedShopFilter, shouldReplaceSearch]);

  if (resolvedFilter.kind === "loading") {
    return <AppActionsPageView state={{ kind: "loading" }} />;
  }

  return (
    <ErrorBoundary
      key={`${organizationId}:${resolvedShopFilter}`}
      fallback={<AppActionsPageView state={{ kind: "error" }} onReload={() => window.location.reload()} />}
    >
      <ConnectedAppActions
        key={`${organizationId}:${resolvedShopFilter}`}
        organizationId={organizationId}
        memberStatus={memberStatus}
        activeShops={activeShops ?? []}
        shopFilter={resolvedShopFilter}
        onShopFilterChange={(nextFilter) =>
          void navigate({
            to: "/actions",
            search: { org: organizationId, ...(nextFilter ? { shopFilter: nextFilter } : {}) },
          })
        }
      />
    </ErrorBoundary>
  );
}

function ConnectedAppActions({
  organizationId,
  memberStatus,
  activeShops,
  shopFilter,
  onShopFilterChange,
}: {
  organizationId: Id<"organizations">;
  memberStatus: "active" | "readOnly";
  activeShops: ShopOption[];
  shopFilter: "all" | Id<"shops">;
  onShopFilterChange: (shopId: string | null) => void;
}) {
  const data = useActionInboxData({ organizationId, shopFilter });
  const controller = useActionInboxController({
    organizationId,
    sourceItems: data.items,
    onRefresh: data.refresh,
  });

  if (data.isLoading) return <AppActionsPageView state={{ kind: "loading" }} />;

  return (
    <AppActionsPageView
      state={{ kind: "ready" }}
      headingAction={
        <ShopFilterMenu
          value={shopFilter === "all" ? null : shopFilter}
          options={activeShops.map((shop) => ({ value: shop.id, label: shop.name }))}
          onChange={onShopFilterChange}
          prefix="対象"
        />
      }
    >
      {memberStatus === "readOnly" && <AppActionsReadOnlyNotice />}
      <ActionInboxView items={controller.items} completedItemId={controller.completedItemId} />
      {data.canLoadMore && (
        <Flex justify="center">
          <Button
            type="button"
            variant="ghost"
            colorPalette="teal"
            size="sm"
            loading={data.isLoadingMore}
            loadingText="読み込み中"
            onClick={data.loadMore}
            gap={1}
          >
            <LuChevronDown aria-hidden />
            もっと見る
          </Button>
        </Flex>
      )}
      <ActionInboxConfirmationDialog
        confirmation={controller.confirmation}
        errorMessage={controller.confirmationError}
        isRunning={controller.isConfirming}
        onClose={controller.closeConfirmation}
        onConfirm={controller.confirm}
      />
    </AppActionsPageView>
  );
}

type PageState = { kind: "loading" } | { kind: "ready" } | { kind: "error" };

export function AppActionsPageView({
  state,
  headingAction,
  onReload,
  children,
}: {
  state: PageState;
  headingAction?: ReactNode;
  onReload?: () => void;
  children?: ReactNode;
}) {
  return (
    <AuthenticatedPageContent includeMobileNavigation>
      <Stack as="main" gap={{ base: 6, lg: 8 }}>
        <Flex align="center" justify="space-between" gap={3} minH="44px">
          <HStack gap={2.5} minW={0} flexShrink={0}>
            <Icon as={LuMessageCircle} boxSize={{ base: 5, lg: 6 }} flexShrink={0} aria-hidden />
            <Heading as="h1" textStyle="sectionTitle" color="gray.900">
              要対応
            </Heading>
          </HStack>
          {headingAction && (
            <Box minW={0} maxW={{ base: "190px", sm: "240px" }}>
              {headingAction}
            </Box>
          )}
        </Flex>

        {state.kind === "loading" ? (
          <Stack aria-label="要対応一覧を読み込み中" gap={3}>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} h={{ base: "168px", md: "112px" }} borderRadius="xl" />
            ))}
          </Stack>
        ) : state.kind === "error" ? (
          <Stack align="center" py={16} gap={4} textAlign="center">
            <Text fontWeight="bold">要対応一覧を読み込めませんでした</Text>
            <Text color="fg.muted">通信状態を確認して、もう一度お試しください。</Text>
            {onReload && (
              <Button type="button" variant="outline" minH="44px" onClick={onReload}>
                <LuRefreshCw aria-hidden />
                再読み込み
              </Button>
            )}
          </Stack>
        ) : (
          children
        )}
      </Stack>
    </AuthenticatedPageContent>
  );
}

export function AppActionsReadOnlyNotice() {
  return (
    <Alert.Root status="warning" borderRadius="xl">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>閲覧のみの管理者です</Alert.Title>
        <Alert.Description>対応内容は確認できますが、承認・再送・取り消しはできません。</Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}

export function resolveActionShopFilter(
  activeShops: readonly ShopOption[] | null,
  requestedShopFilter?: string,
): { kind: "loading" } | { kind: "ready"; shopFilter: "all" | Id<"shops">; shouldReplaceSearch: boolean } {
  if (activeShops === null) return { kind: "loading" };
  if (!requestedShopFilter) return { kind: "ready", shopFilter: "all", shouldReplaceSearch: false };
  const shop = activeShops.find((candidate) => candidate.id === requestedShopFilter);
  if (!shop) return { kind: "ready", shopFilter: "all", shouldReplaceSearch: true };
  return { kind: "ready", shopFilter: shop.id as Id<"shops">, shouldReplaceSearch: false };
}
