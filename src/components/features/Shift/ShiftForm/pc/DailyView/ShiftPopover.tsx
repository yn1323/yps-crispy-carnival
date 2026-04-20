import { Badge, Box, Flex, IconButton, Portal, Text } from "@chakra-ui/react";
import { useEffect } from "react";
import { LuTrash2, LuX } from "react-icons/lu";
import { BREAK_POSITION } from "../../constants";
import type { ShiftData } from "../../types";
import { timeToMinutes } from "../../utils/timeConversion";

type ShiftPopoverProps = {
  shift: ShiftData | null;
  anchorRect: DOMRect | null;
  isOpen: boolean;
  isStaffSubmitted: boolean;
  onClose: () => void;
  onDeletePosition: (positionId: string) => void;
  isReadOnly?: boolean;
};

const POPOVER_WIDTH = 280;
const POPOVER_HALF_WIDTH = POPOVER_WIDTH / 2;
const EDGE_MARGIN = 16;

export const ShiftPopover = ({
  shift,
  anchorRect,
  isOpen,
  isStaffSubmitted,
  onClose,
  onDeletePosition,
  isReadOnly = false,
}: ShiftPopoverProps) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = () => onClose();
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

  const visibleSegments = [...shift.positions]
    .filter((p) => p.positionName !== BREAK_POSITION.name && p.positionId !== BREAK_POSITION.id)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  return (
    <Portal>
      {/* オーバーレイ: クリックで閉じる */}
      <Box position="fixed" inset={0} zIndex={10099} onClick={onClose} style={{ background: "transparent" }} />
      <Box
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
        {/* 希望時間（readonly時は非表示） */}
        {!isReadOnly && (
          <Box p={3} borderBottom="1px solid" borderColor="gray.100">
            <Flex align="center" gap={2} pr={8}>
              <Text fontWeight="bold" fontSize="sm" color="gray.700">
                {shift.requestedTime ? `希望: ${shift.requestedTime.start} - ${shift.requestedTime.end}` : "希望: なし"}
              </Text>
              {!isStaffSubmitted && (
                <Badge colorPalette="orange" size="sm">
                  未提出
                </Badge>
              )}
            </Flex>
          </Box>
        )}

        {/* ポジション一覧 */}
        {visibleSegments.length > 0 && (
          <Box p={3} maxH="200px" overflowY="auto">
            {visibleSegments.map((pos) => (
              <Flex key={pos.id} align="center" justify="space-between" mb={2} _last={{ mb: 0 }}>
                <Text fontSize="sm" color="gray.700">
                  {pos.start}-{pos.end}
                </Text>
                {!isReadOnly && (
                  <IconButton
                    size="xs"
                    variant="ghost"
                    colorPalette="gray"
                    aria-label="時間帯を削除"
                    onClick={() => onDeletePosition(pos.id)}
                    _hover={{ color: "red.500" }}
                  >
                    <LuTrash2 />
                  </IconButton>
                )}
              </Flex>
            ))}
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
