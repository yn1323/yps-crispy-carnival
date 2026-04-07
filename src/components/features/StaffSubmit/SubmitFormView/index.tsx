import { Box, Button, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { LuPointer } from "react-icons/lu";
import { formatDateWithWeekday, getDateRange } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import { DayCard, type DayEntry } from "../DayCard";
import { buildEntries, formatPeriodLabel, generateTimeOptions } from "../utils/timeOptions";

export type SubmissionData = {
  shopName: string;
  staffName: string;
  periodStart: string;
  periodEnd: string;
  deadline: string;
  isBeforeDeadline: boolean;
  hasSubmitted: boolean;
  existingRequests: { date: string; startTime: string; endTime: string }[];
  timeRange: { startTime: string; endTime: string };
};

type Props = {
  data: SubmissionData;
  onSubmit: (entries: DayEntry[]) => void;
};

export const SubmitFormView = ({ data, onSubmit }: Props) => {
  const dates = useMemo(() => getDateRange(data.periodStart, data.periodEnd), [data.periodStart, data.periodEnd]);
  const timeOptions = useMemo(
    () => generateTimeOptions(data.timeRange.startTime, data.timeRange.endTime),
    [data.timeRange.startTime, data.timeRange.endTime],
  );

  const [entries, setEntries] = useState<DayEntry[]>(() => buildEntries(dates, data.existingRequests, data.timeRange));

  const handleToggleWorking = (date: string) => {
    setEntries((prev) => prev.map((e) => (e.date === date ? { ...e, isWorking: true } : e)));
  };

  const handleTimeChange = (date: string, field: "startTime" | "endTime", value: string) => {
    setEntries((prev) => prev.map((e) => (e.date === date ? { ...e, [field]: value } : e)));
  };

  const handleClear = (date: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.date === date
          ? { ...e, isWorking: false, startTime: data.timeRange.startTime, endTime: data.timeRange.endTime }
          : e,
      ),
    );
  };

  const handleSubmit = () => {
    onSubmit(entries);
  };

  return (
    <Flex direction="column" minH="100dvh" bg="gray.50">
      {/* Header */}
      <Box bg="teal.600" px={4} pt={3} pb={4}>
        <Text fontSize="xs" color="white" opacity={0.8}>
          {data.shopName}
        </Text>
        <Text fontSize="xl" fontWeight="bold" color="white">
          シフト希望を提出
        </Text>
      </Box>

      {/* InfoBar */}
      <Flex
        bg="white"
        px={4}
        py={3}
        justify="space-between"
        align="center"
        borderBottomWidth={1}
        borderColor="border.default"
      >
        <Box>
          <Text fontSize="sm" fontWeight="semibold">
            {formatPeriodLabel(data.periodStart, data.periodEnd)}
          </Text>
          <Text fontSize="xs" color="fg.muted">
            提出締切: {formatDateWithWeekday(data.deadline)}
          </Text>
        </Box>
        {data.hasSubmitted ? (
          <Box bg="green.50" px={2.5} py={1} borderRadius="full">
            <Text fontSize="xs" fontWeight="semibold" color="green.800">
              提出済み
            </Text>
          </Box>
        ) : (
          <Box bg="orange.50" px={2.5} py={1} borderRadius="full">
            <Text fontSize="xs" fontWeight="semibold" color="orange.800">
              未提出
            </Text>
          </Box>
        )}
      </Flex>

      {/* Helper */}
      <Flex px={4} pt={3} gap={1.5} align="center">
        <Icon color="fg.subtle" boxSize={3.5}>
          <LuPointer />
        </Icon>
        <Text fontSize="xs" fontWeight="medium" color="fg.muted">
          出勤する日をタップしてください
        </Text>
      </Flex>

      {/* Card List */}
      <VStack px={4} py={3} gap={2}>
        {entries.map((entry) => (
          <DayCard
            key={entry.date}
            entry={entry}
            timeOptions={timeOptions}
            onToggleWorking={() => handleToggleWorking(entry.date)}
            onTimeChange={(field, value) => handleTimeChange(entry.date, field, value)}
            onClear={() => handleClear(entry.date)}
          />
        ))}
      </VStack>

      {/* Submit Button */}
      <Box px={4} pt={2} pb={6}>
        <Button w="full" h="48px" colorPalette="teal" borderRadius="lg" fontWeight="semibold" onClick={handleSubmit}>
          {data.hasSubmitted ? "修正して提出する" : "提出する"}
        </Button>
      </Box>
    </Flex>
  );
};
