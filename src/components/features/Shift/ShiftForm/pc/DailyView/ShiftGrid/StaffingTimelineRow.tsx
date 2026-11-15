import { Box, Flex, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { DayTemplateMenu, StaffingPositionCounts, useDayStaffingView } from "../../../detailParts";
import { formatStaffingCount } from "../../../staffingPresentation";
import { hourWidthAtom, selectedDateAtom, shiftConfigAtom } from "../../../stores";
import { minutesToPixel } from "../../../timelineGeometry";

const CELL_GAP_PX = 2;
// ポジション名まで出しても読める、1ポジションあたりの幅。これより狭い時間帯は色の丸と人数だけにする。
const NAMED_POSITION_WIDTH_PX = 120;

/**
 * 時間軸にそろえて、区切りごとの人数と過不足を出す行。くわしく表示のときだけ出る。
 * 日の型がある日は型の時間帯ごと、ない日は1時間ごとの人数を出す。
 */
export const StaffingTimelineRow = ({ leftWidth }: { leftWidth: number }) => {
  const selectedDate = useAtomValue(selectedDateAtom);
  const hourWidth = useAtomValue(hourWidthAtom);
  const { timeRange } = useAtomValue(shiftConfigAtom);
  const view = useDayStaffingView(selectedDate);
  if (!view) return null;

  return (
    <Flex
      as="section"
      aria-label="人数"
      position="sticky"
      bottom={0}
      zIndex={9}
      bg="white"
      borderTopWidth="1px"
      borderColor="gray.200"
      boxShadow="0 -2px 4px rgba(0,0,0,0.04)"
    >
      <Flex
        w={`${leftWidth}px`}
        flexShrink={0}
        align="center"
        justify="space-between"
        gap={2}
        px={3}
        py={2}
        borderRightWidth="1px"
        borderColor="gray.100"
      >
        <Text textStyle="xs" fontWeight={700} color="gray.700" whiteSpace="nowrap">
          {view.template ? "人数 / 必要" : "人数"}
        </Text>
        <DayTemplateMenu date={selectedDate} view={view} />
      </Flex>
      <Box position="relative" flex={1} minW={0} h="44px">
        {view.slots.map((slot) => {
          if (slot.startMinutes === undefined || slot.endMinutes === undefined) return null;
          const left = minutesToPixel(slot.startMinutes, timeRange, hourWidth);
          const right = minutesToPixel(slot.endMinutes, timeRange, hourWidth);
          const title = `${slot.label} ${slot.positions
            .map((position) => `${position.name} ${formatStaffingCount(position.count, position.required)}`)
            .join("、")}`;
          return (
            <Flex
              key={slot.id}
              position="absolute"
              left={`${left + CELL_GAP_PX / 2}px`}
              width={`${Math.max(0, right - left - CELL_GAP_PX)}px`}
              top="6px"
              bottom="6px"
              align="center"
              justify="center"
              px={1}
              borderRadius="sm"
              borderWidth="1px"
              bg={slot.hasShortage ? "red.50" : "gray.50"}
              borderColor={slot.hasShortage ? "red.300" : "gray.200"}
              color="gray.800"
              textStyle="2xs"
              fontWeight={600}
              overflow="hidden"
              title={title}
            >
              {view.template ? (
                <StaffingPositionCounts
                  slot={slot}
                  showNames={right - left >= NAMED_POSITION_WIDTH_PX * Math.max(1, slot.positions.length)}
                />
              ) : (
                <Box as="span" fontVariantNumeric="tabular-nums">
                  {slot.total}
                </Box>
              )}
            </Flex>
          );
        })}
      </Box>
    </Flex>
  );
};
