import { Box, Flex, Icon, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { type PositionType, type ShiftData, TIME_AXIS_PADDING_PX, type TimeRange } from "./types";
import { percentToCalcLeft } from "./utils/shiftOperations";

type SummaryRowProps = {
  shifts: ShiftData[];
  positions: PositionType[];
  timeRange: TimeRange;
  date: string;
  requiredCountPerHour?: number; // 時間帯ごとの必要人数（デフォルト: 5）
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

export const SummaryRow = ({ shifts, positions, timeRange, date, requiredCountPerHour = 5 }: SummaryRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

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

  // 時間ラベル（正時のみ、パーセント位置計算）- TimeHeaderと同じアプローチ
  const timeLabels = useMemo(() => {
    const totalRangeMinutes = (timeRange.end - timeRange.start) * 60;
    const labels: { hour: number; percent: number }[] = [];
    for (let hour = timeRange.start; hour <= timeRange.end; hour++) {
      const minutes = (hour - timeRange.start) * 60;
      const percent = (minutes / totalRangeMinutes) * 100;
      labels.push({ hour, percent });
    }
    return labels;
  }, [timeRange]);

  return (
    <Box mt={4} border="1px solid" borderColor="gray.200" borderRadius="lg" overflow="hidden">
      {/* 時間ヘッダー行（正時のみラベル表示、縦線と同じ位置） */}
      <Flex align="center" bg="gray.100" borderBottom="1px solid" borderColor="gray.200">
        <Box w="120px" borderRight="1px solid" borderColor="gray.200" />
        <Box flex={1} position="relative" height="24px" px={`${TIME_AXIS_PADDING_PX}px`}>
          {timeLabels.map(({ hour, percent }) => (
            <Text
              key={hour}
              position="absolute"
              left={percentToCalcLeft(percent)}
              top="50%"
              transform="translate(-50%, -50%)"
              fontSize="xs"
              color="gray.500"
              whiteSpace="nowrap"
            >
              {hour}時
            </Text>
          ))}
        </Box>
      </Flex>

      {/* 合計行（クリックで展開/折りたたみ） */}
      <Flex
        align="center"
        bg="gray.50"
        cursor="pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        _hover={{ bg: "gray.100" }}
        transition="background 0.15s"
      >
        <Flex align="center" px={3} py={2} w="120px" borderRight="1px solid" borderColor="gray.200">
          <Icon as={isExpanded ? LuChevronDown : LuChevronRight} mr={1} color="gray.600" />
          <Text fontWeight="bold" color="gray.700" fontSize="sm">
            合計
          </Text>
        </Flex>
        <Box flex={1} position="relative" px={`${TIME_AXIS_PADDING_PX}px`}>
          {/* グリッドライン */}
          {timeLabels.map(({ hour, percent }) => (
            <Box
              key={`grid-${hour}`}
              position="absolute"
              left={percentToCalcLeft(percent)}
              top={0}
              bottom={0}
              borderLeft="1px dashed"
              borderColor="gray.300"
              pointerEvents="none"
              zIndex={0}
            />
          ))}
          <Flex position="relative" zIndex={1}>
            {timeSlots.map((time, idx) => {
              const count = totalCounts[idx];
              const isShort = count < requiredCountPerHour;
              return (
                <Box key={time} flex={1} textAlign="center" py={2} px={1}>
                  <Text fontSize="xs" fontWeight="medium" color={isShort ? "red.500" : "green.600"}>
                    {count}/{requiredCountPerHour}
                  </Text>
                </Box>
              );
            })}
          </Flex>
        </Box>
      </Flex>

      {/* ポジション別の内訳（展開時のみ表示） */}
      {isExpanded && (
        <Box>
          {positionCounts.map(({ position, counts }) => (
            <Flex key={position.id} align="center" borderTop="1px solid" borderColor="gray.100" bg="white">
              <Flex align="center" px={3} py={2} w="120px" borderRight="1px solid" borderColor="gray.100" gap={2}>
                <Box w="10px" h="10px" borderRadius="sm" bg={position.color} />
                <Text fontSize="xs" color="gray.600">
                  {position.name}
                </Text>
              </Flex>
              <Box flex={1} position="relative" px={`${TIME_AXIS_PADDING_PX}px`}>
                {/* グリッドライン */}
                {timeLabels.map(({ hour, percent }) => (
                  <Box
                    key={`grid-${hour}`}
                    position="absolute"
                    left={percentToCalcLeft(percent)}
                    top={0}
                    bottom={0}
                    borderLeft="1px dashed"
                    borderColor="gray.300"
                    pointerEvents="none"
                    zIndex={0}
                  />
                ))}
                <Flex position="relative" zIndex={1}>
                  {timeSlots.map((time, idx) => {
                    const count = counts[idx];
                    const required = Math.ceil(requiredCountPerHour / positions.length); // ポジション別の必要人数（仮）
                    return (
                      <Box key={time} flex={1} textAlign="center" py={2} px={1}>
                        <Text fontSize="xs" color="gray.500">
                          {count}/{required}
                        </Text>
                      </Box>
                    );
                  })}
                </Flex>
              </Box>
            </Flex>
          ))}
        </Box>
      )}
    </Box>
  );
};
