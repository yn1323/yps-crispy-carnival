import { Box, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useMemo } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { getDailyShiftTime } from "../ShiftOverview/utils/calculations";
import { isSaturday, isSunday } from "../ShiftOverview/utils/dateUtils";
import { FILL_RATE_COLORS } from "../ShiftTableTest/types";
import type { DateCardProps } from "./types";

const MAX_VISIBLE_STAFFS = 5;

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

const getDateColor = (date: string, holiday: boolean) => {
  if (holiday || isSunday(date)) return "red.500";
  if (isSaturday(date)) return "blue.500";
  return "gray.800";
};

export const DateCard = ({ date, staffs, shifts, isHoliday: holiday, onTap, requiredCount }: DateCardProps) => {
  const dateLabel = dayjs(date).format("M/D(ddd)");
  const dateColor = getDateColor(date, holiday);

  const { workingStaffs, unsubmittedStaffs, staffCount } = useMemo(() => {
    const working = staffs
      .map((staff) => {
        const shift = shifts.find((s) => s.staffId === staff.id);
        if (!shift || shift.positions.length === 0) return null;
        const time = getDailyShiftTime(shift);
        return { staff, time };
      })
      .filter((v) => v !== null);

    const unsubmitted = staffs.filter((s) => !s.isSubmitted);

    return { workingStaffs: working, unsubmittedStaffs: unsubmitted, staffCount: working.length };
  }, [staffs, shifts]);

  const hasRequired = requiredCount !== undefined && requiredCount > 0;
  const fillPercent = hasRequired ? Math.min((staffCount / requiredCount) * 100, 100) : 100;
  const fillColor = hasRequired ? getFillRateColor(staffCount, requiredCount) : null;

  const visibleStaffs = workingStaffs.slice(0, MAX_VISIBLE_STAFFS);
  const hiddenCount = workingStaffs.length - MAX_VISIBLE_STAFFS;

  return (
    <Box
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      p={3}
      bg="white"
      cursor="pointer"
      _active={{ bg: "gray.50" }}
      onClick={onTap}
    >
      {/* ヘッダー: 日付 + 充足度% */}
      <Flex justify="space-between" align="center" mb={2}>
        <Text fontSize="md" fontWeight="bold" color={dateColor}>
          {dateLabel}
        </Text>
        {hasRequired && (
          <Text fontSize="sm" fontWeight="medium" color={fillColor?.text}>
            充足 {Math.round(fillPercent)}%
          </Text>
        )}
      </Flex>

      {/* 充足度バー */}
      {hasRequired && (
        <Box h="6px" bg="gray.200" borderRadius="full" overflow="hidden" mb={2}>
          <Box h="100%" w={`${fillPercent}%`} bg={fillColor?.bg} borderRadius="full" transition="width 0.15s ease" />
        </Box>
      )}

      {/* スタッフリスト */}
      <VStack gap={1} align="stretch" mb={2}>
        {visibleStaffs.map(({ staff, time }) => (
          <Flex key={staff.id} justify="space-between" align="center">
            <Text fontSize="sm" color="gray.700" truncate maxW="60%">
              {staff.name}
            </Text>
            <Text fontSize="sm" color="gray.500">
              {time ? `${time.start}-${time.end}` : ""}
            </Text>
          </Flex>
        ))}
        {hiddenCount > 0 && (
          <Text fontSize="xs" color="gray.400">
            他 {hiddenCount}名
          </Text>
        )}
        {unsubmittedStaffs.map((staff) => (
          <Flex key={staff.id} align="center" gap={1}>
            <Icon as={LuTriangleAlert} boxSize={3} color="orange.400" />
            <Text fontSize="sm" color="gray.500" truncate maxW="50%">
              {staff.name}
            </Text>
            <Text fontSize="xs" color="orange.400">
              未提出
            </Text>
          </Flex>
        ))}
      </VStack>

      {/* フッター */}
      <Flex borderTopWidth="1px" borderColor="gray.100" pt={1}>
        <Text fontSize="xs" color="gray.500">
          出勤 {staffCount}名{hasRequired && ` / 必要 ${requiredCount}名`}
        </Text>
      </Flex>
    </Box>
  );
};
