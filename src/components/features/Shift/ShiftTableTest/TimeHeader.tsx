import { Box, Text } from "@chakra-ui/react";
import type { TimeRange } from "./types";
import { percentToCalcLeft } from "./utils/shiftOperations";

type TimeHeaderProps = {
  timeRange: TimeRange;
};

export const TimeHeader = ({ timeRange }: TimeHeaderProps) => {
  const totalRangeMinutes = (timeRange.end - timeRange.start) * 60;

  // 各時間ラベルの位置を計算（縦線と同じ位置）
  const timeLabels: { hour: number; percent: number }[] = [];
  for (let hour = timeRange.start; hour <= timeRange.end; hour++) {
    const minutes = (hour - timeRange.start) * 60;
    const percent = (minutes / totalRangeMinutes) * 100;
    timeLabels.push({ hour, percent });
  }

  return (
    <Box position="relative" height="24px" bg="gray.50" px={5}>
      {timeLabels.map(({ hour, percent }) => (
        <Text
          key={hour}
          position="absolute"
          left={percentToCalcLeft(percent)}
          top="50%"
          transform="translate(-50%, -50%)"
          fontSize="xs"
          color="gray.600"
          whiteSpace="nowrap"
        >
          {hour}時
        </Text>
      ))}
    </Box>
  );
};
