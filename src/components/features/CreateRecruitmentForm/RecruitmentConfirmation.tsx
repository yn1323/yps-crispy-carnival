import { Box, Flex, Separator, Stack, Text } from "@chakra-ui/react";

type Props = {
  shopName?: string;
  periodLabel: string;
  holidaySummary: {
    value: string;
    detail?: string;
  };
  deadlineLabel: string;
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

export const RecruitmentConfirmation = ({ shopName, periodLabel, holidaySummary, deadlineLabel }: Props) => (
  <Box px={{ base: 0, md: 8 }}>
    <Stack gap={0}>
      {shopName && (
        <>
          <SummaryLine label="対象店舗" value={shopName} />
          <Separator />
        </>
      )}
      <SummaryLine label="シフト期間" value={periodLabel} />
      <Separator />
      <SummaryLine label="お店のお休み" value={holidaySummary.value} detail={holidaySummary.detail} />
      <Separator />
      <SummaryLine label="提出締切" value={deadlineLabel} />
      <Separator />
      <SummaryLine label="通知" value="メール・LINEで通知します" detail="締切前日の17:00に自動催促通知を送ります。" />
    </Stack>
  </Box>
);
