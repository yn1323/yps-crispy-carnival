import { Box, Flex, Icon, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { IconType } from "react-icons/lib";
import { LuCalendarX, LuClock, LuFileX, LuTriangleAlert, LuUserX } from "react-icons/lu";
import {
  ASSIGNMENT_WARNING_SUMMARY_TITLE,
  getAssignmentWarningSettingText,
} from "@/src/components/shared/ShiftAssignmentWarning";
import type { DisplayIssue } from "@/src/domains/shift/assignmentIssues";
import {
  summarizeAssignmentWarnings,
  type WarningSummaryCategoryCode,
} from "@/src/domains/shift/assignmentWarningSummary";

type Props = {
  staffCount: number;
  periodLabel: string;
  warnings?: DisplayIssue[];
  /** 初回確定でだけ表示する。確定後は提出リンクが閉じているため、再通知では扱わない。 */
  unsubmittedNames?: string[];
  isResend?: boolean;
  notificationDescription?: string;
};

export const ConfirmShiftContent = ({
  staffCount,
  periodLabel,
  warnings = [],
  unsubmittedNames = [],
  isResend = false,
  notificationDescription = "メール・LINEで通知します",
}: Props) => {
  const warningSummary = summarizeAssignmentWarnings(warnings);
  const shouldShowUnsubmitted = !isResend && unsubmittedNames.length > 0;

  return (
    <>
      <Text fontSize="sm" lineHeight="tall" mb={4}>
        {notificationDescription}
      </Text>
      <Box bg="gray.50" borderRadius="md" p={4}>
        <Text fontSize="sm">対象：{isResend ? "前回通知から変更があるスタッフ" : `${staffCount}名`}</Text>
        <Text fontSize="sm">期間：{periodLabel}</Text>
      </Box>
      {shouldShowUnsubmitted && (
        <SummarySection title="未提出スタッフ">
          <SummaryRow
            icon={LuFileX}
            iconBg="orange.100"
            iconColor="orange.600"
            label="希望シフトが未提出"
            description="確定すると提出できなくなります"
            countLabel={`${unsubmittedNames.length}名`}
          >
            <UnsubmittedNameBadges names={unsubmittedNames} />
          </SummaryRow>
        </SummarySection>
      )}
      {warningSummary.length > 0 && (
        <SummarySection title={ASSIGNMENT_WARNING_SUMMARY_TITLE}>
          {warningSummary.map((item) => {
            const style = WARNING_SUMMARY_STYLES[item.code];
            return (
              <SummaryRow
                key={item.code}
                icon={style.icon}
                iconBg={style.color.bg}
                iconColor={style.color.fg}
                label={getAssignmentWarningSettingText(item.code)}
                countLabel={`${item.count}件`}
              />
            );
          })}
        </SummarySection>
      )}
      {(warningSummary.length > 0 || shouldShowUnsubmitted) && (
        <Text mt={4} textAlign="center" fontSize="sm" fontWeight={700} color="gray.700">
          この内容のまま{isResend ? "スタッフに通知しますか？" : "確定して、スタッフに通知しますか？"}
        </Text>
      )}
    </>
  );
};

const UnsubmittedNameBadges = ({ names }: { names: string[] }) => (
  <Flex mt={2} gap={1.5} wrap="wrap" align="center">
    {names.map((name, index) => (
      <Box
        // 同名のスタッフがいても重複keyにしない。
        key={`${index}-${name}`}
        px={2}
        py="2px"
        borderRadius="full"
        bg="orange.50"
        color="orange.800"
        fontSize="xs"
        fontWeight={600}
      >
        {name}
      </Box>
    ))}
  </Flex>
);

const SummarySection = ({ title, children }: { title: string; children: ReactNode }) => (
  <Box mt={5}>
    <Flex align="center" gap={3} color="orange.800" mb={3}>
      <Icon boxSize={5} flexShrink={0}>
        <LuTriangleAlert />
      </Icon>
      <Text fontSize="sm" fontWeight={800}>
        {title}
      </Text>
    </Flex>
    <Stack gap={0}>{children}</Stack>
  </Box>
);

type SummaryColor = { bg: string; fg: string };

const WARNING_SUMMARY_STYLES: Record<WarningSummaryCategoryCode, { icon: IconType; color: SummaryColor }> = {
  OFF_REQUEST: { icon: LuCalendarX, color: { bg: "red.100", fg: "red.600" } },
  OUTSIDE_REQUESTED_TIME: { icon: LuClock, color: { bg: "orange.100", fg: "orange.600" } },
  NOT_SUBMITTED: { icon: LuUserX, color: { bg: "purple.100", fg: "purple.600" } },
  OTHER: { icon: LuTriangleAlert, color: { bg: "orange.100", fg: "orange.600" } },
};

const SummaryRow = ({
  icon: RowIcon,
  iconBg,
  iconColor,
  label,
  description,
  countLabel,
  children,
}: {
  icon: IconType;
  iconBg: string;
  iconColor: string;
  label: string;
  description?: string;
  countLabel: string;
  children?: ReactNode;
}) => (
  <Flex
    // 補足や氏名が続く行は、アイコンとpillを1行目の高さにそろえる。
    align={description || children ? "flex-start" : "center"}
    gap={3}
    py={3}
    borderBottomWidth="1px"
    borderColor="gray.200"
    _last={{ borderBottomWidth: 0 }}
  >
    <Flex
      align="center"
      justify="center"
      flexShrink={0}
      boxSize="30px"
      borderRadius="full"
      bg={iconBg}
      color={iconColor}
    >
      <Icon boxSize={4}>
        <RowIcon />
      </Icon>
    </Flex>
    <Box flex={1} minW={0}>
      <Text fontSize="sm" fontWeight={600} color="gray.800">
        {label}
      </Text>
      {description && (
        <Text mt={0.5} fontSize="xs" color="gray.600">
          {description}
        </Text>
      )}
      {children}
    </Box>
    <Flex
      flexShrink={0}
      minW="44px"
      h="26px"
      px={3}
      align="center"
      justify="center"
      borderRadius="full"
      bg={iconBg}
      color={iconColor}
      fontSize="sm"
      fontWeight={800}
      lineHeight={1}
      fontVariantNumeric="tabular-nums"
    >
      {countLabel}
    </Flex>
  </Flex>
);
