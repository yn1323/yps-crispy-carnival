import { Alert, Box, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuBell, LuCalendarCheck, LuSend } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { RecruitmentSummaryRow } from "../RecruitmentBoard/RecruitmentSummaryRow";
import type { Recruitment } from "../types";

type NotificationAction = {
  isDisabled: boolean;
  isLoading: boolean;
  onAction: () => void | Promise<void>;
};

type Props = {
  isReadOnly: boolean;
  isShiftTarget: boolean;
  openRecruitments: Recruitment[];
  currentRecruitments: Recruitment[];
  recruitmentDataStatus?: "ready" | "loading" | "unavailable";
  notificationHistory: ReactNode;
  sendRecruitmentsAction: NotificationAction;
  sendCurrentShiftAction: NotificationAction;
};

export const StaffDetailNotificationTab = ({
  isReadOnly,
  isShiftTarget,
  openRecruitments,
  currentRecruitments,
  recruitmentDataStatus = "ready",
  notificationHistory,
  sendRecruitmentsAction,
  sendCurrentShiftAction,
}: Props) => (
  <Stack gap={10}>
    <fieldset disabled={isReadOnly} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
      <Stack gap={6}>
        <Stack gap={1}>
          <Heading as="h3" fontSize="md" fontWeight="semibold">
            通知を送る
          </Heading>
          <Text fontSize="sm" color="fg.muted">
            シフト関連の重要な通知を再送します。
            <br />
            通常は、スタッフ登録時やシフトの作成・確定時に自動で送信します。
          </Text>
        </Stack>
        {!isShiftTarget && (
          <Box borderWidth="1px" borderColor="blackAlpha.100" bg="blackAlpha.50" borderRadius="md" p={3}>
            <Stack gap={1}>
              <Text fontWeight="semibold">このスタッフはシフト対象外です</Text>
              <Text fontSize="sm" color="fg.muted">
                シフト表、提出依頼、確定シフト通知の対象から外れています。
              </Text>
            </Stack>
          </Box>
        )}
        {recruitmentDataStatus === "ready" ? (
          <>
            <NotificationSection
              title="現在の募集中シフト"
              icon={<LuSend />}
              recruitments={openRecruitments}
              emptyText="送信できる募集中シフトはありません。"
              actionLabel="募集中のシフトを再送する"
              {...sendRecruitmentsAction}
            />
            <NotificationSection
              title="確定シフト"
              icon={<LuCalendarCheck />}
              recruitments={currentRecruitments}
              emptyText="送信できる確定シフトはありません。"
              actionLabel="確定シフトを再送する"
              {...sendCurrentShiftAction}
            />
          </>
        ) : recruitmentDataStatus === "loading" ? (
          <Text fontSize="sm" color="fg.muted">
            シフト情報を読み込んでいます。
          </Text>
        ) : (
          <Alert.Root status="error" role="alert" alignItems="flex-start">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>シフト情報を読み込めませんでした</Alert.Title>
              <Alert.Description>Dashboardのシフト募集から再試行してください。</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
      </Stack>
    </fieldset>
    {notificationHistory}
  </Stack>
);

const NotificationSection = ({
  title,
  icon,
  recruitments,
  emptyText,
  actionLabel,
  isDisabled,
  isLoading,
  onAction,
}: {
  title: string;
  icon: ReactNode;
  recruitments: Recruitment[];
  emptyText: string;
  actionLabel: string;
  isDisabled: boolean;
  isLoading: boolean;
  onAction: () => void | Promise<void>;
}) => (
  <Stack gap={3}>
    <Flex align="center" gap={3} justify="space-between">
      <HStack gap={2} color="gray.900" minW={0}>
        {icon}
        <Heading as="h4" fontSize="sm" fontWeight="semibold">
          {title}
        </Heading>
      </HStack>
      <Button
        colorPalette="teal"
        flexShrink={0}
        gap={1.5}
        disabled={isDisabled || isLoading}
        loading={isLoading}
        onClick={onAction}
        size="sm"
      >
        <LuBell />
        {actionLabel}
      </Button>
    </Flex>
    {recruitments.length > 0 ? (
      <Stack gap={2}>
        {recruitments.map((recruitment) => (
          <RecruitmentSummaryRow key={recruitment._id} recruitment={recruitment} />
        ))}
      </Stack>
    ) : (
      <Text fontSize="sm" color="fg.muted">
        {emptyText}
      </Text>
    )}
  </Stack>
);
