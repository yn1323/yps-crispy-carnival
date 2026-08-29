import { Badge, Box, Flex, HStack, Skeleton, Stack, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import type { ReactNode } from "react";
import { LuBell, LuCalendarCheck, LuCalendarClock, LuSend } from "react-icons/lu";
import { NotificationResendCooldownNotice } from "@/src/components/shared/NotificationResendCooldownNotice";
import { Button } from "@/src/components/ui/Button";
import { formatDateShort } from "@/src/domains/shift/date";
import { getRecruitmentDeadlineDays, getRecruitmentLifecycleStatus } from "@/src/domains/shift/recruitmentLifecycle";
import type { UserShopDetailMembership, UserShopDetailRecruitment } from "./types";

type NotificationAction = {
  isDisabled: boolean;
  isCooldownActive: boolean;
  isLoading: boolean;
  onAction: () => void | Promise<void>;
};

type Props = {
  membership: UserShopDetailMembership;
  isReadOnly: boolean;
  isLoading: boolean;
  openRecruitments: UserShopDetailRecruitment[];
  currentRecruitments: UserShopDetailRecruitment[];
  notificationHistory: ReactNode;
  sendRecruitmentsAction: NotificationAction;
  sendCurrentShiftAction: NotificationAction;
};

export function UserShopNotificationSection({
  membership,
  isReadOnly,
  isLoading,
  openRecruitments,
  currentRecruitments,
  notificationHistory,
  sendRecruitmentsAction,
  sendCurrentShiftAction,
}: Props) {
  const canSendNotification = !isReadOnly && !membership.excludedFromShift;

  return (
    <Stack gap={10}>
      <fieldset disabled={isReadOnly} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
        <Stack gap={6}>
          <Text as="h2" fontSize="md" fontWeight="semibold" color="gray.900">
            通知
          </Text>

          {membership.excludedFromShift && (
            <Box borderWidth="1px" borderColor="blackAlpha.100" bg="blackAlpha.50" borderRadius="md" p={3}>
              <Stack gap={1}>
                <Text fontWeight="semibold">シフト募集、確定を通知しません</Text>
                <Text fontSize="xs" color="fg.muted">
                  シフト表表示、提出依頼、確定シフト通知の対象から外れています。
                  <br />
                </Text>
              </Stack>
            </Box>
          )}

          {isLoading ? (
            <UserShopNotificationSkeleton />
          ) : (
            <>
              <NotificationSection
                title="募集中シフト"
                icon={<LuSend aria-hidden />}
                recruitments={openRecruitments}
                emptyText="送信できる募集中シフトはありません。"
                actionLabel="再送する"
                action={{
                  ...sendRecruitmentsAction,
                  isDisabled:
                    sendRecruitmentsAction.isDisabled ||
                    sendRecruitmentsAction.isCooldownActive ||
                    !canSendNotification ||
                    openRecruitments.length === 0,
                }}
                showCooldownNotice={
                  sendRecruitmentsAction.isCooldownActive &&
                  !sendRecruitmentsAction.isDisabled &&
                  canSendNotification &&
                  openRecruitments.length > 0
                }
              />
              <NotificationSection
                title="確定シフト"
                icon={<LuCalendarCheck aria-hidden />}
                recruitments={currentRecruitments}
                emptyText="送信できる確定シフトはありません。"
                actionLabel="再送する"
                action={{
                  ...sendCurrentShiftAction,
                  isDisabled:
                    sendCurrentShiftAction.isDisabled ||
                    sendCurrentShiftAction.isCooldownActive ||
                    !canSendNotification ||
                    currentRecruitments.length === 0,
                }}
                showCooldownNotice={
                  sendCurrentShiftAction.isCooldownActive &&
                  !sendCurrentShiftAction.isDisabled &&
                  canSendNotification &&
                  currentRecruitments.length > 0
                }
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
  showCooldownNotice,
}: {
  title: string;
  icon: ReactNode;
  recruitments: UserShopDetailRecruitment[];
  emptyText: string;
  actionLabel: string;
  action: NotificationAction;
  showCooldownNotice: boolean;
}) {
  return (
    <Stack gap={3}>
      <Flex
        align={{ base: "flex-start", sm: "center" }}
        direction={{ base: "column", sm: "row" }}
        gap={3}
        justify="space-between"
      >
        <HStack gap={2} color="gray.900" minW={0}>
          {icon}
          <Text as="h3" fontSize="sm" fontWeight="semibold">
            {title}
          </Text>
        </HStack>
        <Stack align={{ base: "flex-start", sm: "flex-end" }} gap={1.5}>
          <Button
            colorPalette="teal"
            flexShrink={0}
            gap={1.5}
            disabled={action.isDisabled || action.isLoading}
            loading={action.isLoading}
            onClick={action.onAction}
            size="sm"
            variant="outline"
          >
            <LuBell aria-hidden />
            {actionLabel}
          </Button>
          {showCooldownNotice && <NotificationResendCooldownNotice />}
        </Stack>
      </Flex>
      {recruitments.length > 0 ? (
        <Stack gap={2}>
          {recruitments.map((recruitment) => (
            <RecruitmentNotificationCard key={recruitment._id} recruitment={recruitment} />
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

function RecruitmentNotificationCard({ recruitment }: { recruitment: UserShopDetailRecruitment }) {
  const today = dayjs().format("YYYY-MM-DD");
  const lifecycleStatus = getRecruitmentLifecycleStatus(recruitment, today);
  const isActionRequired = lifecycleStatus === "action-required" || lifecycleStatus === "ended-unconfirmed";
  const isCollecting = lifecycleStatus === "collecting";
  const isCurrent = lifecycleStatus === "current";
  const colorPalette = isActionRequired ? "orange" : isCollecting ? "green" : "blue";
  const accent = isActionRequired ? "orange.400" : isCollecting ? "green.400" : "blue.400";
  const borderColor = isActionRequired ? "orange.200" : isCurrent ? "blue.200" : "blackAlpha.50";
  const bg = isActionRequired ? "orange.50/30" : isCurrent ? "blue.50/30" : "white";
  const deadlineLabel = getRecruitmentMetaLabel(recruitment, today, lifecycleStatus);

  return (
    <Flex
      align="stretch"
      bg={bg}
      borderRadius="xl"
      overflow="hidden"
      borderWidth="1px"
      borderColor={borderColor}
      boxShadow="xs"
      textAlign="left"
      w="full"
    >
      <Box w="4px" bg={accent} flexShrink={0} />
      <Flex
        flex={1}
        minW={0}
        px={{ base: 3.5, lg: 4 }}
        py={{ base: 2.5, lg: 3 }}
        direction={{ base: "column", lg: "row" }}
        align={{ base: "stretch", lg: "center" }}
        gap={{ base: 1.5, lg: 4 }}
      >
        <Text fontSize="md" fontWeight="semibold" color="gray.900" lineHeight="short" whiteSpace="nowrap">
          {formatDateShort(recruitment.periodStart)} 〜 {formatDateShort(recruitment.periodEnd)}
        </Text>

        <Flex
          flex={1}
          minW={0}
          direction="row"
          align="center"
          justify={{ base: "space-between", md: "flex-end" }}
          gap={{ base: 2, md: 4 }}
          wrap={{ base: "wrap", sm: "nowrap" }}
        >
          <HStack gap={2} flexShrink={0} wrap="wrap">
            <Badge colorPalette={colorPalette} variant="subtle" borderRadius="full" px={2.5} fontSize="xs">
              {isActionRequired ? "要シフト調整" : isCollecting ? "募集中" : "確定済み"}
            </Badge>
            {isCurrent && (
              <Badge colorPalette="blue" variant="solid" borderRadius="full" px={2.5} fontSize="xs">
                現在利用中
              </Badge>
            )}
          </HStack>

          <HStack
            gap={{ base: 3, lg: 8 }}
            flex={1}
            justify="flex-end"
            align="center"
            color="fg.muted"
            fontSize="xs"
            minW={0}
            wrap="nowrap"
          >
            <HStack gap={1} color={isActionRequired ? "orange.700" : undefined} minW={0}>
              <LuCalendarClock aria-hidden />
              <Text whiteSpace="nowrap" fontWeight={isActionRequired ? "semibold" : "normal"}>
                {deadlineLabel}
              </Text>
            </HStack>
            <Text whiteSpace="nowrap" flexShrink={0}>
              提出 {recruitment.responseCount}/{recruitment.totalStaffCount}人
            </Text>
          </HStack>
        </Flex>
      </Flex>
    </Flex>
  );
}

function getRecruitmentMetaLabel(
  recruitment: UserShopDetailRecruitment,
  today: string,
  lifecycleStatus: ReturnType<typeof getRecruitmentLifecycleStatus>,
) {
  if (lifecycleStatus === "current" || lifecycleStatus === "confirmed" || lifecycleStatus === "ended") {
    return recruitment.confirmedAt
      ? `確定 ${formatDateShort(dayjs(recruitment.confirmedAt).format("YYYY-MM-DD"))}`
      : "確定済み";
  }
  if (recruitment.deadline < today) return `${formatDateShort(recruitment.deadline)} 提出期限超過`;

  const days = getRecruitmentDeadlineDays(recruitment.deadline, today);
  return days === 0 ? "今日が提出期限！" : `提出期限まで${days}日`;
}

export function UserShopNotificationSkeleton() {
  return (
    <Stack gap={5} aria-label="通知情報を読み込み中" aria-busy="true">
      {Array.from({ length: 2 }).map((_, sectionIndex) => (
        <Stack key={sectionIndex} gap={3}>
          <Flex align={{ base: "flex-start", sm: "center" }} justify="space-between" gap={3}>
            <HStack gap={2} minW={0}>
              <Skeleton boxSize={5} borderRadius="sm" flexShrink={0} />
              <Skeleton h="20px" w={sectionIndex === 0 ? "112px" : "88px"} maxW="100%" />
            </HStack>
            <Skeleton h="32px" w="104px" borderRadius="md" flexShrink={0} />
          </Flex>
          <Skeleton h={{ base: "76px", lg: "56px" }} w="full" borderRadius="lg" />
        </Stack>
      ))}
    </Stack>
  );
}
