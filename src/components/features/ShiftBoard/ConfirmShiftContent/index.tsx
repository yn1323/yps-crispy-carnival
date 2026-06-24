import { Box, Flex, Icon, Stack, Text } from "@chakra-ui/react";
import type { IconType } from "react-icons/lib";
import { LuCalendarX, LuClock, LuTriangleAlert, LuUserX } from "react-icons/lu";
import type { DisplayIssue } from "@/src/domains/shift/assignmentIssues";
import {
  ASSIGNMENT_WARNING_SUMMARY_TITLE,
  summarizeAssignmentWarnings,
  type WarningSummaryCategoryCode,
} from "@/src/domains/shift/assignmentWarningSummary";

type Props = {
  staffCount: number;
  periodLabel: string;
  warnings?: DisplayIssue[];
  isResend?: boolean;
};

export const ConfirmShiftContent = ({ staffCount, periodLabel, warnings = [], isResend = false }: Props) => {
  const warningSummary = summarizeAssignmentWarnings(warnings);

  return (
    <>
      <Text fontSize="sm" lineHeight="tall" mb={4}>
        {"LINE連携済みのスタッフにはLINE、それ以外にはメールで届きます。"}
      </Text>
      <Box bg="gray.50" borderRadius="md" p={4}>
        <Text fontSize="sm">対象: {isResend ? "前回通知から変更があるスタッフ" : `${staffCount}名`}</Text>
        <Text fontSize="sm">期間: {periodLabel}</Text>
      </Box>
      {warningSummary.length > 0 && (
        <Box mt={5}>
          <Flex align="center" gap={3} color="orange.800" mb={3}>
            <Icon boxSize={5} flexShrink={0}>
              <LuTriangleAlert />
            </Icon>
            <Text fontSize="sm" fontWeight={800}>
              {ASSIGNMENT_WARNING_SUMMARY_TITLE}
            </Text>
          </Flex>
          <Stack gap={0}>
            {warningSummary.map((item) => (
              <WarningSummaryRow key={item.code} code={item.code} label={item.label} count={item.count} />
            ))}
          </Stack>
          <Text mt={4} textAlign="center" fontSize="sm" fontWeight={700} color="gray.700">
            この内容のまま{isResend ? "スタッフに通知しますか？" : "確定して、スタッフに通知しますか？"}
          </Text>
        </Box>
      )}
    </>
  );
};

type WarningSummaryStyle = {
  icon: IconType;
  iconBg: string;
  iconColor: string;
  pillBg: string;
  pillColor: string;
};

const WARNING_SUMMARY_STYLES: Record<WarningSummaryCategoryCode, WarningSummaryStyle> = {
  OFF_REQUEST: {
    icon: LuCalendarX,
    iconBg: "red.100",
    iconColor: "red.600",
    pillBg: "red.100",
    pillColor: "red.600",
  },
  OUTSIDE_REQUESTED_TIME: {
    icon: LuClock,
    iconBg: "orange.100",
    iconColor: "orange.600",
    pillBg: "orange.100",
    pillColor: "orange.600",
  },
  NOT_SUBMITTED: {
    icon: LuUserX,
    iconBg: "purple.100",
    iconColor: "purple.600",
    pillBg: "purple.100",
    pillColor: "purple.600",
  },
  OTHER: {
    icon: LuTriangleAlert,
    iconBg: "orange.100",
    iconColor: "orange.600",
    pillBg: "orange.100",
    pillColor: "orange.600",
  },
};

const WarningSummaryRow = ({
  code,
  label,
  count,
}: {
  code: WarningSummaryCategoryCode;
  label: string;
  count: number;
}) => {
  const style = WARNING_SUMMARY_STYLES[code];
  const RowIcon = style.icon;
  return (
    <Flex align="center" gap={3} py={3} borderBottomWidth="1px" borderColor="gray.200" _last={{ borderBottomWidth: 0 }}>
      <Flex
        align="center"
        justify="center"
        flexShrink={0}
        boxSize="30px"
        borderRadius="full"
        bg={style.iconBg}
        color={style.iconColor}
      >
        <Icon boxSize={4}>
          <RowIcon />
        </Icon>
      </Flex>
      <Text flex={1} minW={0} fontSize="sm" fontWeight={600} color="gray.800">
        {label}
      </Text>
      <Flex
        minW="44px"
        h="26px"
        px={3}
        align="center"
        justify="center"
        borderRadius="full"
        bg={style.pillBg}
        color={style.pillColor}
        fontSize="sm"
        fontWeight={800}
        lineHeight={1}
        fontVariantNumeric="tabular-nums"
      >
        {count}件
      </Flex>
    </Flex>
  );
};
