import { Box, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { type ReactNode, useMemo } from "react";
import { LuInfo } from "react-icons/lu";
import { STAFF_CONTENT_MAX_W } from "@/src/components/templates/Header";
import { formatDatePeriodWithWeekday, getDateRange } from "@/src/domains/shift/date";
import { DateOnlySubmissionDayCard } from "../DateOnlySubmissionDayCard";
import { DayCard } from "../DayCard";
import { ShiftTypeSubmissionDayCard } from "../ShiftTypeSubmissionDayCard";
import { SubmitPageContent, SubmitPageHeader, SubmitPageLayout } from "../SubmitPageLayout";
import { buildInitialEntries } from "../script";
import type { DayEntry, SubmissionData } from "../types";

type Props = {
  data: SubmissionData;
  headerAction?: ReactNode;
};

export const ReadOnlySubmitView = ({ data, headerAction }: Props) => {
  const dates = useMemo(() => getDateRange(data.periodStart, data.periodEnd), [data.periodStart, data.periodEnd]);

  const entries = useMemo(() => buildInitialEntries(dates, data), [dates, data]);

  return (
    <SubmitPageLayout>
      <SubmitPageHeader shopName={data.shopName} actions={headerAction} />

      {/* Info Banner (full-width bg) */}
      <Box bg="blue.50" w="full">
        <Flex maxW={STAFF_CONTENT_MAX_W} mx="auto" px={4} py={2.5} gap={2} align="flex-start">
          <Icon color="blue.600" boxSize={4} mt={0.5}>
            <LuInfo />
          </Icon>
          <Box>
            <Text fontSize="xs" fontWeight="semibold" color="blue.800">
              締切を過ぎたため変更できません
            </Text>
            <Text mt={0.5} fontSize="xs" color="blue.700" lineHeight={1.6}>
              提出内容をもとに、お店でシフトを調整しています。
              <br />
              確定までしばらくお待ちください。
            </Text>
          </Box>
        </Flex>
      </Box>

      {/* InfoBar (full-width bg) */}
      <Box bg="white" w="full" borderBottomWidth={1} borderColor="border.default">
        <Flex maxW={STAFF_CONTENT_MAX_W} mx="auto" px={4} py={3} align="center">
          <Text fontSize="sm" fontWeight="semibold">
            {formatDatePeriodWithWeekday(data.periodStart, data.periodEnd)}
          </Text>
        </Flex>
      </Box>

      {/* Card List */}
      <SubmitPageContent>
        <VStack px={4} py={3} gap={2}>
          {entries.map((entry) => (
            <ReadOnlyDay key={entry.date} entry={entry} data={data} />
          ))}
        </VStack>
      </SubmitPageContent>
    </SubmitPageLayout>
  );
};

const ReadOnlyDay = ({ entry, data }: { entry: DayEntry; data: SubmissionData }) => {
  const isShopClosed = data.shopClosedDates.includes(entry.date);
  if (data.submissionPattern.kind === "dateOnly") {
    return <DateOnlySubmissionDayCard entry={entry} isReadOnly isShopClosed={isShopClosed} />;
  }
  if (data.submissionPattern.kind === "shiftType") {
    return (
      <ShiftTypeSubmissionDayCard
        entry={entry}
        options={data.submissionPattern.options}
        isReadOnly
        isShopClosed={isShopClosed}
      />
    );
  }
  return (
    <DayCard
      entry={entry}
      timeOptions={[]}
      onToggleWorking={() => {}}
      onTimeChange={() => {}}
      onClear={() => {}}
      isReadOnly
      isShopClosed={isShopClosed}
    />
  );
};
