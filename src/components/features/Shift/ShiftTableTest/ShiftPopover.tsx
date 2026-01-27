import { Box, Button, Flex, IconButton, Popover, Portal, Text } from "@chakra-ui/react";
import { useEffect } from "react";
import { LuMinus, LuTrash2, LuX } from "react-icons/lu";
import type { ShiftData } from "./types";

type ShiftPopoverProps = {
  shift: ShiftData | null;
  anchorEl: HTMLElement | null;
  isOpen: boolean;
  onClose: () => void;
  onDeletePosition: (positionId: string) => void;
  onDeleteShift: () => void;
};

export const ShiftPopover = ({
  shift,
  anchorEl,
  isOpen,
  onClose,
  onDeletePosition,
  onDeleteShift,
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

  if (!shift || !shift.requestedTime) return null;

  return (
    <Popover.Root open={isOpen} onOpenChange={(details) => !details.open && onClose()}>
      {/* アンカー要素を参照 */}
      <Popover.Anchor asChild>{anchorEl ? <span /> : <span />}</Popover.Anchor>

      <Portal>
        <Popover.Positioner
          style={
            anchorEl
              ? (() => {
                  const rect = anchorEl.getBoundingClientRect();
                  const centerX = rect.left + rect.width / 2;
                  const showBelow = rect.top < 300;
                  return {
                    position: "fixed" as const,
                    left: `${centerX}px`,
                    top: showBelow ? `${rect.bottom + 8}px` : `${rect.top - 8}px`,
                    transform: showBelow ? "translateX(-50%)" : "translate(-50%, -100%)",
                  };
                })()
              : undefined
          }
        >
          <Popover.Content width="280px" boxShadow="lg" borderRadius="lg">
            <Popover.Body p={0}>
              {/* 労働時間 */}
              <Box p={3} borderBottom="1px solid" borderColor="gray.100">
                <Text fontWeight="bold" fontSize="md" color="gray.700">
                  希望：{shift.requestedTime.start} - {shift.requestedTime.end}
                </Text>
              </Box>

              {/* ポジション一覧 */}
              {shift.positions.length > 0 && (
                <Box p={3} borderBottom="1px solid" borderColor="gray.100" maxH="200px" overflowY="auto">
                  {shift.positions.map((pos) => (
                    <Flex key={pos.id} align="center" justify="space-between" mb={2} _last={{ mb: 0 }}>
                      <Flex align="center" gap={2}>
                        <Box w="12px" h="12px" borderRadius="sm" bg={pos.color} />
                        <Text fontSize="sm" color="gray.700">
                          {pos.positionName}
                        </Text>
                        <Text fontSize="xs" color="gray.500">
                          {pos.start}-{pos.end}
                        </Text>
                      </Flex>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        colorPalette="gray"
                        aria-label={`${pos.positionName}を削除`}
                        onClick={() => onDeletePosition(pos.id)}
                        _hover={{ color: "red.500" }}
                      >
                        <LuMinus />
                      </IconButton>
                    </Flex>
                  ))}
                </Box>
              )}

              {/* 全ポジションを削除ボタン */}
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
                  <Text ml={2}>全ポジションを削除</Text>
                </Button>
              </Box>
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
