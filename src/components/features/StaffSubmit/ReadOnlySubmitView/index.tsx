import { Box, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { useMemo } from "react";
import { LuInfo } from "react-icons/lu";
import { getDateRange } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import { DayCard } from "../DayCard";
import type { SubmissionData } from "../SubmitFormView";
import { SubmitPageContent, SubmitPageLayout } from "../SubmitPageLayout";
import { buildEntries, formatPeriodLabel } from "../utils/timeOptions";

type Props = {
  data: SubmissionData;
};

export const ReadOnlySubmitView = ({ data }: Props) => {
  const dates = useMemo(() => getDateRange(data.periodStart, data.periodEnd), [data.periodStart, data.periodEnd]);

  const entries = useMemo(
    () => buildEntries(dates, data.existingRequests, data.timeRange),
    [dates, data.existingRequests, data.timeRange],
  );

  return (
    <SubmitPageLayout>
      {/* Header (full-width bg) */}
      <Box bg="teal.600" w="full">
        <Box maxW="1024px" mx="auto" px={4} pt={3} pb={4}>
          <Text fontSize="xs" color="white" opacity={0.8}>
            {data.shopName}
          </Text>
          <Text fontSize="xl" fontWeight="bold" color="white">
            シフト希望を提出
          </Text>
        </Box>
      </Box>

      {/* Info Banner (full-width bg) */}
      <Box bg="blue.50" w="full">
        <Flex maxW="1024px" mx="auto" px={4} py={2.5} gap={2} align="center">
          <Icon color="blue.600" boxSize={4}>
            <LuInfo />
          </Icon>
          <Text fontSize="xs" fontWeight="medium" color="blue.800">
            提出締切を過ぎたため変更できません
          </Text>
        </Flex>
      </Box>

      {/* InfoBar (full-width bg) */}
      <Box bg="white" w="full" borderBottomWidth={1} borderColor="border.default">
        <Flex maxW="1024px" mx="auto" px={4} py={3} justify="space-between" align="center">
          <Text fontSize="sm" fontWeight="semibold">
            {formatPeriodLabel(data.periodStart, data.periodEnd)}
          </Text>
          <Box bg="green.50" px={2.5} py={1} borderRadius="full">
            <Text fontSize="xs" fontWeight="semibold" color="green.800">
              提出済み
            </Text>
          </Box>
        </Flex>
      </Box>

      {/* Card List */}
      <SubmitPageContent>
        <VStack px={4} py={3} gap={2}>
          {entries.map((entry) => (
            <DayCard
              key={entry.date}
              entry={entry}
              timeOptions={[]}
              onToggleWorking={() => {}}
              onTimeChange={() => {}}
              onClear={() => {}}
              isReadOnly
            />
          ))}
        </VStack>
      </SubmitPageContent>
    </SubmitPageLayout>
  );
};
