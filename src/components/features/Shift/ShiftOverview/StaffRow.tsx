import { Box, Table, Text } from "@chakra-ui/react";
import { DATE_CELL_WIDTH, ROW_HEIGHT, STAFF_NAME_CELL_WIDTH } from "./constants";
import { MonthSummaryCell } from "./MonthSummaryCell";
import type { StaffRowProps } from "./types";
import { isHoliday, isSaturday, isSunday } from "./utils/dateUtils";

/**
 * 日付セルの背景色を取得（ホバー時は gray.100）
 */
const getDateCellBg = (date: string, holidays: string[]) => {
  if (isSunday(date) || isHoliday(date, holidays)) {
    return "red.50";
  }
  if (isSaturday(date)) {
    return "blue.50";
  }
  return "white";
};

export const StaffRow = ({ data, dates, months, holidays, onStaffClick, onDateClick }: StaffRowProps) => {
  const { staffId, staffName, dailyShifts, monthlyTotals, alerts } = data;

  return (
    <Table.Row>
      {/* スタッフ名セル（左固定） */}
      <Table.Cell
        position="sticky"
        left={0}
        bg="white"
        zIndex={1}
        w={`${STAFF_NAME_CELL_WIDTH}px`}
        minW={`${STAFF_NAME_CELL_WIDTH}px`}
        h={`${ROW_HEIGHT}px`}
        p={1}
        borderRight="1px solid"
        borderColor="gray.200"
      >
        <Box
          as="button"
          display="flex"
          alignItems="center"
          w="full"
          h="full"
          cursor="pointer"
          _hover={{ bg: "gray.100" }}
          transition="all 0.15s"
          borderRadius="sm"
          px={1}
          onClick={onStaffClick}
        >
          <Text fontSize="xs" fontWeight="medium" truncate>
            {staffName}
          </Text>
        </Box>
      </Table.Cell>

      {/* 日付セル */}
      {dates.map((date) => {
        const shift = dailyShifts.get(date);
        const bg = getDateCellBg(date, holidays);

        return (
          <Table.Cell
            key={`${staffId}-${date}`}
            bg={bg}
            w={`${DATE_CELL_WIDTH}px`}
            minW={`${DATE_CELL_WIDTH}px`}
            h={`${ROW_HEIGHT}px`}
            p={1}
            textAlign="center"
            borderRight="1px solid"
            borderColor="gray.200"
            cursor={onDateClick ? "pointer" : "default"}
            _hover={onDateClick ? { bg: "gray.100" } : undefined}
            transition="all 0.15s"
            onClick={() => onDateClick?.(date)}
          >
            <Text fontSize="xs" color={shift ? "gray.800" : "gray.400"}>
              {shift ? `${shift.start}-${shift.end}` : "-"}
            </Text>
          </Table.Cell>
        );
      })}

      {/* 月別合計セル */}
      {months.map((month) => {
        const totalMinutes = monthlyTotals.get(month) ?? 0;
        // Phase 5: 月ごとのアラートをフィルタリング
        const monthAlerts = alerts.filter((a) => a.targetDate?.startsWith(month));

        return (
          <MonthSummaryCell
            key={`${staffId}-${month}`}
            totalMinutes={totalMinutes}
            alerts={monthAlerts}
            month={month}
          />
        );
      })}
    </Table.Row>
  );
};
