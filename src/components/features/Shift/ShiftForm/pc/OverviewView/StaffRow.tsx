import { Box, HStack, Icon, Table, Text } from "@chakra-ui/react";
import { LuTriangleAlert } from "react-icons/lu";
import { DATE_CELL_WIDTH, ROW_HEIGHT, STAFF_NAME_CELL_WIDTH } from "../../constants";
import type { DailyShift, StaffRowProps } from "../../types";
import { isHoliday, isSaturday, isSunday } from "../../utils/dateUtils";
import { MonthSummaryCell } from "./MonthSummaryCell";

/**
 * 日付セルの背景色を取得
 * 未提出スタッフは薄い赤背景で強調
 */
const getDateCellBg = (date: string, holidays: string[], isUnsubmitted: boolean, hasShift: boolean) => {
  if (isUnsubmitted && !hasShift) return "red.50";
  if (isSunday(date) || isHoliday(date, holidays)) return "red.50";
  if (isSaturday(date)) return "blue.50";
  return "white";
};

/**
 * 日付セルの表示内容を決定
 * - 未提出スタッフ: 「未」(orange.400)
 * - 提出済み＆勤務あり: 「09:00-17:00」(gray.800)
 * - 提出済み＆勤務なし: 「休」(gray.400)
 */
const getShiftCellDisplay = (shift: DailyShift | null | undefined, isSubmitted: boolean) => {
  if (!isSubmitted) {
    if (shift) return { label: `${shift.start}-${shift.end}`, color: "orange.400" };
    return { label: "未", color: "orange.400" };
  }
  if (shift) return { label: `${shift.start}-${shift.end}`, color: "gray.800" };
  return { label: "休", color: "gray.400" };
};

export const StaffRow = ({
  data,
  dates,
  months,
  holidays,
  onStaffClick,
  onDateClick,
  isHighlighted = false,
}: StaffRowProps) => {
  const { staffId, staffName, isSubmitted, dailyShifts, monthlyTotals, alerts } = data;
  const isUnsubmitted = !isSubmitted;

  const staffCellBg = isHighlighted ? "blue.50" : isUnsubmitted ? "red.50" : "white";

  return (
    <Table.Row
      bg={isHighlighted ? "blue.50" : undefined}
      borderLeft={isHighlighted ? "3px solid" : undefined}
      borderLeftColor={isHighlighted ? "blue.400" : undefined}
    >
      {/* スタッフ名セル（左固定） */}
      <Table.Cell
        position="sticky"
        left={0}
        bg={staffCellBg}
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
          cursor={onStaffClick ? "pointer" : "default"}
          _hover={onStaffClick ? { bg: isUnsubmitted ? "red.100" : "gray.100" } : undefined}
          transition="all 0.15s"
          borderRadius="sm"
          px={1}
          onClick={onStaffClick}
        >
          <HStack gap={1} w="full">
            {isUnsubmitted && <Icon as={LuTriangleAlert} boxSize={3} color="orange.500" flexShrink={0} />}
            <Text fontSize="xs" fontWeight="medium" truncate>
              {staffName}
            </Text>
          </HStack>
        </Box>
      </Table.Cell>

      {/* 日付セル */}
      {dates.map((date) => {
        const shift = dailyShifts.get(date);
        const bg = getDateCellBg(date, holidays, isUnsubmitted, !!shift);
        const { label, color } = getShiftCellDisplay(shift, isSubmitted);

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
            _hover={onDateClick ? { bg: isUnsubmitted ? "red.100" : "gray.100" } : undefined}
            transition="all 0.15s"
            onClick={() => onDateClick?.(date)}
          >
            <Text fontSize="xs" color={color}>
              {label}
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
