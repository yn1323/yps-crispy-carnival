import { Box, Flex, Portal, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { LuX } from "react-icons/lu";
import { IconButton } from "@/src/components/ui/Button";
import type { ShiftData } from "@/src/domains/shift/types";
import { usesPositionColorsAtom } from "../../stores";
import { buildShiftPopoverViewModel } from "./script";

type ShiftPopoverProps = {
  shift: ShiftData | null;
  anchorRect: DOMRect | null;
  isOpen: boolean;
  onClose: () => void;
};

const POPOVER_WIDTH = 280;
const POPOVER_HALF_WIDTH = POPOVER_WIDTH / 2;
const EDGE_MARGIN = 16;

/**
 * 閲覧専用の表示で、勤務のバーを押して開く欄。その日の勤務時間と休憩を読める。
 * 編集できる表示では、代わりに範囲を選ぶメニュー（`RangeAssignMenu`）を開く。
 */
export const ShiftPopover = ({ shift, anchorRect, isOpen, onClose }: ShiftPopoverProps) => {
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    // 表がスクロールすると勤務のバーから離れるため閉じる。欄の中の一覧のスクロールでは閉じない。
    const handleScroll = (event: Event) => {
      if (event.target instanceof Node && contentRef.current?.contains(event.target)) return;
      onClose();
    };
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [isOpen, onClose]);

  if (!isOpen || !shift || !anchorRect) return null;

  const centerX = anchorRect.left + anchorRect.width / 2;
  const showBelow = anchorRect.top < 300;

  let adjustedLeft: number;
  let adjustedTransform: string;
  if (centerX + POPOVER_HALF_WIDTH > window.innerWidth - EDGE_MARGIN) {
    adjustedLeft = window.innerWidth - EDGE_MARGIN;
    adjustedTransform = "translateX(-100%)";
  } else if (centerX - POPOVER_HALF_WIDTH < EDGE_MARGIN) {
    adjustedLeft = EDGE_MARGIN;
    adjustedTransform = "translateX(0)";
  } else {
    adjustedLeft = centerX;
    adjustedTransform = "translateX(-50%)";
  }

  const top = showBelow ? anchorRect.bottom + 8 : anchorRect.top - 8;
  const transform = showBelow ? adjustedTransform : `${adjustedTransform} translateY(-100%)`;
  const viewModel = buildShiftPopoverViewModel({ shift, mergesAcrossPositions: !usesPositionColors });

  return (
    <Portal>
      {/* オーバーレイ: クリックで閉じる */}
      <Box position="fixed" inset={0} zIndex={10099} onClick={onClose} style={{ background: "transparent" }} />
      <Box
        ref={contentRef}
        position="fixed"
        left={`${adjustedLeft}px`}
        top={`${top}px`}
        width={`${POPOVER_WIDTH}px`}
        bg="white"
        borderRadius="lg"
        border="1px solid"
        borderColor="gray.200"
        boxShadow="lg"
        zIndex={10100}
        style={{ transform }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 勤務時間の一覧 */}
        {viewModel.segments.length > 0 && (
          <Box p={3} pr={10} maxH="200px" overflowY="auto">
            {viewModel.segments.map((segment) => (
              <Flex key={segment.id} align="center" gap={2} minW={0} mb={2} _last={{ mb: 0 }}>
                {usesPositionColors && (
                  <Box boxSize="10px" borderRadius="full" flexShrink={0} style={{ background: segment.color }} />
                )}
                <Text fontSize="sm" color="gray.700">
                  {segment.timeLabel}
                </Text>
                {usesPositionColors && (
                  <Text fontSize="xs" color="gray.600" truncate>
                    {segment.positionName}
                  </Text>
                )}
              </Flex>
            ))}
          </Box>
        )}

        {/* 休憩 */}
        {viewModel.segments.length > 0 && viewModel.breakLabels.length > 0 && (
          <Box p={3} borderTop="1px solid" borderColor="gray.100">
            <Text fontSize="sm" color="gray.700">
              休憩：{viewModel.breakLabels.join(" / ")}
            </Text>
          </Box>
        )}

        {/* 閉じるボタン */}
        <IconButton
          size="xs"
          variant="ghost"
          colorPalette="gray"
          position="absolute"
          top="2"
          right="2"
          opacity={0.6}
          aria-label="閉じる"
          onClick={onClose}
        >
          <LuX />
        </IconButton>
      </Box>
    </Portal>
  );
};
