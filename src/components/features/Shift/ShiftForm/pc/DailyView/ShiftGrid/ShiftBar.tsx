import { Box, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { memo } from "react";
import type { LinkedResizeTarget, ShiftData, TimeRange } from "@/src/domains/shift/types";
import { hourWidthAtom } from "../../../stores";
import { buildShiftBarViewModel } from "./script";

type ShiftBarProps = {
  shift: ShiftData;
  timeRange: TimeRange;
  onHover: (shiftId: string | null) => void;
  onClick: (shiftId: string, positionId: string | null, e: React.MouseEvent) => void;
  isDragging?: boolean;
  isReadOnly?: boolean;
  currentMinutes?: number;
  linkedTarget?: LinkedResizeTarget | null;
};

const BAR_BG = "#0d9488"; // teal.600
const BAR_SHADOW = "0 1px 2px rgba(13,148,136,0.3)";
const STRIPE_STYLE = {
  backgroundImage: "repeating-linear-gradient(45deg, #9CA3AF, #9CA3AF 4px, transparent 4px, transparent 8px)",
};
const BORDER_RADIUS_PROPS = {
  isolated: { borderRadius: "md" },
  start: {
    borderTopLeftRadius: "md",
    borderBottomLeftRadius: "md",
    borderTopRightRadius: "0",
    borderBottomRightRadius: "0",
  },
  middle: { borderRadius: "0" },
  end: {
    borderTopLeftRadius: "0",
    borderBottomLeftRadius: "0",
    borderTopRightRadius: "md",
    borderBottomRightRadius: "md",
  },
} as const;

export const ShiftBar = memo(function ShiftBar({
  shift,
  timeRange,
  onHover,
  onClick,
  isDragging = false,
  isReadOnly = false,
  currentMinutes,
  linkedTarget,
}: ShiftBarProps) {
  const hourWidth = useAtomValue(hourWidthAtom);
  const viewModel = buildShiftBarViewModel({
    shift,
    timeRange,
    hourWidth,
    isReadOnly,
    currentMinutes,
    linkedTarget,
  });
  if (!viewModel) return null;

  const handleMouseEnter = () => onHover(viewModel.shiftId);
  const handleMouseLeave = () => onHover(null);

  return (
    <Box
      position="absolute"
      left={`${viewModel.left}px`}
      width={`${viewModel.width}px`}
      height="100%"
      top={0}
      pointerEvents={isDragging ? "none" : "auto"}
    >
      {/* 希望シフトバー（灰色の点線、「希望：HH:MM-HH:MM」ラベルを左寄せで表示） */}
      {viewModel.requestedBars.map((request) => (
        <Box
          key={request.key}
          position="absolute"
          left={`${request.left}px`}
          width={`${request.width}px`}
          height="28px"
          bg="gray.50"
          border="1.5px dashed"
          borderColor="gray.400"
          borderRadius="md"
          top="50%"
          transform="translateY(-50%)"
          pointerEvents="none"
          display="flex"
          alignItems="center"
          px="10px"
          zIndex={1}
        >
          <Text textStyle="2xs" fontWeight={600} color="gray.500" whiteSpace="nowrap" fontVariantNumeric="tabular-nums">
            {request.label}
          </Text>
        </Box>
      ))}

      {/* 勤務ポジション（teal） */}
      {viewModel.workBars.map((bar) => (
        <Box
          key={bar.key}
          position="absolute"
          left={`${bar.left}px`}
          width={`${bar.width}px`}
          height="22px"
          bg={BAR_BG}
          boxShadow={BAR_SHADOW}
          {...BORDER_RADIUS_PROPS[bar.edgeShape]}
          top="50%"
          transform="translateY(-50%)"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={(event) => onClick(viewModel.shiftId, bar.positionId, event)}
          cursor="inherit"
          transition={bar.isResizing ? "width 0.05s ease-out, left 0.05s ease-out" : "all 0.15s"}
          _hover={{ filter: "brightness(1.05)" }}
          zIndex={2}
        />
      ))}

      {/* 休憩ストライプ（勤務ポジション間のギャップ、または break 位置セグメント） */}
      {viewModel.breakBars.map((bar) => (
        <Box
          key={bar.key}
          position="absolute"
          left={`${bar.left}px`}
          width={`${bar.width}px`}
          height="22px"
          borderRadius="0"
          top="50%"
          transform="translateY(-50%)"
          opacity={0.6}
          pointerEvents="none"
          zIndex={3}
          style={STRIPE_STYLE}
        />
      ))}

      {/* 勤務時刻ラベル（バーの左側に白文字、リサイズ中は非表示） */}
      {viewModel.workLabel && (
        <Box
          position="absolute"
          left={`${viewModel.workLabel.left}px`}
          width={`${viewModel.workLabel.width}px`}
          top="50%"
          transform="translateY(-50%)"
          height="22px"
          display="flex"
          alignItems="center"
          justifyContent="flex-start"
          px="8px"
          pointerEvents="none"
          zIndex={4}
        >
          <Text
            textStyle="caption"
            fontWeight={600}
            color="white"
            fontVariantNumeric="tabular-nums"
            whiteSpace="nowrap"
          >
            {viewModel.workLabel.label}
          </Text>
        </Box>
      )}
    </Box>
  );
});
