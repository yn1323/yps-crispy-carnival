import { Box, Button, Flex, IconButton, Popover, Portal, Text } from "@chakra-ui/react";
import { LuTrash2, LuX } from "react-icons/lu";
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
  if (!shift || !shift.workingTime) return null;

  return (
    <Popover.Root open={isOpen} onOpenChange={(details) => !details.open && onClose()}>
      {/* アンカー要素を参照 */}
      <Popover.Anchor asChild>{anchorEl ? <span /> : <span />}</Popover.Anchor>

      <Portal>
        <Popover.Positioner
          style={
            anchorEl
              ? {
                  position: "absolute",
                  left: `${anchorEl.getBoundingClientRect().left + anchorEl.getBoundingClientRect().width / 2}px`,
                  top: `${anchorEl.getBoundingClientRect().top - 8}px`,
                  transform: "translate(-50%, -100%)",
                }
              : undefined
          }
        >
          <Popover.Content width="280px" boxShadow="lg" borderRadius="lg">
            <Popover.Arrow>
              <Popover.ArrowTip />
            </Popover.Arrow>
            <Popover.Body p={0}>
              {/* 労働時間 */}
              <Box p={3} borderBottom="1px solid" borderColor="gray.100">
                <Text fontWeight="bold" fontSize="md" color="gray.700">
                  {shift.workingTime.start} - {shift.workingTime.end}
                </Text>
              </Box>

              {/* ポジション一覧 */}
              {shift.positions.length > 0 && (
                <Box p={3} borderBottom="1px solid" borderColor="gray.100">
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
                      >
                        <LuX />
                      </IconButton>
                    </Flex>
                  ))}
                </Box>
              )}

              {/* シフトを削除ボタン */}
              <Box p={3}>
                <Button
                  size="sm"
                  variant="ghost"
                  colorPalette="red"
                  width="100%"
                  onClick={onDeleteShift}
                  justifyContent="flex-start"
                >
                  <LuTrash2 />
                  <Text ml={2}>シフトを削除</Text>
                </Button>
              </Box>
            </Popover.Body>

            <Popover.CloseTrigger position="absolute" top="2" right="2">
              <IconButton size="xs" variant="ghost" aria-label="閉じる">
                <LuX />
              </IconButton>
            </Popover.CloseTrigger>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
};
