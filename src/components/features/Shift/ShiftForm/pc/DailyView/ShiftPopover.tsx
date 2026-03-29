import { Badge, Box, Button, Flex, IconButton, Popover, Portal, Text } from "@chakra-ui/react";
import { useEffect } from "react";
import { LuMinus, LuTrash2, LuX } from "react-icons/lu";
import type { ShiftData } from "../../types";
import { timeToMinutes } from "../../utils/timeConversion";

type ShiftPopoverProps = {
  shift: ShiftData | null;
  anchorRect: DOMRect | null;
  isOpen: boolean;
  isStaffSubmitted: boolean;
  onClose: () => void;
  onDeletePosition: (positionId: string) => void;
  onDeleteShift: () => void;
  isReadOnly?: boolean;
};

export const ShiftPopover = ({
  shift,
  anchorRect,
  isOpen,
  isStaffSubmitted,
  onClose,
  onDeletePosition,
  onDeleteShift,
  isReadOnly = false,
}: ShiftPopoverProps) => {
  // スクロール時に自動で閉じる
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => {
      onClose();
    };

    // capture: true でバブリング前にキャッチ
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen, onClose]);

  if (!shift) return null;

  return (
    <Popover.Root open={isOpen} onOpenChange={(details) => !details.open && onClose()}>
      {/* アンカー要素（カスタムポジショニングのため形式的） */}
      <Popover.Anchor asChild>
        <span />
      </Popover.Anchor>

      <Portal>
        <Popover.Positioner
          style={
            anchorRect
              ? (() => {
                  const POPOVER_WIDTH = 280;
                  const POPOVER_HALF_WIDTH = POPOVER_WIDTH / 2;
                  const EDGE_MARGIN = 16;

                  const centerX = anchorRect.left + anchorRect.width / 2;
                  const showBelow = anchorRect.top < 300;

                  // 画面端を考慮した水平位置調整
                  let adjustedX = centerX;
                  let transformX = "translateX(-50%)";

                  // 右端チェック: ポップオーバー右端がビューポートを超える
                  if (centerX + POPOVER_HALF_WIDTH > window.innerWidth - EDGE_MARGIN) {
                    adjustedX = window.innerWidth - EDGE_MARGIN;
                    transformX = "translateX(-100%)";
                  }
                  // 左端チェック: ポップオーバー左端がビューポートを超える
                  else if (centerX - POPOVER_HALF_WIDTH < EDGE_MARGIN) {
                    adjustedX = EDGE_MARGIN;
                    transformX = "translateX(0)";
                  }

                  return {
                    position: "fixed" as const,
                    left: `${adjustedX}px`,
                    top: showBelow ? `${anchorRect.bottom + 8}px` : `${anchorRect.top - 8}px`,
                    transform: showBelow ? transformX : `${transformX} translateY(-100%)`,
                  };
                })()
              : undefined
          }
        >
          <Popover.Content width="280px" boxShadow="lg" borderRadius="lg">
            <Popover.Body p={0}>
              {/* 希望時間 */}
              <Box p={3} borderBottom="1px solid" borderColor="gray.100">
                <Flex align="center" gap={2}>
                  <Text fontWeight="bold" fontSize="md" color="gray.700">
                    {shift.requestedTime
                      ? `希望: ${shift.requestedTime.start} - ${shift.requestedTime.end}`
                      : "希望: なし"}
                  </Text>
                  {!isStaffSubmitted && (
                    <Badge colorPalette="orange" size="sm">
                      未提出
                    </Badge>
                  )}
                </Flex>
              </Box>

              {/* ポジション一覧 */}
              {shift.positions.length > 0 && (
                <Box
                  p={3}
                  borderBottom={isReadOnly ? undefined : "1px solid"}
                  borderColor="gray.100"
                  maxH="200px"
                  overflowY="auto"
                >
                  {[...shift.positions]
                    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
                    .map((pos) => (
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
                            <LuMinus />
                          </IconButton>
                        )}
                      </Flex>
                    ))}
                </Box>
              )}

              {/* 全ポジションを削除ボタン（閲覧専用時は非表示） */}
              {!isReadOnly && (
                <Box p={3}>
                  <Button
                    size="sm"
                    variant="ghost"
                    colorPalette="red"
                    width="100%"
                    onClick={onDeleteShift}
                    justifyContent="flex-start"
                    disabled={shift.positions.length === 0}
                  >
                    <LuTrash2 />
                    <Text ml={2}>シフトを削除</Text>
                  </Button>
                </Box>
              )}
            </Popover.Body>

            <Popover.CloseTrigger position="absolute" top="2" right="2">
              <IconButton size="xs" variant="ghost" colorPalette="gray" opacity={0.6} aria-label="閉じる">
                <LuX />
              </IconButton>
            </Popover.CloseTrigger>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
};
