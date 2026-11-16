import { Badge, Box, chakra, Flex, Stack, Text } from "@chakra-ui/react";
import { LuChevronRight, LuPlus } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import {
  type EditableStaffingBar,
  groupStaffingBars,
  isStaffingBarWithinRange,
  type StaffingBarGroup,
  type StaffingBarRules,
} from "@/src/domains/shift/staffingBars";
import { formatShiftClockTimeRange } from "@/src/domains/shift/time";
import type { StaffingBarEditorPosition } from "./script";

type ListEditorProps = {
  positions: readonly StaffingBarEditorPosition[];
  bars: readonly EditableStaffingBar[];
  rules: StaffingBarRules;
  isReadOnly: boolean;
  /** 「時刻を選んで足す」を押したとき */
  onOpenAdd: (position: StaffingBarEditorPosition) => void;
  /** バーの行を押したとき */
  onOpenEdit: (position: StaffingBarEditorPosition, group: StaffingBarGroup) => void;
};

/**
 * スマートフォンのバーの一覧。ドラッグを使わず、行を押して開くシートで時間と本数を変える。
 * 同じ時間のバーは1行にまとめ、本数を「×2」の形で出す。
 */
export const ListEditor = ({ positions, bars, rules, isReadOnly, onOpenAdd, onOpenEdit }: ListEditorProps) => (
  <Stack gap={3}>
    {positions.map((position) => {
      const groups = groupStaffingBars(bars, position.id);
      return (
        <Box
          key={position.id}
          as="section"
          aria-label={`${position.name}のバー`}
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="lg"
          bg="white"
          overflow="hidden"
        >
          <Flex align="center" gap={2} px={3} minH="40px" bg="gray.50" borderBottomWidth="1px" borderColor="gray.200">
            <Box boxSize="10px" borderRadius="full" flexShrink={0} style={{ background: position.color }} aria-hidden />
            <Text textStyle="sm" fontWeight={700} color="gray.800" truncate>
              {position.name}
            </Text>
          </Flex>
          {groups.length === 0 ? (
            <Text px={3} py={3} fontSize="sm" color="fg.muted">
              バーはまだありません
            </Text>
          ) : (
            <Box as="ul" listStyleType="none">
              {groups.map((group) => (
                <Box as="li" key={`${group.start}-${group.end}`} borderBottomWidth="1px" borderColor="gray.100">
                  <GroupRow
                    group={group}
                    isOutsideRange={!isStaffingBarWithinRange(group, rules.range)}
                    isReadOnly={isReadOnly}
                    onOpen={() => onOpenEdit(position, group)}
                  />
                </Box>
              ))}
            </Box>
          )}
          {!isReadOnly && (
            <Box p={3}>
              <Button
                type="button"
                variant="outline"
                bg="white"
                size="sm"
                minH="44px"
                w="full"
                onClick={() => onOpenAdd(position)}
              >
                <LuPlus aria-hidden />
                時刻を選んで足す
              </Button>
            </Box>
          )}
        </Box>
      );
    })}
  </Stack>
);

type GroupRowProps = {
  group: StaffingBarGroup;
  /** 受付時間の外にかかるバー。切りそろえるまで変えられない。 */
  isOutsideRange: boolean;
  isReadOnly: boolean;
  onOpen: () => void;
};

const GroupRow = ({ group, isOutsideRange, isReadOnly, onOpen }: GroupRowProps) => {
  const timeLabel = formatShiftClockTimeRange(group.start, group.end);
  const content = (
    <>
      <Text as="span" fontSize="md" color="gray.800" fontVariantNumeric="tabular-nums">
        {timeLabel}
      </Text>
      {isOutsideRange && (
        <Badge colorPalette="orange" size="sm" flexShrink={0}>
          受付時間の外
        </Badge>
      )}
      <Text as="span" ml="auto" fontSize="md" fontWeight={600} color="gray.700" fontVariantNumeric="tabular-nums">
        <Box as="span" aria-hidden>
          ×{group.barIds.length}
        </Box>
      </Text>
    </>
  );

  if (isReadOnly || isOutsideRange) {
    return (
      <Flex align="center" gap={2} px={3} minH="44px" aria-label={`${timeLabel} ${group.barIds.length}本`} role="group">
        {content}
      </Flex>
    );
  }

  return (
    <chakra.button
      type="button"
      aria-label={`${timeLabel} ${group.barIds.length}本`}
      onClick={onOpen}
      display="flex"
      alignItems="center"
      gap={2}
      w="full"
      px={3}
      minH="44px"
      textAlign="start"
      cursor="pointer"
      bg="white"
      _hover={{ bg: "gray.50" }}
      _active={{ bg: "gray.100" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
    >
      {content}
      <Box as="span" color="gray.400" flexShrink={0} aria-hidden>
        <LuChevronRight />
      </Box>
    </chakra.button>
  );
};
