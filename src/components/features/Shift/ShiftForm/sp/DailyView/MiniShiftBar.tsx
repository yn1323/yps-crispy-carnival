import { Box, Flex, Text } from "@chakra-ui/react";
import type { PositionSegment, TimeRange } from "../../types";
import { computeVisualBreaks } from "../../utils/shiftOperations";
import { timeToMinutes } from "../../utils/timeConversion";

type MiniShiftBarProps = {
  positions: PositionSegment[];
  timeRange: TimeRange;
};

export const MiniShiftBar = ({ positions, timeRange }: MiniShiftBarProps) => {
  const totalMinutes = (timeRange.end - timeRange.start) * 60;

  if (positions.length === 0) {
    return (
      <Box
        h="20px"
        w="100%"
        bg="gray.100"
        borderRadius="sm"
        borderWidth="1px"
        borderStyle="dashed"
        borderColor="gray.300"
      />
    );
  }

  const startLabel = `${String(timeRange.start).padStart(2, "0")}:00`;
  const endLabel = `${String(timeRange.end).padStart(2, "0")}:00`;

  return (
    <Box>
      <Box position="relative" h="20px" w="100%" bg="gray.100" borderRadius="sm" overflow="hidden">
        {positions.map((seg) => {
          const startMin = timeToMinutes(seg.start) - timeRange.start * 60;
          const endMin = timeToMinutes(seg.end) - timeRange.start * 60;
          const left = (startMin / totalMinutes) * 100;
          const width = ((endMin - startMin) / totalMinutes) * 100;

          return (
            <Box
              key={seg.id}
              position="absolute"
              left={`${left}%`}
              width={`${width}%`}
              h="100%"
              bg={seg.color}
              opacity={0.8}
            />
          );
        })}
        {/* ビジュアル休憩バー（ポジション間のギャップをストライプ表示） */}
        {computeVisualBreaks(positions).map((gap) => {
          const startMin = timeToMinutes(gap.start) - timeRange.start * 60;
          const endMin = timeToMinutes(gap.end) - timeRange.start * 60;
          const left = (startMin / totalMinutes) * 100;
          const width = ((endMin - startMin) / totalMinutes) * 100;

          return (
            <Box
              key={`break-${gap.start}-${gap.end}`}
              position="absolute"
              left={`${left}%`}
              width={`${width}%`}
              h="100%"
              backgroundImage="repeating-linear-gradient(45deg, #9CA3AF, #9CA3AF 3px, transparent 3px, transparent 6px)"
              opacity={0.5}
            />
          );
        })}
      </Box>
      <Flex justify="space-between" mt="2px">
        <Text fontSize="2xs" color="gray.500">
          {startLabel}
        </Text>
        <Text fontSize="2xs" color="gray.500">
          {endLabel}
        </Text>
      </Flex>
    </Box>
  );
};
