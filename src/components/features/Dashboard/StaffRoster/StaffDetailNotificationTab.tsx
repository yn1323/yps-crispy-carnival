import { Box, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
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
  isShiftTarget: boolean;
  openRecruitments: Recruitment[];
  currentRecruitments: Recruitment[];
  sendRecruitmentsAction: NotificationAction;
  sendCurrentShiftAction: NotificationAction;
};

export const StaffDetailNotificationTab = ({
  isShiftTarget,
  openRecruitments,
  currentRecruitments,
  sendRecruitmentsAction,
  sendCurrentShiftAction,
}: Props) => (
  <Stack gap={8}>
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
    <Text fontSize="sm" color="fg.muted">
      シフト関連の重要な通知を再送します。
      <br />
      通常はスタッフ登録時、シフト作成・確定時に自動で送信しています。
    </Text>
    <NotificationSection
      title="現在の募集中シフト"
      icon={<LuSend />}
      recruitments={openRecruitments}
      emptyText="送信できる募集中シフトはありません。"
      actionLabel="募集中のシフトを送る"
      {...sendRecruitmentsAction}
    />
    <NotificationSection
      title="確定シフト"
      icon={<LuCalendarCheck />}
      recruitments={currentRecruitments}
      emptyText="送信できる現在の確定シフトはありません。"
      actionLabel="確定シフトを送る"
      {...sendCurrentShiftAction}
    />
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
        <Heading as="h3" fontSize="sm" fontWeight="semibold">
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
