import { Box } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { hourWidthAtom } from "../../../stores";
import type { DragMode, TimeRange } from "../../../types";
import { minutesToPixel } from "../../../utils/timeConversion";

type DragPreviewProps = {
  mode: DragMode;
  startMinutes: number;
  currentMinutes: number;
  timeRange: TimeRange;
  positionColor?: string | null;
};

export const DragPreview = ({ mode, startMinutes, currentMinutes, timeRange, positionColor }: DragPreviewProps) => {
  const hourWidth = useAtomValue(hourWidthAtom);
  if (!mode) return null;

  const [minMinutes, maxMinutes] =
    startMinutes < currentMinutes ? [startMinutes, currentMinutes] : [currentMinutes, startMinutes];

  const leftPx = minutesToPixel(minMinutes, timeRange, hourWidth);
  const rightPx = minutesToPixel(maxMinutes, timeRange, hourWidth);
  const widthPx = rightPx - leftPx;

  if (widthPx < 5) return null;

  const getPreviewStyle = () => {
    switch (mode) {
      case "position-resize-start":
      case "position-resize-end":
        return {
          bg: positionColor ?? "#0d9488",
          opacity: 0.6,
          height: "22px",
          borderRadius: "md",
          border: "2px dashed",
          borderColor: "gray.600",
        };

      case "paint":
        return {
          bg: "#0d9488",
          opacity: 0.5,
          height: "22px",
          borderRadius: "md",
        };

      default:
        return {};
    }
  };

  const style = getPreviewStyle();

  return (
    <Box
      position="absolute"
      left={`${leftPx}px`}
      width={`${widthPx}px`}
      top="50%"
      transform="translateY(-50%)"
      pointerEvents="none"
      zIndex={5}
      transition="all 0.05s ease-out"
      {...style}
    />
  );
};
