import { Box } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import type { TimeRange } from "@/src/domains/shift/types";
import { hourWidthAtom } from "../../../stores";
import {
  getDisplayEndMinutes,
  getDisplayStartMinutes,
  getEditableEndMinutes,
  getEditableStartMinutes,
  minutesToPixel,
} from "../../../utils/timelineGeometry";

type NonEditableTimeOverlayProps = {
  timeRange: TimeRange;
};

export const NonEditableTimeOverlay = ({ timeRange }: NonEditableTimeOverlayProps) => {
  const hourWidth = useAtomValue(hourWidthAtom);
  const displayStart = getDisplayStartMinutes(timeRange);
  const displayEnd = getDisplayEndMinutes(timeRange);
  const editableStart = getEditableStartMinutes(timeRange);
  const editableEnd = getEditableEndMinutes(timeRange);

  const ranges = [
    { start: displayStart, end: editableStart },
    { start: editableEnd, end: displayEnd },
  ].filter((range) => range.end > range.start);

  if (ranges.length === 0) return null;

  return (
    <Box position="absolute" inset={0} pointerEvents="none" zIndex={0}>
      {ranges.map((range) => {
        const leftPx = minutesToPixel(range.start, timeRange, hourWidth);
        const rightPx = minutesToPixel(range.end, timeRange, hourWidth);
        return (
          <Box
            key={`${range.start}-${range.end}`}
            position="absolute"
            left={`${leftPx}px`}
            top={0}
            bottom={0}
            width={`${rightPx - leftPx}px`}
            bg="gray.100"
            opacity={0.85}
          />
        );
      })}
    </Box>
  );
};
