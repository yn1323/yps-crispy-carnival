import { Box, Flex, Icon, IconButton, Table, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import { LuChevronDown, LuChevronRight, LuHash, LuInfo, LuPalette } from "react-icons/lu";
import { Tooltip } from "@/src/components/ui/tooltip";
import { GridLines } from "./GridLines";
import {
  FILL_RATE_COLORS,
  type PositionType,
  type ShiftData,
  type SummaryDisplayMode,
  TIME_AXIS_PADDING_PX,
  type TimeRange,
} from "./types";

type SummaryRowProps = {
  shifts: ShiftData[];
  positions: PositionType[];
  timeRange: TimeRange;
  date: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  requiredCountPerHour?: number; // 時間帯ごとの必要人数（デフォルト: 5）
  timeSlotsCount: number; // colSpan用
  displayMode: SummaryDisplayMode;
  onDisplayModeChange: (mode: SummaryDisplayMode) => void;
};

// 特定時刻にポジションで稼働している人数をカウント（未提出者も含む）
const countShiftsAtTime = (shifts: ShiftData[], targetTime: string): number => {
  return shifts.filter((shift) => {
    return shift.positions.some((pos) => pos.start <= targetTime && targetTime < pos.end);
  }).length;
};

// 特定時刻に特定ポジションで稼働している人数をカウント（未提出者も含む）
const countPositionAtTime = (shifts: ShiftData[], positionId: string, targetTime: string): number => {
  return shifts.filter((shift) => {
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

// カウント配列からCSS linear-gradientを生成
const buildGradientStyle = (counts: number[], required: number): string => {
  if (counts.length === 0) return "transparent";
  if (counts.length === 1) return getFillRateColor(counts[0], required).bg;

  const stops = counts.map((count, i) => {
    const percent = (i / (counts.length - 1)) * 100;
    const { bg } = getFillRateColor(count, required);
    return `${bg} ${percent}%`;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
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
  displayMode,
  onDisplayModeChange,
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

  // 合計行のグラデーションスタイル
  const totalGradient = useMemo(
    () => buildGradientStyle(totalCounts, requiredCountPerHour),
    [totalCounts, requiredCountPerHour],
  );

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
          zIndex={11}
          borderRight="1px solid"
          borderTop="1px solid"
          borderColor="gray.200"
          _hover={{ bg: "gray.200" }}
        >
          <Flex align="center" gap={2}>
            <Icon as={isExpanded ? LuChevronDown : LuChevronRight} color="gray.600" />
            <Text fontWeight="bold" color="gray.700" fontSize="sm" whiteSpace="nowrap">
              充足度
            </Text>
            <IconButton
              aria-label={displayMode === "color" ? "数値表示に切り替え" : "色表示に切り替え"}
              size="2xs"
              variant="solid"
              colorPalette="teal"
              onClick={(e) => {
                e.stopPropagation();
                onDisplayModeChange(displayMode === "color" ? "number" : "color");
              }}
            >
              {displayMode === "color" ? <LuPalette /> : <LuHash />}
            </IconButton>
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
              <Icon as={LuInfo} boxSize={3.5} color="gray.400" cursor="help" onClick={(e) => e.stopPropagation()} />
            </Tooltip>
          </Flex>
        </Table.Cell>
        <Table.Cell colSpan={timeSlotsCount} p={0} borderTop="1px solid" borderColor="gray.200">
          <Box position="relative" height="40px" px={`${TIME_AXIS_PADDING_PX}px`}>
            {/* グリッドライン */}
            <GridLines timeRange={timeRange} />
            {displayMode === "color" ? (
              <Box position="relative" zIndex={1} height="100%" display="flex" alignItems="center" px={1}>
                <Box width="100%" height="20px" borderRadius="sm" background={totalGradient} />
              </Box>
            ) : (
              <Flex position="relative" zIndex={1} height="100%" align="center">
                {timeSlots.map((time, idx) => {
                  const count = totalCounts[idx];
                  const { text } = getFillRateColor(count, requiredCountPerHour);
                  return (
                    <Box key={time} flex={1} textAlign="center">
                      <Text fontSize="xs" fontWeight="medium" color={text}>
                        {count}/{requiredCountPerHour}
                      </Text>
                    </Box>
                  );
                })}
              </Flex>
            )}
          </Box>
        </Table.Cell>
      </Table.Row>
      {/* ポジション別の内訳（展開時のみ表示） */}
      {isExpanded &&
        positionCounts.map(({ position, counts }) => {
          const required = Math.ceil(requiredCountPerHour / positions.length);
          const positionGradient = buildGradientStyle(counts, required);

          return (
            <Table.Row key={position.id} bg="gray.50">
              <Table.Cell
                position="sticky"
                left={0}
                bg="gray.50"
                zIndex={11}
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
                  {displayMode === "color" ? (
                    <Box position="relative" zIndex={1} height="100%" display="flex" alignItems="center" px={1}>
                      <Box width="100%" height="16px" borderRadius="sm" background={positionGradient} />
                    </Box>
                  ) : (
                    <Flex position="relative" zIndex={1} height="100%" align="center">
                      {timeSlots.map((time, idx) => {
                        const count = counts[idx];
                        const { text } = getFillRateColor(count, required);
                        return (
                          <Box key={time} flex={1} textAlign="center">
                            <Text fontSize="xs" fontWeight="medium" color={text}>
                              {count}/{required}
                            </Text>
                          </Box>
                        );
                      })}
                    </Flex>
                  )}
                </Box>
              </Table.Cell>
            </Table.Row>
          );
        })}
    </>
  );
};
