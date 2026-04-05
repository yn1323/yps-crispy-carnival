import { Box, Button, Flex, Icon, SegmentGroup, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { LuChevronLeft, LuCircleCheck } from "react-icons/lu";
import type { ViewMode } from "@/src/components/features/Shift/ShiftForm/types";
import { VIEW_OPTIONS } from "@/src/components/features/Shift/ShiftForm/types";
import { formatDateTime } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import type { ShiftBoardHeaderProps } from "../types";

export const ShiftBoardSPHeader = ({
  periodLabel,
  confirmedAt,
  onSave,
  onConfirm,
  isSaving = false,
  viewMode,
  onViewModeChange,
}: ShiftBoardHeaderProps) => {
  const isConfirmed = confirmedAt !== null;

  return (
    <Box bg="white">
      <Flex align="center" justify="space-between" px={4} py={2}>
        <Link to="/dashboard">
          <Flex align="center" gap={1} color="gray.500" _hover={{ color: "gray.700" }} cursor="pointer">
            <Icon boxSize={4}>
              <LuChevronLeft />
            </Icon>
            <Text fontSize="xs">戻る</Text>
          </Flex>
        </Link>
        <Text fontSize="sm" fontWeight="600" color="gray.900">
          {periodLabel}
        </Text>
      </Flex>

      <Flex align="center" justify="space-between" px={4} py={2} borderTop="1px solid" borderColor="gray.100">
        <SegmentGroup.Root size="xs" value={viewMode} onValueChange={(e) => onViewModeChange(e.value as ViewMode)}>
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={VIEW_OPTIONS} cursor="pointer" />
        </SegmentGroup.Root>

        <Flex align="center" gap={2}>
          <Button variant="outline" size="xs" onClick={onSave} loading={isSaving}>
            保存
          </Button>
          {isConfirmed ? (
            <Button variant="outline" size="xs" borderColor="teal.600" color="teal.600" onClick={onConfirm}>
              再送信
            </Button>
          ) : (
            <Button size="xs" colorPalette="teal" onClick={onConfirm}>
              送信
            </Button>
          )}
          {isConfirmed && (
            <Flex align="center" gap={1}>
              <Icon color="green.600" boxSize={3}>
                <LuCircleCheck />
              </Icon>
              <Text fontSize="2xs" color="green.600">
                {formatDateTime(confirmedAt)}
              </Text>
            </Flex>
          )}
        </Flex>
      </Flex>
    </Box>
  );
};
