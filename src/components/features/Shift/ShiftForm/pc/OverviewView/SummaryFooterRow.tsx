import { Box, Flex, HStack, Icon, Table, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useMemo } from "react";
import { LuInfo } from "react-icons/lu";
import { Tooltip } from "@/src/components/ui/tooltip";
import {
  DATE_CELL_WIDTH,
  FILL_RATE_COLORS,
  MONTH_TOTAL_CELL_WIDTH,
  ROW_HEIGHT,
  STAFF_NAME_CELL_WIDTH,
} from "../../constants";
import type { RequiredStaffingData, SummaryFooterRowProps } from "../../types";

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
 * 充足率から6段階カラーを取得
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
        bg="white"
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
          bg="white"
          zIndex={3}
          w={`${STAFF_NAME_CELL_WIDTH}px`}
          minW={`${STAFF_NAME_CELL_WIDTH}px`}
          h={`${ROW_HEIGHT}px`}
          p={1}
          borderRight="1px solid"
          borderColor="gray.200"
        >
          <HStack gap={1}>
            <Text fontSize="xs" fontWeight="bold" color="gray.700">
              出勤数
            </Text>
            {hasRequiredStaffing && (
              <Tooltip
                showArrow
                content={
                  <Box p={1}>
                    <Text fontSize="xs" mb={1}>
                      充足度カラースケール
                    </Text>
                    <Flex>
                      {FILL_RATE_COLORS.map((color, i) => (
                        <Box
                          key={color.bg}
                          w="full"
                          h="8px"
                          bg={color.bg}
                          borderLeftRadius={i === 0 ? "sm" : undefined}
                          borderRightRadius={i === FILL_RATE_COLORS.length - 1 ? "sm" : undefined}
                        />
                      ))}
                    </Flex>
                    <Box position="relative" width="96px" mt={0.5} height="12px">
                      <Text fontSize="9px" position="absolute" left="0">
                        0%
                      </Text>
                      <Text fontSize="9px" position="absolute" left="90px" transform="translateX(-50%)">
                        100%
                      </Text>
                      <Text fontSize="9px" position="absolute" left="100px" transform="translateX(50%)">
                        超
                      </Text>
                    </Box>
                  </Box>
                }
              >
                <Icon as={LuInfo} boxSize={3} color="gray.400" cursor="help" />
              </Tooltip>
            )}
          </HStack>
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
              bg="white"
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
            bg="white"
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
