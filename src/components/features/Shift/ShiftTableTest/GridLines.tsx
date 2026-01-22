import { Box } from "@chakra-ui/react";
import type { TimeRange } from "./types";
import { percentToCalcLeft } from "./utils/shiftOperations";

type GridLinesProps = {
  timeRange: TimeRange;
};

export const GridLines = ({ timeRange }: GridLinesProps) => {
  const totalRangeMinutes = (timeRange.end - timeRange.start) * 60;

  // 各時間の境界線を生成（1時間ごと、開始時刻も含む）
  const lines: number[] = [];
  for (let hour = timeRange.start; hour <= timeRange.end; hour++) {
    const minutes = (hour - timeRange.start) * 60;
    const percent = (minutes / totalRangeMinutes) * 100;
    lines.push(percent);
  }

  return (
    <Box position="absolute" inset={0} pointerEvents="none" zIndex={0}>
      {lines.map((percent, index) => (
        <Box
          key={index}
          position="absolute"
          left={percentToCalcLeft(percent)}
          top={0}
          bottom={0}
          borderLeft="1px dashed"
          borderColor="gray.300"
        />
      ))}
    </Box>
  );
};
