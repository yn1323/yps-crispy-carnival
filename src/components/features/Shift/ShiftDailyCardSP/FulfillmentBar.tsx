import { Box, Flex, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useMemo } from "react";
import type { RequiredStaffingData } from "../ShiftOverview/types";
import { FILL_RATE_COLORS } from "../ShiftTableTest/types";
import type { FulfillmentBarProps } from "./types";

/**
 * 日付のピーク時必要人数を取得（SummaryFooterRowと同一ロジック）
 */
const getDailyRequiredCount = (date: string, requiredStaffing: RequiredStaffingData[]): number => {
  const dow = dayjs(date).day();
  const entry = requiredStaffing.find((rs) => rs.dayOfWeek === dow);
  if (!entry || entry.slots.length === 0) return 0;

  const hourlyTotals = new Map<number, number>();
  for (const slot of entry.slots) {
    hourlyTotals.set(slot.hour, (hourlyTotals.get(slot.hour) ?? 0) + slot.requiredCount);
  }
  return Math.max(...hourlyTotals.values());
};

const getFillRateColor = (count: number, required: number) => {
  if (required === 0) return FILL_RATE_COLORS[4];
  const ratio = count / required;
  if (ratio > 1) return FILL_RATE_COLORS[5];
  if (ratio > 0.8) return FILL_RATE_COLORS[4];
  if (ratio > 0.6) return FILL_RATE_COLORS[3];
  if (ratio > 0.4) return FILL_RATE_COLORS[2];
  if (ratio > 0.2) return FILL_RATE_COLORS[1];
  return FILL_RATE_COLORS[0];
};

export const FulfillmentBar = ({ shifts, selectedDate, requiredStaffing }: FulfillmentBarProps) => {
  const { staffCount, requiredCount, hasRequired } = useMemo(() => {
    const dateShifts = shifts.filter((s) => s.date === selectedDate && s.positions.length > 0);
    const uniqueStaffIds = new Set(dateShifts.map((s) => s.staffId));
    const count = uniqueStaffIds.size;

    const hasReq = requiredStaffing && requiredStaffing.length > 0;
    const required = hasReq ? getDailyRequiredCount(selectedDate, requiredStaffing) : 0;

    return { staffCount: count, requiredCount: required, hasRequired: !!hasReq };
  }, [shifts, selectedDate, requiredStaffing]);

  if (!hasRequired) {
    return (
      <Flex align="center" px={2} py={1} bg="gray.50" borderRadius="md">
        <Text fontSize="sm" color="gray.600">
          出勤 {staffCount}名
        </Text>
      </Flex>
    );
  }

  const color = getFillRateColor(staffCount, requiredCount);
  const fillPercent = requiredCount > 0 ? Math.min((staffCount / requiredCount) * 100, 100) : 100;

  return (
    <Flex align="center" gap={3} px={2} py={1} bg="gray.50" borderRadius="md">
      <Box flex={1} h="8px" bg="gray.200" borderRadius="full" overflow="hidden">
        <Box h="100%" w={`${fillPercent}%`} bg={color.bg} borderRadius="full" transition="width 0.15s ease" />
      </Box>
      <Text fontSize="sm" color="gray.700" flexShrink={0} fontWeight="medium">
        出勤 {staffCount}/{requiredCount}名
      </Text>
    </Flex>
  );
};
