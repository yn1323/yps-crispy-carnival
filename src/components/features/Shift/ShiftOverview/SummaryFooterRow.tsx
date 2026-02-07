import { Box, Flex, HStack, Icon, Table, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useMemo } from "react";
import { LuInfo } from "react-icons/lu";
import { Tooltip } from "@/src/components/ui/tooltip";
import { FILL_RATE_COLORS } from "../ShiftTableTest/types";
import { DATE_CELL_WIDTH, MONTH_TOTAL_CELL_WIDTH, ROW_HEIGHT, STAFF_NAME_CELL_WIDTH } from "./constants";
import type { RequiredStaffingData, SummaryFooterRowProps } from "./types";

/**
 * 日付ごとの出勤者数を集計
 * ポジションが1つ以上あるシフトのユニークスタッフ数をカウント
 */
const countStaffPerDate = (shifts: SummaryFooterRowProps["shifts"], dates: string[]): Map<string, number> => {
  const counts = new Map<string, number>();

  for (const date of dates) {
    const dateShifts = shifts.filter((s) => s.date === date && s.positions.length > 0);
    const uniqueStaffIds = new Set(dateShifts.map((s) => s.staffId));
    counts.set(date, uniqueStaffIds.size);
  }

  return counts;
};

/**
 * 日付のピーク時必要人数を取得
 * 各時間帯のrequiredCount合計の最大値を返す
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

/**
 * 充足率から6段階カラーを取得（ShiftTableTest/SummaryRow と同一ロジック）
 */
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

export const SummaryFooterRow = ({ shifts, dates, months, requiredStaffing }: SummaryFooterRowProps) => {
  const staffCountPerDate = useMemo(() => countStaffPerDate(shifts, dates), [shifts, dates]);

  const hasRequiredStaffing = requiredStaffing && requiredStaffing.length > 0;

  return (
    <Table.Footer>
      <Table.Row
        bg="gray.50"
        borderTop="2px solid"
        borderColor="gray.300"
        position="sticky"
        bottom={0}
        zIndex={2}
        boxShadow="0 -2px 4px rgba(0,0,0,0.04)"
      >
        {/* ラベルセル（左固定） */}
        <Table.Cell
          position="sticky"
          left={0}
          bg="gray.50"
          zIndex={3}
          w={`${STAFF_NAME_CELL_WIDTH}px`}
          minW={`${STAFF_NAME_CELL_WIDTH}px`}
          h={`${ROW_HEIGHT}px`}
          p={1}
          borderRight="1px solid"
          borderColor="gray.200"
        >
          <Text fontSize="xs" fontWeight="bold" color="gray.700">
            出勤数
          </Text>
        </Table.Cell>

        {/* 日付ごとの出勤者数セル */}
        {dates.map((date) => {
          const count = staffCountPerDate.get(date) ?? 0;

          if (hasRequiredStaffing) {
            const required = getDailyRequiredCount(date, requiredStaffing);
            const color = getFillRateColor(count, required);

            return (
              <Table.Cell
                key={`summary-${date}`}
                bg={color.bg}
                w={`${DATE_CELL_WIDTH}px`}
                minW={`${DATE_CELL_WIDTH}px`}
                h={`${ROW_HEIGHT}px`}
                p={1}
                textAlign="center"
                borderRight="1px solid"
                borderColor="gray.200"
              >
                <Text fontSize="xs" fontWeight="bold" color="gray.800">
                  {count}/{required}
                </Text>
              </Table.Cell>
            );
          }

          const isZero = count === 0;
          return (
            <Table.Cell
              key={`summary-${date}`}
              bg="gray.50"
              w={`${DATE_CELL_WIDTH}px`}
              minW={`${DATE_CELL_WIDTH}px`}
              h={`${ROW_HEIGHT}px`}
              p={1}
              textAlign="center"
              borderRight="1px solid"
              borderColor="gray.200"
            >
              <Text fontSize="xs" fontWeight={isZero ? "bold" : "normal"} color={isZero ? "red.500" : "gray.700"}>
                {count}名
              </Text>
            </Table.Cell>
          );
        })}

        {/* 月別合計セル（空欄） */}
        {months.map((month) => (
          <Table.Cell
            key={`summary-${month}`}
            bg="gray.50"
            w={`${MONTH_TOTAL_CELL_WIDTH}px`}
            minW={`${MONTH_TOTAL_CELL_WIDTH}px`}
            h={`${ROW_HEIGHT}px`}
            p={1}
            borderRight="1px solid"
            borderColor="gray.200"
          />
        ))}
      </Table.Row>
    </Table.Footer>
  );
};
