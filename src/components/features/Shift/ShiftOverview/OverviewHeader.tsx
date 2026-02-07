import { Badge, HStack, Icon, Table, Text, VStack } from "@chakra-ui/react";
import { LuInfo } from "react-icons/lu";
import { Tooltip } from "@/src/components/ui/tooltip";
import { DATE_CELL_WIDTH, MONTH_TOTAL_CELL_WIDTH, ROW_HEIGHT, STAFF_NAME_CELL_WIDTH } from "./constants";
import { SortMenu } from "./SortMenu";
import type { OverviewHeaderProps } from "./types";
import { formatDateShort, formatMonthLabel, getWeekdayLabel, isHoliday, isSaturday, isSunday } from "./utils/dateUtils";

/**
 * 日付セルの背景色・テキスト色を取得
 */
const getDateCellColors = (date: string, holidays: string[]) => {
  if (isSunday(date) || isHoliday(date, holidays)) {
    return { bg: "red.50", color: "red.600" };
  }
  if (isSaturday(date)) {
    return { bg: "blue.50", color: "blue.600" };
  }
  return { bg: "white", color: "gray.700" };
};

export const OverviewHeader = ({
  dates,
  months,
  holidays,
  sortMode,
  onSortChange,
  unsubmittedCount,
}: OverviewHeaderProps) => (
  <Table.Header>
    <Table.Row position="sticky" top={0} zIndex={10} boxShadow="0 2px 4px rgba(0,0,0,0.04)">
      {/* 左上コーナーセル（スタッフソートメニュー + 未提出バッジ） */}
      <Table.ColumnHeader
        position="sticky"
        left={0}
        bg="gray.50"
        zIndex={11}
        w={`${STAFF_NAME_CELL_WIDTH}px`}
        minW={`${STAFF_NAME_CELL_WIDTH}px`}
        h={`${ROW_HEIGHT}px`}
        p={1}
        borderRight="1px solid"
        borderColor="gray.200"
      >
        <VStack gap={0.5}>
          <SortMenu sortMode={sortMode} onSortChange={onSortChange} />
          {unsubmittedCount > 0 && (
            <Badge colorPalette="red" variant="subtle" size="xs">
              未提出: {unsubmittedCount}名
            </Badge>
          )}
        </VStack>
      </Table.ColumnHeader>

      {/* 日付セル */}
      {dates.map((date) => {
        const { bg, color } = getDateCellColors(date, holidays);
        return (
          <Table.ColumnHeader
            key={date}
            bg={bg}
            w={`${DATE_CELL_WIDTH}px`}
            minW={`${DATE_CELL_WIDTH}px`}
            h={`${ROW_HEIGHT}px`}
            p={1}
            textAlign="center"
            borderRight="1px solid"
            borderColor="gray.200"
          >
            <VStack gap={0}>
              <Text fontSize="xs" fontWeight="bold" color={color}>
                {formatDateShort(date)}
              </Text>
              <Text fontSize="2xs" color={color}>
                {getWeekdayLabel(date)}
              </Text>
            </VStack>
          </Table.ColumnHeader>
        );
      })}

      {/* 月別合計セル */}
      {months.map((month, index) => (
        <Table.ColumnHeader
          key={month}
          bg="gray.50"
          w={`${MONTH_TOTAL_CELL_WIDTH}px`}
          minW={`${MONTH_TOTAL_CELL_WIDTH}px`}
          h={`${ROW_HEIGHT}px`}
          p={1}
          textAlign="center"
          borderRight="1px solid"
          borderColor="gray.200"
        >
          <HStack gap={0.5} justify="center">
            <Text fontSize="xs" fontWeight="bold" color="gray.700">
              {formatMonthLabel(month)}
            </Text>
            {index === 0 && (
              <Tooltip content="表示期間外の勤務時間を含む月全体の合計">
                <Icon as={LuInfo} boxSize={3} color="gray.400" cursor="help" />
              </Tooltip>
            )}
          </HStack>
        </Table.ColumnHeader>
      ))}
    </Table.Row>
  </Table.Header>
);
