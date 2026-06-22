import { Badge, Box, Flex, HStack, Stack, Table, Text } from "@chakra-ui/react";
import { LuCheck, LuRefreshCw } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/components/ui/Button";
import { formatDateTime } from "@/src/domains/shift/date";

export type DashboardNotificationFailure = {
  _id: Id<"notificationFailureInbox">;
  staffName: string;
  notificationKind: "recruitment" | "reminder" | "confirmation" | "other";
  notificationKindLabel: string;
  periodLabel: string | null;
  channel?: "email" | "line";
  lastFailedAt: number;
  canRetry: boolean;
};

type Props = {
  failures: DashboardNotificationFailure[];
  acceptedFailureIds: ReadonlySet<Id<"notificationFailureInbox">>;
  resendingFailureIds: ReadonlySet<Id<"notificationFailureInbox">>;
  isResendingAll: boolean;
  onResend: (failureId: Id<"notificationFailureInbox">) => void;
  onResendAll: () => void;
};

export const NotificationFailureDialogContent = ({
  failures,
  acceptedFailureIds,
  resendingFailureIds,
  isResendingAll,
  onResend,
  onResendAll,
}: Props) => {
  const hasPendingRetryable = failures.some((failure) => failure.canRetry && !acceptedFailureIds.has(failure._id));

  if (failures.length === 0) {
    return (
      <Box borderWidth="1px" borderColor="gray.200" borderRadius="lg" px={4} py={6} textAlign="center">
        <Text fontWeight="semibold" color="gray.800">
          不達通知はありません
        </Text>
        <Text mt={1} fontSize="sm" color="fg.muted">
          再通知が必要な通知はすべて処理済みです。
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
        <Text fontSize="sm" color="fg.muted">
          送信できなかった通知をスタッフごとに再通知できます。
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
          すべて再通知
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
              <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="center" w="128px">
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
                  {failure.periodLabel ?? "対象の募集なし"}
                </Table.Cell>
                <Table.Cell textAlign="center" verticalAlign="middle">
                  <ChannelText channel={failure.channel} />
                </Table.Cell>
                <Table.Cell color="gray.700" textAlign="center" verticalAlign="middle">
                  {formatDateTime(new Date(failure.lastFailedAt))}
                </Table.Cell>
                <Table.Cell textAlign="center" verticalAlign="middle" w="128px">
                  <ResendButton
                    failure={failure}
                    isAccepted={acceptedFailureIds.has(failure._id)}
                    isLoading={isResendingAll || resendingFailureIds.has(failure._id)}
                    onResend={onResend}
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

              <Text fontSize="sm" color="gray.700" lineHeight="short">
                {failure.periodLabel ?? "対象の募集なし"}
              </Text>

              <HStack gap={2} wrap="wrap">
                <NotificationKindBadge failure={failure} />
                <ErrorDateBadge lastFailedAt={failure.lastFailedAt} />
              </HStack>

              <Flex justify="flex-end">
                <ResendButton
                  failure={failure}
                  isAccepted={acceptedFailureIds.has(failure._id)}
                  isLoading={isResendingAll || resendingFailureIds.has(failure._id)}
                  onResend={onResend}
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

const ChannelText = ({ channel }: { channel?: "email" | "line" }) => (
  <Text color="gray.800" fontSize="sm" fontWeight="medium" flexShrink={0}>
    {channel === "line" ? "LINE" : "メール"}
  </Text>
);

const ErrorDateBadge = ({ lastFailedAt }: { lastFailedAt: number }) => (
  <Badge colorPalette="gray" variant="subtle" borderRadius="full" px={2.5} py={1}>
    エラー日時：{formatDateTime(new Date(lastFailedAt))}
  </Badge>
);

const ResendButton = ({
  failure,
  isAccepted,
  isLoading,
  onResend,
  fullWidth = false,
}: {
  failure: DashboardNotificationFailure;
  isAccepted: boolean;
  isLoading: boolean;
  onResend: (failureId: Id<"notificationFailureInbox">) => void;
  fullWidth?: boolean;
}) => {
  if (isAccepted) {
    return (
      <Button size="sm" variant="outline" colorPalette="gray" disabled gap={1.5} w={fullWidth ? "100%" : undefined}>
        <LuCheck />
        再通知済み
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      colorPalette="teal"
      loading={isLoading}
      disabled={isLoading || !failure.canRetry}
      onClick={() => onResend(failure._id)}
      w={fullWidth ? "100%" : undefined}
      gap={1.5}
    >
      <LuRefreshCw />
      {failure.canRetry ? "再通知" : "再通知不可"}
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
    case "other":
      return "gray";
  }
}
