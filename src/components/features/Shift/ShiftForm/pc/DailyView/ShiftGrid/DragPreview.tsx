import { Box } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import type { RefObject } from "react";
import { minutesToPixel } from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import type { DragMode, TimeRange } from "@/src/domains/shift/types";
import { useWorkColor } from "../../../detailParts";
import { hourWidthAtom } from "../../../stores";

type DragPreviewProps = {
  mode: DragMode;
  startMinutes: number;
  currentMinutes: number;
  timeRange: TimeRange;
  positionColor?: string | null;
  /** 選び終えた範囲の面。メニューを、この面のすぐ上に出すために使う。 */
  anchorRef?: RefObject<HTMLDivElement | null>;
};

export const DragPreview = ({
  mode,
  startMinutes,
  currentMinutes,
  timeRange,
  positionColor,
  anchorRef,
}: DragPreviewProps) => {
  const hourWidth = useAtomValue(hourWidthAtom);
  const getWorkColor = useWorkColor();
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

      // 入れる勤務と同じ色にする。ポジションを塗り分ける表示では、次に入れるポジションの色になる。
      case "paint":
        return {
          bg: getWorkColor(positionColor ? { color: positionColor } : undefined, "#0d9488"),
          opacity: 0.5,
          height: "22px",
          borderRadius: "md",
        };

      // 選んだ範囲は、どのポジションの色の上でも見えるよう、白の半透明の面と灰色の枠線で示す。
      case "select":
        return {
          bg: "whiteAlpha.600",
          height: "28px",
          borderRadius: "sm",
          border: "2px solid",
          borderColor: "gray.400",
        };

      // 休憩は、勤務のバーの上に重ねて見えるよう、濃い灰色にする。
      case "break":
        return {
          bg: "gray.700",
          opacity: 0.55,
          height: "22px",
          borderRadius: "sm",
        };

      default:
        return {};
    }
  };

  const style = getPreviewStyle();

  return (
    <Box
      ref={anchorRef}
      data-range-selection={anchorRef ? "" : undefined}
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
