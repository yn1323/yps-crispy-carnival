import { Box, Flex, Icon, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { PositionType, ShiftData, TimeRange } from "./types";

type SummaryRowProps = {
  shifts: ShiftData[];
  positions: PositionType[];
  timeRange: TimeRange;
  date: string;
  requiredCountPerHour?: number; // 時間帯ごとの必要人数（デフォルト: 5）
};

// 特定時刻に稼働しているシフト数をカウント
const countShiftsAtTime = (shifts: ShiftData[], targetHour: number): number => {
  const targetTime = `${targetHour.toString().padStart(2, "0")}:00`;
  return shifts.filter((shift) => {
    if (!shift.workingTime) return false;
    return shift.workingTime.start <= targetTime && targetTime < shift.workingTime.end;
  }).length;
};

// 特定時刻に特定ポジションで稼働している人数をカウント
const countPositionAtTime = (shifts: ShiftData[], positionId: string, targetHour: number): number => {
  const targetTime = `${targetHour.toString().padStart(2, "0")}:00`;
  return shifts.filter((shift) => {
    if (!shift.workingTime) return false;
    // 労働時間内かチェック
    if (!(shift.workingTime.start <= targetTime && targetTime < shift.workingTime.end)) {
      return false;
    }
    // 該当ポジションがこの時間帯にあるかチェック
    return shift.positions.some(
      (pos) => pos.positionId === positionId && pos.start <= targetTime && targetTime < pos.end,
    );
  }).length;
};

// 時間スロットを生成
const generateTimeSlots = (start: number, end: number): number[] => {
  const slots: number[] = [];
  for (let hour = start; hour <= end; hour++) {
    slots.push(hour);
  }
  return slots;
};

export const SummaryRow = ({ shifts, positions, timeRange, date, requiredCountPerHour = 5 }: SummaryRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // 選択日のシフトのみフィルタ
  const dateShifts = useMemo(() => shifts.filter((s) => s.date === date), [shifts, date]);

  // 時間スロット
  const timeSlots = useMemo(() => generateTimeSlots(timeRange.start, timeRange.end), [timeRange.start, timeRange.end]);

  // 時間帯ごとの合計カウント
  const totalCounts = useMemo(() => {
    return timeSlots.map((hour) => countShiftsAtTime(dateShifts, hour));
  }, [dateShifts, timeSlots]);

  // ポジション別のカウント
  const positionCounts = useMemo(() => {
    return positions.map((position) => ({
      position,
      counts: timeSlots.map((hour) => countPositionAtTime(dateShifts, position.id, hour)),
    }));
  }, [dateShifts, positions, timeSlots]);

  return (
    <Box mt={4} border="1px solid" borderColor="gray.200" borderRadius="lg" overflow="hidden">
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
        <Flex flex={1}>
          {timeSlots.map((hour, idx) => {
            const count = totalCounts[idx];
            const isShort = count < requiredCountPerHour;
            return (
              <Box key={hour} flex={1} textAlign="center" py={2} px={1}>
                <Text fontSize="xs" fontWeight="medium" color={isShort ? "red.500" : "green.600"}>
                  {count}/{requiredCountPerHour}
                </Text>
              </Box>
            );
          })}
        </Flex>
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
              <Flex flex={1}>
                {timeSlots.map((hour, idx) => {
                  const count = counts[idx];
                  const required = Math.ceil(requiredCountPerHour / positions.length); // ポジション別の必要人数（仮）
                  return (
                    <Box key={hour} flex={1} textAlign="center" py={2} px={1}>
                      <Text fontSize="xs" color="gray.500">
                        {count}/{required}
                      </Text>
                    </Box>
                  );
                })}
              </Flex>
            </Flex>
          ))}
        </Box>
      )}
    </Box>
  );
};
