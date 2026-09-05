import { Box, Flex, Grid, Separator, Stack, Text } from "@chakra-ui/react";

import type { RecruitmentComparisonRow } from "./types";

type Props = {
  shopName?: string;
  periodLabel: string;
  holidaySummary: {
    value: string;
    detail?: string;
  };
  deadlineLabel: string;
  isEditing?: boolean;
  comparison?: RecruitmentComparisonRow[];
  reminderDescription: string;
};

const SummaryLine = ({ label, value, detail }: { label: string; value: string; detail?: string }) => (
  <Flex gap={3} minH={{ base: "64px", md: "72px" }} py={3} justify="flex-start" align="center">
    <Text w="50%" fontSize="sm" color="fg.muted">
      {label}
    </Text>
    <Stack w="50%" gap={0.5} align="stretch" justify="center">
      <Text fontSize="sm" fontWeight="semibold" color="gray.900" textAlign="left">
        {value}
      </Text>
      {detail && (
        <Text fontSize="xs" color="fg.muted" lineHeight={1.6} whiteSpace="pre-line">
          {detail}
        </Text>
      )}
    </Stack>
  </Flex>
);

const ComparisonLine = ({ label, before, after, changed }: RecruitmentComparisonRow) => (
  <Box as="dl" m={0} py={4}>
    <Flex as="dt" gap={2} align="center">
      <Text as="span" fontSize="sm" color="fg.muted">
        {label}
      </Text>
      {!changed && (
        <Text as="span" px={2} py={0.5} rounded="sm" bg="gray.100" fontSize="xs" color="fg.muted">
          変更なし
        </Text>
      )}
    </Flex>
    <Box as="dd" m={0} mt={2}>
      {changed ? (
        <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={3}>
          {[
            { label: "変更前", value: before, highlight: false },
            { label: "変更後", value: after, highlight: true },
          ].map((item) => (
            <Box as="dl" key={item.label} m={0} p={3} rounded="md" bg={item.highlight ? "teal.50" : undefined}>
              <Text as="dt" mb={1} fontSize="xs" color="fg.muted">
                {item.label}
              </Text>
              <Text
                as="dd"
                m={0}
                fontSize="sm"
                fontWeight="semibold"
                color="gray.900"
                whiteSpace="pre-line"
                overflowWrap="anywhere"
              >
                {item.value}
              </Text>
            </Box>
          ))}
        </Grid>
      ) : (
        <Text p={3} fontSize="sm" fontWeight="semibold" color="gray.900" whiteSpace="pre-line" overflowWrap="anywhere">
          {after}
        </Text>
      )}
    </Box>
  </Box>
);

export const RecruitmentConfirmation = ({
  shopName,
  periodLabel,
  holidaySummary,
  deadlineLabel,
  isEditing = false,
  comparison,
  reminderDescription,
}: Props) => {
  const hasNoChanges = isEditing && comparison !== undefined && !comparison.some((row) => row.changed);

  return (
    <Box px={{ base: 0, md: 8 }}>
      <Stack gap={0}>
        {shopName && (
          <>
            <SummaryLine label="対象店舗" value={shopName} />
            <Separator />
          </>
        )}
        {isEditing && comparison ? (
          comparison.map((row) => (
            <Box key={row.label}>
              <ComparisonLine {...row} />
              <Separator />
            </Box>
          ))
        ) : (
          <>
            <SummaryLine label="シフト期間" value={periodLabel} />
            <Separator />
            <SummaryLine label="定休日" value={holidaySummary.value} detail={holidaySummary.detail} />
            <Separator />
            <SummaryLine label="提出期限" value={deadlineLabel} />
            <Separator />
          </>
        )}
        <SummaryLine
          label={isEditing ? "スタッフへの通知" : "通知方法"}
          value={
            hasNoChanges
              ? "変更がないため、通知は送りません。"
              : isEditing
                ? "対象スタッフ全員に変更を通知します"
                : "メール・LINEで通知します"
          }
          detail={hasNoChanges ? "現在の自動催促の予定は変わりません。" : reminderDescription}
        />
      </Stack>
    </Box>
  );
};
