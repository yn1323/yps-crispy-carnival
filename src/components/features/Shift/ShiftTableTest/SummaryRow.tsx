import { Box, Flex, Icon, Table, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { GridLines } from "./GridLines";
import { type PositionType, type ShiftData, TIME_AXIS_PADDING_PX, type TimeRange } from "./types";

type SummaryRowProps = {
  shifts: ShiftData[];
  positions: PositionType[];
  timeRange: TimeRange;
  date: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  requiredCountPerHour?: number; // 時間帯ごとの必要人数（デフォルト: 5）
  timeSlotsCount: number; // colSpan用
};

// 特定時刻にポジションで稼働している人数をカウント（未提出者も含む）
const countShiftsAtTime = (shifts: ShiftData[], targetTime: string): number => {
  return shifts.filter((shift) => {
    // ポジションがこの時間帯にあるかチェック
    return shift.positions.some((pos) => pos.start <= targetTime && targetTime < pos.end);
  }).length;
};

// 特定時刻に特定ポジションで稼働している人数をカウント（未提出者も含む）
const countPositionAtTime = (shifts: ShiftData[], positionId: string, targetTime: string): number => {
  return shifts.filter((shift) => {
    // 該当ポジションがこの時間帯にあるかチェック
    return shift.positions.some(
      (pos) => pos.positionId === positionId && pos.start <= targetTime && targetTime < pos.end,
    );
  }).length;
};

// 時間スロットを生成（timeRange.unit刻み）
const generateTimeSlots = (timeRange: TimeRange): string[] => {
  const slots: string[] = [];
  for (let hour = timeRange.start; hour < timeRange.end; hour++) {
    for (let minute = 0; minute < 60; minute += timeRange.unit) {
      slots.push(`${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`);
    }
  }
  return slots;
};

export const SummaryRow = ({
  shifts,
  positions,
  timeRange,
  date,
  isExpanded,
  onToggleExpand,
  requiredCountPerHour = 5,
  timeSlotsCount,
}: SummaryRowProps) => {
  // 選択日のシフトのみフィルタ
  const dateShifts = useMemo(() => shifts.filter((s) => s.date === date), [shifts, date]);

  // 時間スロット（timeRange.unit刻み）
  const timeSlots = useMemo(() => generateTimeSlots(timeRange), [timeRange]);

  // 時間帯ごとの合計カウント
  const totalCounts = useMemo(() => {
    return timeSlots.map((time) => countShiftsAtTime(dateShifts, time));
  }, [dateShifts, timeSlots]);

  // ポジション別のカウント
  const positionCounts = useMemo(() => {
    return positions.map((position) => ({
      position,
      counts: timeSlots.map((time) => countPositionAtTime(dateShifts, position.id, time)),
    }));
  }, [dateShifts, positions, timeSlots]);

  return (
    <>
      {/* 合計行（クリックで展開/折りたたみ） */}
      <Table.Row
        bg="gray.100"
        cursor="pointer"
        onClick={onToggleExpand}
        _hover={{ bg: "gray.200" }}
        transition="background 0.15s"
      >
        <Table.Cell
          fontWeight="bold"
          position="sticky"
          left={0}
          bg="gray.100"
          zIndex={1}
          borderRight="1px solid"
          borderTop="2px solid"
          borderColor="gray.200"
          _hover={{ bg: "gray.200" }}
        >
          <Flex align="center">
            <Icon as={isExpanded ? LuChevronDown : LuChevronRight} mr={1} color="gray.600" />
            <Text fontWeight="bold" color="gray.700" fontSize="sm">
              合計
            </Text>
          </Flex>
        </Table.Cell>
        <Table.Cell colSpan={timeSlotsCount} p={0} borderTop="2px solid" borderColor="gray.200">
          <Box position="relative" height="40px" px={`${TIME_AXIS_PADDING_PX}px`}>
            {/* グリッドライン */}
            <GridLines timeRange={timeRange} />
            <Flex position="relative" zIndex={1} height="100%" align="center">
              {timeSlots.map((time, idx) => {
                const count = totalCounts[idx];
                const isShort = count < requiredCountPerHour;
                return (
                  <Box key={time} flex={1} textAlign="center">
                    <Text fontSize="xs" fontWeight="medium" color={isShort ? "red.500" : "green.600"}>
                      {count}/{requiredCountPerHour}
                    </Text>
                  </Box>
                );
              })}
            </Flex>
          </Box>
        </Table.Cell>
      </Table.Row>

      {/* ポジション別の内訳（展開時のみ表示） */}
      {isExpanded &&
        positionCounts.map(({ position, counts }) => (
          <Table.Row key={position.id} bg="gray.50">
            <Table.Cell
              position="sticky"
              left={0}
              bg="gray.50"
              zIndex={1}
              borderRight="1px solid"
              borderColor="gray.100"
              pl={6}
            >
              <Flex align="center" gap={2}>
                <Box w="10px" h="10px" borderRadius="sm" bg={position.color} />
                <Text fontSize="xs" color="gray.600">
                  {position.name}
                </Text>
              </Flex>
            </Table.Cell>
            <Table.Cell colSpan={timeSlotsCount} p={0}>
              <Box position="relative" height="32px" px={`${TIME_AXIS_PADDING_PX}px`}>
                {/* グリッドライン */}
                <GridLines timeRange={timeRange} />
                <Flex position="relative" zIndex={1} height="100%" align="center">
                  {timeSlots.map((time, idx) => {
                    const count = counts[idx];
                    const required = Math.ceil(requiredCountPerHour / positions.length); // ポジション別の必要人数（仮）
                    return (
                      <Box key={time} flex={1} textAlign="center">
                        <Text fontSize="xs" fontWeight="medium" color={count < required ? "red.500" : "green.600"}>
                          {count}/{required}
                        </Text>
                      </Box>
                    );
                  })}
                </Flex>
              </Box>
            </Table.Cell>
          </Table.Row>
        ))}
    </>
  );
};
