import { Box } from "@chakra-ui/react";
import type { TimeRange } from "./types";
import { percentToCalcLeft } from "./utils/shiftOperations";

type GridLinesProps = {
  timeRange: TimeRange;
};

export const GridLines = ({ timeRange }: GridLinesProps) => {
  const totalMinutes = (timeRange.end - timeRange.start) * 60;

  // timeRange.unit刻みで境界線を生成
  const lines: { percent: number; isHourBoundary: boolean }[] = [];
  for (let minute = 0; minute <= totalMinutes; minute += timeRange.unit) {
    const percent = (minute / totalMinutes) * 100;
    const isHourBoundary = minute % 60 === 0;
    lines.push({ percent, isHourBoundary });
  }

  return (
    <Box position="absolute" inset={0} pointerEvents="none" zIndex={0}>
      {lines.map(({ percent, isHourBoundary }, index) => (
        <Box
          key={index}
          position="absolute"
          left={percentToCalcLeft(percent)}
          top={0}
          bottom={0}
          borderLeft="1px dashed"
          borderColor={isHourBoundary ? "gray.300" : "gray.200"}
        />
      ))}
    </Box>
  );
};
