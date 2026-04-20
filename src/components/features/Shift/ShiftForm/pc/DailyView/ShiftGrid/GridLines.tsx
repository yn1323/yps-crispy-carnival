import { Box } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { TIME_AXIS_PADDING_PX } from "../../../constants";
import { hourWidthAtom } from "../../../stores";
import type { TimeRange } from "../../../types";

type GridLinesProps = {
  timeRange: TimeRange;
};

export const GridLines = ({ timeRange }: GridLinesProps) => {
  const hourWidth = useAtomValue(hourWidthAtom);
  const totalMinutes = (timeRange.end - timeRange.start) * 60;

  const lines: { x: number; isHourBoundary: boolean }[] = [];
  for (let minute = 0; minute <= totalMinutes; minute += timeRange.unit) {
    const x = TIME_AXIS_PADDING_PX + (minute / 60) * hourWidth;
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
