import { Box, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { useMemo } from "react";
import { LuInfo } from "react-icons/lu";
import { STAFF_CONTENT_MAX_W } from "@/src/components/templates/Header";
import { getDateRange } from "@/src/domains/shift/date";
import { DayCard, type DayEntry } from "../DayCard";
import { DateOnlySubmissionDayCard, ShiftTypeSubmissionDayCard, type SubmissionData } from "../SubmitFormView";
import { SubmitPageContent, SubmitPageHeader, SubmitPageLayout } from "../SubmitPageLayout";
import { buildRestEntry } from "../utils/dayEntryState";
import { buildEntries, formatPeriodLabel } from "../utils/timeOptions";

type Props = {
  data: SubmissionData;
};

export const ReadOnlySubmitView = ({ data }: Props) => {
  const dates = useMemo(() => getDateRange(data.periodStart, data.periodEnd), [data.periodStart, data.periodEnd]);

  const entries = useMemo(() => {
    if (data.submissionPattern.kind === "dateOnly" && data.existingSelection.kind === "dateOnly") {
      const workingDateSet = new Set(data.existingSelection.workingDates);
      return dates.map((date) => {
        const entry = {
          date,
          isWorking: workingDateSet.has(date),
          startTime: data.timeRange.startTime,
          endTime: data.timeRange.endTime,
        };
        return data.shopClosedDates.includes(entry.date) ? buildRestEntry(entry) : entry;
      });
    }
    if (data.submissionPattern.kind === "shiftType" && data.existingSelection.kind === "shiftType") {
      const selectionsByDate = new Map<string, string[]>();
      for (const selection of data.existingSelection.selections) {
        selectionsByDate.set(selection.date, [...(selectionsByDate.get(selection.date) ?? []), selection.optionId]);
      }
      const optionMap = new Map(data.submissionPattern.options.map((option) => [option.id, option]));
      return dates.map((date) => {
        const optionIds = (selectionsByDate.get(date) ?? []).filter((optionId) => optionMap.has(optionId));
        const firstOption = optionIds.length > 0 ? optionMap.get(optionIds[0]) : undefined;
        const entry = firstOption
          ? {
              date,
              isWorking: true,
              startTime: firstOption.startTime,
              endTime: firstOption.endTime,
              optionId: firstOption.id,
              optionIds,
            }
          : { date, isWorking: false, startTime: data.timeRange.startTime, endTime: data.timeRange.endTime };
        return data.shopClosedDates.includes(entry.date) ? buildRestEntry(entry) : entry;
      });
    }
    return buildEntries(dates, data.existingRequests, data.timeRange).map((entry) =>
      data.shopClosedDates.includes(entry.date) ? buildRestEntry(entry) : entry,
    );
  }, [dates, data]);

  return (
    <SubmitPageLayout>
      <SubmitPageHeader shopName={data.shopName} />

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
              シフトは調整中です。
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
            {formatPeriodLabel(data.periodStart, data.periodEnd)}
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
