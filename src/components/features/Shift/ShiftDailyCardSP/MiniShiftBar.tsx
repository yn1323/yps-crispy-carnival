import { Box, Flex, Text } from "@chakra-ui/react";
import type { MiniShiftBarProps } from "./types";

const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
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

  // 最初のセグメントの開始時刻と最後のセグメントの終了時刻を取得
  const sortedPositions = [...positions].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const firstStart = sortedPositions[0].start;
  const lastEnd = sortedPositions[sortedPositions.length - 1].end;

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
              opacity={seg.positionName === "休憩" ? 0.3 : 0.8}
            />
          );
        })}
      </Box>
      <Flex justify="space-between" mt="2px">
        <Text fontSize="2xs" color="gray.500">
          {firstStart}
        </Text>
        <Text fontSize="2xs" color="gray.500">
          {lastEnd}
        </Text>
      </Flex>
    </Box>
  );
};
