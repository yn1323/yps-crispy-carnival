import { Box } from "@chakra-ui/react";
import type { DragMode, TimeRange } from "./types";
import { minutesToPercent } from "./utils/shiftOperations";

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

  const left = minutesToPercent(minMinutes, timeRange);
  const right = minutesToPercent(maxMinutes, timeRange);
  const width = right - left;

  // ドラッグ範囲が小さすぎる場合は表示しない
  if (width < 0.5) return null;

  // モードに応じた色とスタイル
  const getPreviewStyle = () => {
    switch (mode) {
      case "create":
        // 新規作成: 半透明グレー
        return {
          bg: "gray.400",
          opacity: 0.5,
          height: "16px",
          borderRadius: "md",
        };

      case "resize-start":
      case "resize-end":
        // 労働時間リサイズ: 半透明グレー + ボーダー
        return {
          bg: "gray.400",
          opacity: 0.6,
          height: "16px",
          borderRadius: "md",
          border: "2px dashed",
          borderColor: "gray.600",
        };

      case "position-resize-start":
      case "position-resize-end":
        // ポジションリサイズ: ポジション色
        return {
          bg: positionColor ?? "blue.400",
          opacity: 0.6,
          height: "28px",
          borderRadius: "md",
          border: "2px dashed",
          borderColor: "gray.600",
        };

      case "paint":
        // 塗り: ポジション色
        return {
          bg: positionColor ?? "blue.400",
          opacity: 0.5,
          height: "28px",
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
      left={`${left}%`}
      width={`${width}%`}
      top="50%"
      transform="translateY(-50%)"
      pointerEvents="none"
      zIndex={5}
      transition="all 0.05s ease-out"
      {...style}
    />
  );
};
