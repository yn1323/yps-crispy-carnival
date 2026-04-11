import { Box } from "@chakra-ui/react";
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
  if (!mode) return null;

  // 開始と終了を正規化
  const [minMinutes, maxMinutes] =
    startMinutes < currentMinutes ? [startMinutes, currentMinutes] : [currentMinutes, startMinutes];

  // 固定幅ベースでピクセル位置を計算
  const leftPx = minutesToPixel(minMinutes, timeRange);
  const rightPx = minutesToPixel(maxMinutes, timeRange);
  const widthPx = rightPx - leftPx;

  // ドラッグ範囲が小さすぎる場合は表示しない（5px未満）
  if (widthPx < 5) return null;

  // モードに応じた色とスタイル（希望シフトバーは編集不可のため、ポジション関連のみ）
  const getPreviewStyle = () => {
    switch (mode) {
      case "position-resize-start":
      case "position-resize-end":
        return {
          bg: positionColor ?? "blue.400",
          opacity: 0.6,
          height: "20px",
          borderRadius: "md",
          border: "2px dashed",
          borderColor: "gray.600",
        };

      case "paint":
        return {
          bg: positionColor ?? "blue.400",
          opacity: 0.5,
          height: "20px",
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
