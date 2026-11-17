import { Box, chakra, Flex, Icon, Popover, Portal, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { LuChevronDown, LuChevronUp, LuTriangleAlert } from "react-icons/lu";
import { minutesToPixel } from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import { Button } from "@/src/components/ui/Button";
import type { TimeRange } from "@/src/domains/shift/types";
import { NewcomerOnlyMark, StaffingUnsetNote, useDayStaffingView } from "../../../staffingParts";
import {
  describeStaffingCount,
  resolveBandSegmentContent,
  STAFFING_TONE_STYLES,
  type StaffingBandSegmentView,
  type StaffingBandView,
  summarizeStaffingBands,
} from "../../../staffingPresentation";
import { hourWidthAtom, selectedDateAtom, shiftConfigAtom } from "../../../stores";

const SEGMENT_GAP_PX = 2;
const BAND_ROW_HEIGHT_PX = 28;
// 行が増えても表を隠しきらないよう、帯の行は6行分までにとどめ、それ以上は帯の中でスクロールさせる。
const BAND_MAX_VISIBLE_ROWS = 6;

type SegmentProps = {
  band: StaffingBandView;
  segment: StaffingBandSegmentView;
  timeRange: TimeRange;
  hourWidth: number;
};

/** 帯の1区間。過不足だけを出し、人数と必要人数、見習いだけであることは、titleと押したときの欄で出す。 */
const BandSegment = ({ band, segment, timeRange, hourWidth }: SegmentProps) => {
  const left = minutesToPixel(segment.startMinutes, timeRange, hourWidth);
  const width = Math.max(0, minutesToPixel(segment.endMinutes, timeRange, hourWidth) - left - SEGMENT_GAP_PX);
  const content = resolveBandSegmentContent(segment, width);
  const style = STAFFING_TONE_STYLES[segment.tone];

  return (
    <Popover.Root positioning={{ placement: "top", gutter: 6 }} lazyMount unmountOnExit>
      <Popover.Trigger asChild>
        <chakra.button
          type="button"
          aria-label={segment.description}
          title={segment.description}
          data-staffing-tone={segment.tone}
          position="absolute"
          left={`${left + SEGMENT_GAP_PX / 2}px`}
          width={`${width}px`}
          top="3px"
          bottom="3px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          gap="3px"
          px="2px"
          overflow="hidden"
          borderRadius="sm"
          borderWidth="1px"
          bg={style.bg ?? "transparent"}
          borderColor={style.borderColor}
          borderStyle={style.borderStyle}
          color={style.color}
          fontWeight={style.fontWeight}
          textStyle="xs"
          fontVariantNumeric="tabular-nums"
          whiteSpace="nowrap"
          cursor="pointer"
          _hover={{ boxShadow: "inset 0 0 0 1px var(--chakra-colors-gray-400)" }}
          _active={{ boxShadow: "inset 0 0 0 1px var(--chakra-colors-gray-600)" }}
          _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-1px" }}
        >
          {content.text && <Box as="span">{content.text}</Box>}
          {content.showsNewcomerMark && <NewcomerOnlyMark />}
        </chakra.button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="auto" minW="180px" maxW="260px" p={3} aria-label={`${band.name}の人数`}>
            <Flex align="center" gap="6px" textStyle="sm" fontWeight={700} color="gray.800">
              <Box boxSize="10px" borderRadius="full" flexShrink={0} style={{ background: band.color }} aria-hidden />
              <Box as="span" truncate>
                {band.name}
              </Box>
              <Box as="span" fontWeight={500} color="gray.600" fontVariantNumeric="tabular-nums" flexShrink={0}>
                {segment.timeLabel}
              </Box>
            </Flex>
            <Box mt={2} textStyle="sm" color="gray.800">
              {describeStaffingCount(segment).map((line, index) => (
                <Text key={line} color={index > 0 ? style.color : undefined} fontWeight={index > 0 ? 600 : 400}>
                  {line}
                </Text>
              ))}
            </Box>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
};

/**
 * 表の下に留める、人数と過不足の帯。くわしく表示のときだけ出る。
 * ポジションごとに1行で、人数か必要人数が変わる時刻で区切り、時間の軸にそろえる。
 */
export const StaffingBand = ({ leftWidth }: { leftWidth: number }) => {
  const selectedDate = useAtomValue(selectedDateAtom);
  const hourWidth = useAtomValue(hourWidthAtom);
  const { timeRange } = useAtomValue(shiftConfigAtom);
  const view = useDayStaffingView(selectedDate);
  const [isExpanded, setExpanded] = useState(false);
  if (!view) return null;

  const summary = summarizeStaffingBands(view, isExpanded);
  const newcomerOnlyCount = view.bands.reduce(
    (count, band) => count + band.segments.filter((segment) => segment.isNewcomerOnly).length,
    0,
  );

  return (
    <Box
      as="section"
      aria-label="人数"
      position="sticky"
      bottom={0}
      // スタッフが少ない日も、帯を表の下端に留める。
      mt="auto"
      zIndex={9}
      bg="white"
      borderTopWidth="1px"
      borderColor="gray.300"
      boxShadow="0 -2px 4px rgba(0,0,0,0.04)"
    >
      <Flex align="center" gap={2} px={3} py="6px">
        <Text textStyle="xs" fontWeight={700} color="gray.700" whiteSpace="nowrap">
          人数
        </Text>
        {!view.hasRequirements ? (
          <StaffingUnsetNote />
        ) : view.hasShortage ? (
          <Text textStyle="xs" fontWeight={700} color="red.700" whiteSpace="nowrap">
            不足 {view.shortageCount}か所
          </Text>
        ) : (
          <Text textStyle="xs" color="gray.600" whiteSpace="nowrap">
            不足なし
          </Text>
        )}
        {newcomerOnlyCount > 0 && (
          <Flex align="center" gap={1} textStyle="xs" fontWeight={700} color="orange.700" whiteSpace="nowrap">
            <Icon boxSize={3.5} aria-hidden>
              <LuTriangleAlert />
            </Icon>
            見習いだけ {newcomerOnlyCount}か所
          </Flex>
        )}
      </Flex>
      <Box maxH={`${BAND_ROW_HEIGHT_PX * BAND_MAX_VISIBLE_ROWS}px`} overflowY="auto">
        {summary.visibleBands.map((band) => (
          <Flex key={band.positionId} h={`${BAND_ROW_HEIGHT_PX}px`} borderTopWidth="1px" borderColor="gray.100">
            <Flex
              w={`${leftWidth}px`}
              flexShrink={0}
              align="center"
              gap="6px"
              px={3}
              borderRightWidth="1px"
              borderColor="gray.100"
              textStyle="xs"
              fontWeight={600}
              color="gray.800"
            >
              <Box boxSize="10px" borderRadius="full" flexShrink={0} style={{ background: band.color }} aria-hidden />
              <Box as="span" truncate>
                {band.name}
              </Box>
            </Flex>
            <Box role="group" aria-label={`${band.name}の人数`} position="relative" flex={1} minW={0}>
              {band.segments.map((segment) => (
                <BandSegment
                  key={segment.key}
                  band={band}
                  segment={segment}
                  timeRange={timeRange}
                  hourWidth={hourWidth}
                />
              ))}
            </Box>
          </Flex>
        ))}
      </Box>
      {summary.toggleLabel && (
        <Flex borderTopWidth="1px" borderColor="gray.100" px={2} py="2px">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            h="26px"
            px={2}
            gap={1}
            color="gray.700"
            aria-expanded={isExpanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {summary.toggleLabel}
            {isExpanded ? <LuChevronUp aria-hidden /> : <LuChevronDown aria-hidden />}
          </Button>
        </Flex>
      )}
    </Box>
  );
};
