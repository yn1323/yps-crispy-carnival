import { Box, Text } from "@chakra-ui/react";
import { HOUR_WIDTH_PX, TIME_AXIS_PADDING_PX } from "../../constants";
import type { TimeRange } from "../../types";
import { getTimeAxisWidth } from "../../utils/timeConversion";

type TimeHeaderProps = {
  timeRange: TimeRange;
};

export const TimeHeader = ({ timeRange }: TimeHeaderProps) => {
  // 各時間ラベルの位置を計算（固定幅ベース）
  const timeLabels: { hour: number; x: number }[] = [];
  for (let hour = timeRange.start; hour <= timeRange.end; hour++) {
    const x = TIME_AXIS_PADDING_PX + (hour - timeRange.start) * HOUR_WIDTH_PX;
    timeLabels.push({ hour, x });
  }

  const totalWidth = getTimeAxisWidth(timeRange);

  return (
    <Box position="relative" height="24px" bg="white" width={`${totalWidth}px`} minWidth="100%">
      {timeLabels.map(({ hour, x }) => (
        <Text
          key={hour}
          position="absolute"
          left={`${x}px`}
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
