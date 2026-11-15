import { Badge, Box, chakra, Flex, Portal, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { LuTrash2, LuX } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import type { ShiftData } from "@/src/domains/shift/types";
import { detailModeAtom, isPositionSelectableAtom, shiftConfigAtom, usesPositionColorsAtom } from "../../stores";
import { buildShiftPopoverViewModel } from "./script";

type ShiftPopoverProps = {
  shift: ShiftData | null;
  anchorRect: DOMRect | null;
  isOpen: boolean;
  isStaffSubmitted: boolean;
  onClose: () => void;
  onDeletePosition: (positionId: string) => void;
  /** 勤務区間のポジションを変える。ポジションを選び分けられる場合だけ使う。 */
  onChangePosition?: (segmentId: string, positionId: string) => void;
  /** 休憩の編集を開く。編集できない場合は渡さない。 */
  onEditBreaks?: () => void;
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
  onChangePosition,
  onEditBreaks,
  isReadOnly = false,
}: ShiftPopoverProps) => {
  const detailMode = useAtomValue(detailModeAtom);
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  const isPositionSelectable = useAtomValue(isPositionSelectableAtom);
  const { positions } = useAtomValue(shiftConfigAtom);
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
  const viewModel = buildShiftPopoverViewModel({ shift, isStaffSubmitted, isReadOnly });

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
        {viewModel.requestLabel && (
          <Box p={3} borderBottom="1px solid" borderColor="gray.100">
            <Flex align="center" gap={2} pr={8}>
              <Text fontWeight="bold" fontSize="sm" color="gray.700">
                {viewModel.requestLabel}
              </Text>
              {viewModel.showUnsubmittedBadge && (
                <Badge colorPalette="orange" size="sm">
                  未提出
                </Badge>
              )}
            </Flex>
          </Box>
        )}

        {/* ポジション一覧 */}
        {viewModel.segments.length > 0 && (
          <Box p={3} maxH="200px" overflowY="auto">
            {viewModel.segments.map((segment) => (
              <Box key={segment.id} mb={2} _last={{ mb: 0 }}>
                <Flex align="center" justify="space-between">
                  <Flex align="center" gap={2} minW={0}>
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
                  {viewModel.showDeleteActions && (
                    <IconButton
                      size="xs"
                      variant="ghost"
                      colorPalette="gray"
                      aria-label="時間帯を削除"
                      onClick={() => onDeletePosition(segment.id)}
                      _hover={{ color: "red.500" }}
                    >
                      <LuTrash2 />
                    </IconButton>
                  )}
                </Flex>
                {isPositionSelectable && onChangePosition && (
                  <Flex
                    role="radiogroup"
                    aria-label={`${segment.timeLabel}のポジション`}
                    gap={1}
                    flexWrap="wrap"
                    mt={1}
                  >
                    {positions.map((position) => {
                      const checked = position.id === segment.positionId;
                      return (
                        <chakra.button
                          key={position.id}
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          onClick={() => onChangePosition(segment.id, position.id)}
                          px={2}
                          h="24px"
                          borderRadius="full"
                          borderWidth="1px"
                          textStyle="2xs"
                          fontWeight={600}
                          cursor="pointer"
                          color={checked ? "white" : "gray.700"}
                          borderColor={checked ? "transparent" : "gray.300"}
                          style={{ background: checked ? position.color : "white" }}
                        >
                          {position.name}
                        </chakra.button>
                      );
                    })}
                  </Flex>
                )}
              </Box>
            ))}
          </Box>
        )}

        {/* 休憩（くわしく表示のときだけ） */}
        {detailMode && viewModel.segments.length > 0 && (viewModel.breakLabels.length > 0 || onEditBreaks) && (
          <Flex p={3} borderTop="1px solid" borderColor="gray.100" align="center" justify="space-between" gap={2}>
            <Text fontSize="sm" color="gray.700">
              {viewModel.breakLabels.length > 0 ? `休憩：${viewModel.breakLabels.join(" / ")}` : "休憩：なし"}
            </Text>
            {onEditBreaks && (
              <Button type="button" size="xs" variant="outline" onClick={onEditBreaks} flexShrink={0}>
                休憩を変更
              </Button>
            )}
          </Flex>
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
