import { Badge, Box, Flex, HStack, Skeleton, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuBell, LuCalendarCheck, LuSend } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { formatDateShort } from "@/src/domains/shift/date";
import type { UserDetailData, UserDetailMembership, UserDetailRecruitment } from "./types";

type NotificationAction = {
  isDisabled: boolean;
  isLoading: boolean;
  onAction: () => void | Promise<void>;
};

type Props = {
  data: UserDetailData;
  membership: UserDetailMembership;
  isReadOnly: boolean;
  isLoading: boolean;
  openRecruitments: UserDetailRecruitment[];
  currentRecruitments: UserDetailRecruitment[];
  notificationHistory: ReactNode;
  sendRecruitmentsAction: NotificationAction;
  sendCurrentShiftAction: NotificationAction;
};

export function UserNotificationTab({
  data,
  membership,
  isReadOnly,
  isLoading,
  openRecruitments,
  currentRecruitments,
  notificationHistory,
  sendRecruitmentsAction,
  sendCurrentShiftAction,
}: Props) {
  const isLineActive = membership.line.isLinked && membership.line.isFollowing;
  const hasNotificationChannel = data.person.email.length > 0 || isLineActive;
  const canSendNotification = !isReadOnly && !membership.excludedFromShift && hasNotificationChannel;

  return (
    <Stack gap={10}>
      <fieldset disabled={isReadOnly} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
        <Stack gap={6}>
          <Text as="h3" fontSize="md" fontWeight="semibold" color="gray.900">
            通知
          </Text>

          {membership.excludedFromShift && (
            <Box borderWidth="1px" borderColor="blackAlpha.100" bg="blackAlpha.50" borderRadius="md" p={3}>
              <Stack gap={1}>
                <Text fontWeight="semibold">この店舗ではシフト対象外です</Text>
                <Text fontSize="sm" color="fg.muted">
                  シフト表、提出依頼、確定シフト通知の対象から外れています。
                </Text>
              </Stack>
            </Box>
          )}

          {!membership.excludedFromShift && !hasNotificationChannel && (
            <Box borderWidth="1px" borderColor="orange.200" bg="orange.50" borderRadius="md" p={3}>
              <Stack gap={1}>
                <Text fontWeight="semibold">通知手段がありません</Text>
                <Text fontSize="sm" color="fg.muted" lineHeight="tall">
                  基本情報でメールアドレスを登録するか、LINE連携からこの店舗のLINEを連携してください。
                </Text>
              </Stack>
            </Box>
          )}

          {isLoading ? (
            <NotificationSkeleton />
          ) : (
            <>
              <NotificationSection
                title="現在の募集中シフト"
                icon={<LuSend aria-hidden />}
                recruitments={openRecruitments}
                emptyText="送信できる募集中シフトはありません。"
                actionLabel="募集中のシフトを送る"
                action={{
                  ...sendRecruitmentsAction,
                  isDisabled:
                    sendRecruitmentsAction.isDisabled || !canSendNotification || openRecruitments.length === 0,
                }}
              />
              <NotificationSection
                title="確定シフト"
                icon={<LuCalendarCheck aria-hidden />}
                recruitments={currentRecruitments}
                emptyText="送信できる確定シフトはありません。"
                actionLabel="確定シフトを送る"
                action={{
                  ...sendCurrentShiftAction,
                  isDisabled:
                    sendCurrentShiftAction.isDisabled || !canSendNotification || currentRecruitments.length === 0,
                }}
              />
            </>
          )}
        </Stack>
      </fieldset>

      {notificationHistory}
    </Stack>
  );
}

function NotificationSection({
  title,
  icon,
  recruitments,
  emptyText,
  actionLabel,
  action,
}: {
  title: string;
  icon: ReactNode;
  recruitments: UserDetailRecruitment[];
  emptyText: string;
  actionLabel: string;
  action: NotificationAction;
}) {
  return (
    <Stack gap={3}>
      <Flex align={{ base: "flex-start", sm: "center" }} gap={3} justify="space-between">
        <HStack gap={2} color="gray.900" minW={0}>
          {icon}
          <Text as="h4" fontSize="sm" fontWeight="semibold">
            {title}
          </Text>
        </HStack>
        <Button
          colorPalette="teal"
          flexShrink={0}
          gap={1.5}
          disabled={action.isDisabled || action.isLoading}
          loading={action.isLoading}
          onClick={action.onAction}
          size="sm"
        >
          <LuBell aria-hidden />
          {actionLabel}
        </Button>
      </Flex>
      {recruitments.length > 0 ? (
        <Stack gap={2}>
          {recruitments.map((recruitment) => (
            <Flex
              key={recruitment._id}
              align={{ base: "flex-start", sm: "center" }}
              justify="space-between"
              gap={3}
              borderWidth="1px"
              borderColor="blackAlpha.100"
              borderRadius="lg"
              px={4}
              py={3}
            >
              <Text fontSize="sm" fontWeight="semibold" color="gray.900">
                {formatDateShort(recruitment.periodStart)} 〜 {formatDateShort(recruitment.periodEnd)}
              </Text>
              <Badge colorPalette={recruitment.status === "open" ? "green" : "blue"} variant="subtle">
                {recruitment.status === "open" ? "募集中" : "確定済み"}
              </Badge>
            </Flex>
          ))}
        </Stack>
      ) : (
        <Text fontSize="sm" color="fg.muted">
          {emptyText}
        </Text>
      )}
    </Stack>
  );
}

function NotificationSkeleton() {
  return (
    <Stack gap={5} aria-label="通知情報を読み込み中">
      {Array.from({ length: 2 }).map((_, sectionIndex) => (
        <Stack key={sectionIndex} gap={3}>
          <Flex justify="space-between" gap={4}>
            <Skeleton h="20px" w="160px" />
            <Skeleton h="32px" w="176px" borderRadius="md" />
          </Flex>
          <Skeleton h="56px" w="full" borderRadius="lg" />
        </Stack>
      ))}
    </Stack>
  );
}
