import { Flex, Text, VStack } from "@chakra-ui/react";
import { useMemo } from "react";
import { Select } from "@/src/components/ui/Select";
import { isHoliday } from "../ShiftOverview/utils/dateUtils";
import type { SortMode } from "../ShiftTableTest/types";
import { DateCard } from "./DateCard";
import type { ShiftOverviewCardSPProps } from "./types";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "default", label: "登録順" },
  { value: "request", label: "希望時間順" },
  { value: "startTime", label: "開始時間順" },
];

export const ShiftOverviewCardSP = ({
  dates,
  staffs,
  shifts,
  holidays = [],
  onDateClick,
  sortMode,
  onSortModeChange,
}: ShiftOverviewCardSPProps) => {
  const dateData = useMemo(
    () =>
      dates.map((date) => ({
        date,
        shifts: shifts.filter((s) => s.date === date),
        isHoliday: isHoliday(date, holidays),
      })),
    [dates, shifts, holidays],
  );

  return (
    <VStack gap={3} align="stretch" px={3} pb={4}>
      {/* ソートメニュー */}
      <Flex justify="flex-end">
        <Select
          items={SORT_OPTIONS}
          value={sortMode ?? "default"}
          onChange={(v) => onSortModeChange(v as SortMode)}
          size="sm"
          w="140px"
        />
      </Flex>

      {/* 日付カードリスト */}
      {dateData.map(({ date, shifts: dateShifts, isHoliday: holiday }) => (
        <DateCard
          key={date}
          date={date}
          staffs={staffs}
          shifts={dateShifts}
          isHoliday={holiday}
          onTap={() => onDateClick?.(date)}
        />
      ))}

      {dates.length === 0 && (
        <Text fontSize="sm" color="gray.400" textAlign="center" py={8}>
          表示する日付がありません
        </Text>
      )}
    </VStack>
  );
};
