import { Badge, Box, Flex, Heading, HStack, Skeleton, Stack, Table, Text } from "@chakra-ui/react";
import { LuBellOff, LuChevronDown, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { Tooltip } from "@/src/components/ui/tooltip";
import {
  getStaffNotificationHistoryPresentation,
  type StaffNotificationHistoryItem,
  type StaffNotificationHistoryStatusTone,
} from "./script";

export type StaffNotificationHistoryViewProps = {
  items: readonly StaffNotificationHistoryItem[];
  isLoading?: boolean;
  isError?: boolean;
  canLoadMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  lineConnectionStatus?: "linked" | "unlinked";
};

const STATUS_PALETTE: Record<StaffNotificationHistoryStatusTone, "gray" | "blue" | "green" | "orange" | "red"> = {
  neutral: "gray",
  info: "blue",
  success: "green",
  warning: "orange",
  danger: "red",
};

export function StaffNotificationHistoryView({
  items,
  isLoading = false,
  isError = false,
  canLoadMore = false,
  isLoadingMore = false,
  onLoadMore,
  lineConnectionStatus,
}: StaffNotificationHistoryViewProps) {
  return (
    <Stack as="section" aria-labelledby="staff-notification-history-heading" gap={4}>
      <Flex align="center" justify="space-between" gap={3}>
        <Heading id="staff-notification-history-heading" as="h3" fontSize="md" fontWeight="semibold">
          通知履歴
        </Heading>
        {lineConnectionStatus && (
          <Badge
            colorPalette={lineConnectionStatus === "linked" ? "green" : "gray"}
            variant="subtle"
            borderRadius="full"
            px={2.5}
            py={1}
            whiteSpace="nowrap"
          >
            {lineConnectionStatus === "linked" ? "LINE連携済み" : "LINE未連携"}
          </Badge>
        )}
      </Flex>

      {isLoading ? (
        <StaffNotificationHistorySkeleton />
      ) : isError ? (
        <Empty
          icon={LuTriangleAlert}
          title="通知履歴を読み込めませんでした"
          titleAs="h4"
          description="画面を再読み込みしてください。"
          tone="danger"
          variant="section"
          py={{ base: 8, lg: 10 }}
        />
      ) : items.length === 0 ? (
        <Empty icon={LuBellOff} title="通知はありません。" titleAs="h4" variant="section" py={{ base: 8, lg: 10 }} />
      ) : (
        <>
          <DesktopHistoryTable items={items} />
          <MobileHistoryCards items={items} />
        </>
      )}

      {(canLoadMore || isLoadingMore) && onLoadMore && !isLoading && !isError && (
        <Flex justify="center">
          <Button
            variant="ghost"
            colorPalette="teal"
            size="sm"
            gap={1}
            loading={isLoadingMore}
            disabled={isLoadingMore}
            onClick={onLoadMore}
          >
            <LuChevronDown />
            もっと見る
          </Button>
        </Flex>
      )}
    </Stack>
  );
}

function DesktopHistoryTable({ items }: { items: readonly StaffNotificationHistoryItem[] }) {
  return (
    <Box
      display={{ base: "none", md: "block" }}
      borderWidth="1px"
      borderColor="blackAlpha.100"
      borderRadius="lg"
      overflow="hidden"
    >
      <Table.Root size="sm" aria-label="通知履歴">
        <Table.Header>
          <Table.Row bg="gray.50">
            <Table.ColumnHeader color="gray.600" fontWeight="bold" w="168px">
              日時
            </Table.ColumnHeader>
            <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="center" w="96px">
              送信方法
            </Table.ColumnHeader>
            <Table.ColumnHeader color="gray.600" fontWeight="bold">
              タイトル
            </Table.ColumnHeader>
            <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="center" w="168px">
              状況
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items.map((item) => {
            const presentation = getStaffNotificationHistoryPresentation(item);
            return (
              <Table.Row key={item._id}>
                <Table.Cell color="gray.700" fontVariantNumeric="tabular-nums" whiteSpace="nowrap">
                  {presentation.dateTimeLabel}
                </Table.Cell>
                <Table.Cell textAlign="center" color="gray.800" fontWeight="medium">
                  {presentation.channelLabel}
                </Table.Cell>
                <Table.Cell minW={0} maxW="360px">
                  <Tooltip
                    content={item.displayTitle}
                    disabled={item.displayTitle.length <= 32}
                    contentProps={{ maxW: "min(420px, calc(100vw - 32px))" }}
                  >
                    <Text color="gray.900" truncate tabIndex={item.displayTitle.length > 32 ? 0 : undefined}>
                      {item.displayTitle}
                    </Text>
                  </Tooltip>
                </Table.Cell>
                <Table.Cell textAlign="center">
                  <StatusBadge label={presentation.statusLabel} tone={presentation.statusTone} />
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}

function MobileHistoryCards({ items }: { items: readonly StaffNotificationHistoryItem[] }) {
  return (
    <Stack display={{ base: "flex", md: "none" }} gap={3}>
      {items.map((item) => {
        const presentation = getStaffNotificationHistoryPresentation(item);
        return (
          <Box key={item._id} as="article" borderWidth="1px" borderColor="blackAlpha.100" borderRadius="lg" p={4}>
            <Stack gap={3}>
              <Flex align="flex-start" justify="space-between" gap={3}>
                <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums">
                  {presentation.dateTimeLabel}
                </Text>
                <HStack gap={2} flexShrink={0}>
                  <ChannelBadge label={presentation.channelLabel} />
                  <StatusBadge label={presentation.statusLabel} tone={presentation.statusTone} />
                </HStack>
              </Flex>
              <Text fontSize="sm" color="gray.900" fontWeight="semibold" lineClamp={2}>
                {item.displayTitle}
              </Text>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

function ChannelBadge({ label }: { label: string }) {
  return (
    <Badge colorPalette="gray" variant="subtle" borderRadius="full" px={2.5} py={1} whiteSpace="nowrap">
      {label}
    </Badge>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: StaffNotificationHistoryStatusTone }) {
  return (
    <Badge colorPalette={STATUS_PALETTE[tone]} variant="subtle" borderRadius="full" px={2.5} py={1} whiteSpace="nowrap">
      {label}
    </Badge>
  );
}

function StaffNotificationHistorySkeleton() {
  return (
    <>
      <Box
        display={{ base: "none", md: "block" }}
        borderWidth="1px"
        borderColor="blackAlpha.100"
        borderRadius="lg"
        overflow="hidden"
        aria-label="通知履歴を読み込み中"
      >
        <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
          {Array.from({ length: 3 }).map((_, index) => (
            <HStack key={index} gap={6} px={4} py={3.5}>
              <Skeleton h="16px" w="132px" />
              <Skeleton h="16px" w="48px" />
              <Skeleton h="16px" flex={1} />
              <Skeleton h="24px" w="88px" borderRadius="full" />
            </HStack>
          ))}
        </Stack>
      </Box>
      <Stack display={{ base: "flex", md: "none" }} gap={3} aria-label="通知履歴を読み込み中">
        {Array.from({ length: 3 }).map((_, index) => (
          <Box key={index} borderWidth="1px" borderColor="blackAlpha.100" borderRadius="lg" p={4}>
            <Stack gap={3}>
              <Flex justify="space-between" gap={3}>
                <Skeleton h="14px" w="112px" />
                <HStack gap={2}>
                  <Skeleton h="24px" w="56px" borderRadius="full" />
                  <Skeleton h="24px" w="80px" borderRadius="full" />
                </HStack>
              </Flex>
              <Skeleton h="20px" w="80%" />
            </Stack>
          </Box>
        ))}
      </Stack>
    </>
  );
}

export type { StaffNotificationHistoryItem } from "./script";
