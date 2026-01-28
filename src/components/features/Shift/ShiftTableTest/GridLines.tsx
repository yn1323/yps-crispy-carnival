import { Box } from "@chakra-ui/react";
import { HOUR_WIDTH_PX, TIME_AXIS_PADDING_PX, type TimeRange } from "./types";

type GridLinesProps = {
  timeRange: TimeRange;
};

export const GridLines = ({ timeRange }: GridLinesProps) => {
  const totalMinutes = (timeRange.end - timeRange.start) * 60;

  // timeRange.unit刻みで境界線を生成（固定幅ベース）
  const lines: { x: number; isHourBoundary: boolean }[] = [];
  for (let minute = 0; minute <= totalMinutes; minute += timeRange.unit) {
    const x = TIME_AXIS_PADDING_PX + (minute / 60) * HOUR_WIDTH_PX;
    const isHourBoundary = minute % 60 === 0;
    lines.push({ x, isHourBoundary });
  }

  return (
    <Box position="absolute" inset={0} pointerEvents="none" zIndex={0}>
      {lines.map(({ x, isHourBoundary }, index) => (
        <Box
          key={index}
          position="absolute"
          left={`${x}px`}
          top={0}
          bottom={0}
          borderLeft="1px dashed"
          borderColor={isHourBoundary ? "gray.300" : "gray.200"}
        />
      ))}
    </Box>
  );
};
