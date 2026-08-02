import { Badge, Box, Flex, HStack, Skeleton, Stack, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import type { ReactNode } from "react";
import { LuBell, LuCalendarCheck, LuCalendarClock, LuSend } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { formatDateShort } from "@/src/domains/shift/date";
import type { UserShopDetailData, UserShopDetailMembership, UserShopDetailRecruitment } from "./types";

type NotificationAction = {
  isDisabled: boolean;
  isLoading: boolean;
  onAction: () => void | Promise<void>;
};

type Props = {
  data: UserShopDetailData;
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
          <Text as="h2" fontSize="md" fontWeight="semibold" color="gray.900">
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
                  スタッフ情報にメールアドレスを登録するか、「LINE連携」からこの店舗向けのLINE連携を設定してください。
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
                actionLabel="募集中のシフトを再送する"
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
                actionLabel="確定シフトを再送する"
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
  recruitments: UserShopDetailRecruitment[];
  emptyText: string;
  actionLabel: string;
  action: NotificationAction;
}) {
  return (
    <Stack gap={3}>
      <Flex align={{ base: "flex-start", sm: "center" }} gap={3} justify="space-between">
        <HStack gap={2} color="gray.900" minW={0}>
          {icon}
          <Text as="h3" fontSize="sm" fontWeight="semibold">
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
  const isActionRequired = recruitment.status === "open" && recruitment.deadline < today;
  const isCurrent =
    recruitment.status === "confirmed" && recruitment.periodStart <= today && today <= recruitment.periodEnd;
  const colorPalette = isActionRequired ? "orange" : recruitment.status === "open" ? "green" : "blue";
  const accent = isActionRequired ? "orange.400" : recruitment.status === "open" ? "green.400" : "blue.400";
  const borderColor = isActionRequired ? "orange.200" : isCurrent ? "blue.200" : "blackAlpha.50";
  const bg = isActionRequired ? "orange.50/30" : isCurrent ? "blue.50/30" : "white";
  const deadlineLabel = getRecruitmentMetaLabel(recruitment, today);

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
              {isActionRequired ? "要シフト調整" : recruitment.status === "open" ? "募集中" : "確定済み"}
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

function getRecruitmentMetaLabel(recruitment: UserShopDetailRecruitment, today: string) {
  if (recruitment.status === "confirmed") {
    return recruitment.confirmedAt
      ? `確定 ${formatDateShort(dayjs(recruitment.confirmedAt).format("YYYY-MM-DD"))}`
      : "確定済み";
  }
  if (recruitment.deadline < today) return `${formatDateShort(recruitment.deadline)} 締切済み`;

  const days = dayjs(recruitment.deadline).startOf("day").diff(dayjs().startOf("day"), "day");
  return days === 0 ? "今日が締切！" : `締切まで${days}日`;
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
