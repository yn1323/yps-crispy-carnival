import { Box, Flex, HStack, Skeleton, Stack } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useState } from "react";
import { LuRefreshCw } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffOrderEditor } from "@/src/components/features/StaffOrderEditor";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";

type Props = {
  organizationId: Id<"organizations">;
  requestedShopFilter?: string;
  activeShops: Array<{ id: Id<"shops">; name: string }> | null;
};

export function AppStaffOrderRoutePage({ organizationId, requestedShopFilter, activeShops }: Props) {
  const [retryRevision, setRetryRevision] = useState(0);
  const filteredShop = activeShops?.find((shop) => shop.id === requestedShopFilter);

  return (
    <AuthenticatedPageContent>
      <Box maxW="760px" mx="auto">
        {activeShops === null ? (
          <StaffOrderPageStateView state={{ kind: "loading" }} />
        ) : (
          <ErrorBoundary
            key={`${organizationId}:${retryRevision}`}
            fallback={
              <StaffOrderPageStateView
                state={{ kind: "error" }}
                onRetry={() => setRetryRevision((revision) => revision + 1)}
              />
            }
          >
            <ConnectedStaffOrderPage
              key={organizationId}
              organizationId={organizationId}
              filteredShopName={filteredShop?.name}
              returnShopFilter={filteredShop?.id}
            />
          </ErrorBoundary>
        )}
      </Box>
    </AuthenticatedPageContent>
  );
}

function ConnectedStaffOrderPage({
  organizationId,
  filteredShopName,
  returnShopFilter,
}: {
  organizationId: Id<"organizations">;
  filteredShopName?: string;
  returnShopFilter?: Id<"shops">;
}) {
  const editor = useQuery(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor, {
    organizationId,
  });

  if (editor === undefined) return <StaffOrderPageStateView state={{ kind: "loading" }} />;

  return (
    <StaffOrderEditor
      key={organizationId}
      organizationId={organizationId}
      editor={editor}
      filteredShopName={filteredShopName}
      returnShopFilter={returnShopFilter}
    />
  );
}

export function StaffOrderPageStateView({
  state,
  onRetry,
}: {
  state: { kind: "loading" } | { kind: "error" };
  onRetry?: () => void;
}) {
  if (state.kind === "loading") {
    return (
      <Stack as="main" aria-label="スタッフの並び順を読み込み中" aria-busy="true" gap={5}>
        <HStack gap={2.5}>
          <Skeleton boxSize="24px" borderRadius="sm" />
          <Skeleton h="28px" w="136px" />
        </HStack>
        <Stack gap={2}>
          <Skeleton h="24px" w="90%" />
          <Skeleton h="24px" w="72%" />
        </Stack>
        <Stack gap={2}>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} h="68px" borderRadius="xl" />
          ))}
        </Stack>
        <Flex justify="flex-end">
          <Skeleton h="48px" w={{ base: "full", sm: "176px" }} borderRadius="md" />
        </Flex>
      </Stack>
    );
  }

  return (
    <Empty
      icon={LuRefreshCw}
      title="スタッフの並び順を読み込めませんでした"
      description="通信状況をご確認のうえ、もう一度お試しください。"
      tone="danger"
      minH="360px"
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            再試行する
          </Button>
        ) : undefined
      }
    />
  );
}
