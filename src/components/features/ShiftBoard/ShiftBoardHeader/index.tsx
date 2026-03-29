import { Button, Flex, Icon, SegmentGroup, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { LuChevronLeft, LuCircleCheck, LuSave } from "react-icons/lu";
import type { ViewMode } from "@/src/components/features/Shift/ShiftForm/types";
import { VIEW_OPTIONS } from "@/src/components/features/Shift/ShiftForm/types";
import { formatDateTime } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import type { ShiftBoardHeaderProps } from "../types";

export const ShiftBoardHeader = ({
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
    <Flex as="nav" align="center" justify="space-between" h="44px" bg="white" px={6}>
      <Flex align="center" gap={3}>
        <Link to="/dashboard">
          <Flex align="center" gap={1} color="gray.500" _hover={{ color: "gray.700" }} cursor="pointer">
            <Icon boxSize={4}>
              <LuChevronLeft />
            </Icon>
            <Text fontSize="sm">戻る</Text>
          </Flex>
        </Link>
        <Text fontSize="md" fontWeight="600" color="gray.900">
          {periodLabel}
        </Text>
      </Flex>

      <Flex align="center" gap={3}>
        <SegmentGroup.Root size="sm" value={viewMode} onValueChange={(e) => onViewModeChange(e.value as ViewMode)}>
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={VIEW_OPTIONS} cursor="pointer" />
        </SegmentGroup.Root>

        <Button variant="outline" size="sm" onClick={onSave} loading={isSaving}>
          <LuSave />
          保存
        </Button>

        {isConfirmed ? (
          <Button variant="outline" size="sm" borderColor="teal.600" color="teal.600" onClick={onConfirm}>
            再送信する
          </Button>
        ) : (
          <Button size="sm" colorPalette="teal" onClick={onConfirm}>
            スタッフに送信する
          </Button>
        )}

        {isConfirmed && (
          <Flex align="center" gap={1}>
            <Icon color="green.600" boxSize={3.5}>
              <LuCircleCheck />
            </Icon>
            <Text fontSize="xs" color="green.600">
              送信済み（{formatDateTime(confirmedAt)}）
            </Text>
          </Flex>
        )}
      </Flex>
    </Flex>
  );
};
