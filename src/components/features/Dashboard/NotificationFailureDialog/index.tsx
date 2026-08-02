import { Badge, Box, Flex, HStack, Popover, Stack, Table, Text } from "@chakra-ui/react";
import { LuCheck, LuCircleX, LuInfo, LuRefreshCw } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, IconButton } from "@/src/components/ui/Button";
import { formatDateTime } from "@/src/domains/shift/date";

export type DashboardNotificationFailure = {
  _id: Id<"notificationFailureInbox">;
  staffName: string;
  notificationKind: "recruitment" | "reminder" | "confirmation" | "lineInvite" | "other";
  notificationKindLabel: string;
  periodLabel: string | null;
  channel?: "email" | "line";
  lastFailedAt: number;
  canRetry: boolean;
};

type Props = {
  failures: DashboardNotificationFailure[];
  isReadOnly?: boolean;
  acceptedFailureIds: ReadonlySet<Id<"notificationFailureInbox">>;
  resendingFailureIds: ReadonlySet<Id<"notificationFailureInbox">>;
  isResendingAll: boolean;
  onResend: (failureId: Id<"notificationFailureInbox">) => void;
  onResendAll: () => void;
  onDismiss: (failure: DashboardNotificationFailure) => void;
};

const EMAIL_FAILURE_HELP_LINES = [
  "スタッフ詳細で、登録メールアドレスに誤りがないか確認してください。\n誤りがない場合は、時間をおいて再送してください。",
  "メールを利用できない場合は、スタッフ詳細で対象店舗を開き、LINE連携リンクを案内できます。",
];

export const NotificationFailureDialogContent = ({
  failures,
  isReadOnly = false,
  acceptedFailureIds,
  resendingFailureIds,
  isResendingAll,
  onResend,
  onResendAll,
  onDismiss,
}: Props) => {
  const hasPendingRetryable = failures.some(
    (failure) => !isReadOnly && failure.canRetry && !acceptedFailureIds.has(failure._id),
  );

  if (failures.length === 0) {
    return (
      <Box borderWidth="1px" borderColor="gray.200" borderRadius="lg" px={4} py={6} textAlign="center">
        <Text fontWeight="semibold" color="gray.800">
          送れなかった通知はありません
        </Text>
        <Text mt={1} fontSize="sm" color="fg.muted">
          再送が必要な通知はすべて処理済みです。
        </Text>
      </Box>
    );
  }

  return (
    <Stack gap={4}>
      <Flex
        align={{ base: "stretch", md: "center" }}
        justify="space-between"
        gap={3}
        direction={{ base: "column", md: "row" }}
      >
        <Text fontSize="sm" color="fg.muted" whiteSpace="pre-line">
          {
            "送れなかった通知は再送できます。\n何度も失敗する場合は、スタッフの通知先やLINE連携状態を確認してください。\n問題が見つからない場合は、時間をおいて再送してください。"
          }
        </Text>
        <Button
          size="sm"
          colorPalette="teal"
          variant="solid"
          alignSelf={{ base: "stretch", md: "center" }}
          loading={isResendingAll}
          disabled={isResendingAll || !hasPendingRetryable}
          onClick={onResendAll}
          gap={1.5}
        >
          <LuRefreshCw />
          すべて再送
        </Button>
      </Flex>

      <Box
        display={{ base: "none", md: "block" }}
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
        overflow="hidden"
      >
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg="gray.50">
              <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="center">
                スタッフ名
              </Table.ColumnHeader>
              <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="center">
                通知種別
              </Table.ColumnHeader>
              <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="center">
                募集期間
              </Table.ColumnHeader>
              <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="center">
                チャネル
              </Table.ColumnHeader>
              <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="center">
                検知日時
              </Table.ColumnHeader>
              <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="center" w="216px">
                操作
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {failures.map((failure) => (
              <Table.Row key={failure._id}>
                <Table.Cell textAlign="center" verticalAlign="middle">
                  <Text fontWeight="semibold" color="gray.900">
                    {failure.staffName}
                  </Text>
                </Table.Cell>
                <Table.Cell textAlign="center" verticalAlign="middle">
                  <NotificationKindBadge failure={failure} />
                </Table.Cell>
                <Table.Cell color="gray.800" textAlign="center" verticalAlign="middle">
                  {failure.periodLabel ?? "-"}
                </Table.Cell>
                <Table.Cell textAlign="center" verticalAlign="middle">
                  <ChannelText channel={failure.channel} />
                </Table.Cell>
                <Table.Cell color="gray.700" textAlign="center" verticalAlign="middle">
                  {formatDateTime(new Date(failure.lastFailedAt))}
                </Table.Cell>
                <Table.Cell textAlign="center" verticalAlign="middle" w="216px">
                  <FailureActionButtons
                    failure={failure}
                    isReadOnly={isReadOnly}
                    isAccepted={acceptedFailureIds.has(failure._id)}
                    isLoading={isResendingAll || resendingFailureIds.has(failure._id)}
                    onResend={onResend}
                    onDismiss={onDismiss}
                  />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      <Stack display={{ base: "flex", md: "none" }} gap={3}>
        {failures.map((failure) => (
          <Box key={failure._id} borderWidth="1px" borderColor="gray.200" borderRadius="lg" p={4} bg="white">
            <Stack gap={3}>
              <Flex align="flex-start" justify="space-between" gap={3}>
                <Text fontSize="md" fontWeight="bold" color="gray.900" lineHeight="short" minW={0} truncate>
                  {failure.staffName}
                </Text>
                <ChannelText channel={failure.channel} />
              </Flex>

              {failure.periodLabel && (
                <Text fontSize="sm" color="gray.700" lineHeight="short">
                  {failure.periodLabel}
                </Text>
              )}

              <HStack gap={2} wrap="wrap">
                <NotificationKindBadge failure={failure} />
                <ErrorDateBadge lastFailedAt={failure.lastFailedAt} />
              </HStack>

              <Flex>
                <FailureActionButtons
                  failure={failure}
                  isReadOnly={isReadOnly}
                  isAccepted={acceptedFailureIds.has(failure._id)}
                  isLoading={isResendingAll || resendingFailureIds.has(failure._id)}
                  onResend={onResend}
                  onDismiss={onDismiss}
                  fullWidth
                />
              </Flex>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
};

const NotificationKindBadge = ({ failure }: { failure: DashboardNotificationFailure }) => (
  <Badge colorPalette={kindPalette(failure.notificationKind)} variant="subtle" borderRadius="full" px={2.5} py={1}>
    {failure.notificationKindLabel}
  </Badge>
);

const ChannelText = ({ channel }: { channel?: "email" | "line" }) => {
  if (channel === "line") {
    return (
      <Text color="gray.800" fontSize="sm" fontWeight="medium" flexShrink={0}>
        LINE
      </Text>
    );
  }

  return (
    <HStack gap={1} justify="center" flexShrink={0}>
      <Text color="gray.800" fontSize="sm" fontWeight="medium">
        メール
      </Text>
      <Popover.Root positioning={{ placement: "top" }} lazyMount unmountOnExit>
        <Popover.Trigger asChild>
          <IconButton
            aria-label="メール通知について"
            variant="ghost"
            size="xs"
            minW="6"
            h="6"
            color="fg.muted"
            borderRadius="full"
          >
            <LuInfo />
          </IconButton>
        </Popover.Trigger>
        <Popover.Positioner>
          <Popover.Content w="min(320px, calc(100vw - 32px))" p={3} boxShadow="lg">
            <Popover.Arrow>
              <Popover.ArrowTip />
            </Popover.Arrow>
            <Text fontSize="sm" color="gray.800" lineHeight="1.7" whiteSpace="pre-line">
              {EMAIL_FAILURE_HELP_LINES[0]}
              <br />
              {EMAIL_FAILURE_HELP_LINES[1]}
            </Text>
          </Popover.Content>
        </Popover.Positioner>
      </Popover.Root>
    </HStack>
  );
};

const ErrorDateBadge = ({ lastFailedAt }: { lastFailedAt: number }) => (
  <Badge colorPalette="gray" variant="subtle" borderRadius="full" px={2.5} py={1}>
    エラー日時：{formatDateTime(new Date(lastFailedAt))}
  </Badge>
);

const FailureActionButtons = ({
  failure,
  isReadOnly,
  isAccepted,
  isLoading,
  onResend,
  onDismiss,
  fullWidth = false,
}: {
  failure: DashboardNotificationFailure;
  isReadOnly: boolean;
  isAccepted: boolean;
  isLoading: boolean;
  onResend: (failureId: Id<"notificationFailureInbox">) => void;
  onDismiss: (failure: DashboardNotificationFailure) => void;
  fullWidth?: boolean;
}) => {
  if (isAccepted) {
    return (
      <ResendButton
        failure={failure}
        isReadOnly={isReadOnly}
        isAccepted
        isLoading={isLoading}
        onResend={onResend}
        fullWidth={fullWidth}
      />
    );
  }

  return (
    <HStack gap={2} flexShrink={0} justify="center" w={fullWidth ? "100%" : undefined}>
      <ResendButton
        failure={failure}
        isReadOnly={isReadOnly}
        isAccepted={false}
        isLoading={isLoading}
        onResend={onResend}
        fullWidth={fullWidth}
      />
      <Button
        size="sm"
        variant="solid"
        colorPalette="red"
        disabled={isReadOnly || isLoading}
        onClick={() => onDismiss(failure)}
        flex={fullWidth ? 1 : undefined}
        gap={1.5}
      >
        <LuCircleX />
        無視する
      </Button>
    </HStack>
  );
};

const ResendButton = ({
  failure,
  isReadOnly,
  isAccepted,
  isLoading,
  onResend,
  fullWidth = false,
}: {
  failure: DashboardNotificationFailure;
  isReadOnly: boolean;
  isAccepted: boolean;
  isLoading: boolean;
  onResend: (failureId: Id<"notificationFailureInbox">) => void;
  fullWidth?: boolean;
}) => {
  if (isAccepted) {
    return (
      <Button size="sm" variant="outline" colorPalette="gray" disabled gap={1.5} flex={fullWidth ? 1 : undefined}>
        <LuCheck />
        再送済み
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      colorPalette="teal"
      loading={isLoading}
      disabled={isReadOnly || isLoading || !failure.canRetry}
      onClick={() => onResend(failure._id)}
      flex={fullWidth ? 1 : undefined}
      gap={1.5}
    >
      <LuRefreshCw />
      {failure.canRetry ? "再送" : "再送できません"}
    </Button>
  );
};

function kindPalette(kind: DashboardNotificationFailure["notificationKind"]) {
  switch (kind) {
    case "recruitment":
      return "teal";
    case "reminder":
      return "orange";
    case "confirmation":
      return "blue";
    case "lineInvite":
      return "green";
    case "other":
      return "gray";
  }
}
