import { Box, Flex, Stack, Text, useBreakpointValue } from "@chakra-ui/react";
import { useMemo } from "react";
import { minutesToPixel } from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import {
  countRequiredSegments,
  type PositionRequiredSegments,
  STAFFING_BAR_UNIT_MINUTES,
  type StaffingBarRange,
} from "@/src/domains/shift/staffingBars";
import { formatShiftClockTimeRange, timeToMinutes } from "@/src/domains/shift/time";
import type { StaffingBar } from "@/src/domains/shift/types";
import {
  buildTimelineRange,
  getMinTrackWidth,
  getRequiredCountBackground,
  LABEL_COLUMN_WIDTH_PX,
  type StaffingBarEditorPosition,
} from "./script";
import { useTimelineHourWidth } from "./useTimelineHourWidth";

export type RequiredCountStripProps = {
  positions: readonly StaffingBarEditorPosition[];
  /** 必要人数のバー。受付時間の外にかかる部分は数えない。 */
  bars: readonly StaffingBar[];
  /** 受付時間（分） */
  range: StaffingBarRange;
  /** 未指定なら画面幅で切り替える。timelineは時間の軸にそろえた帯、listは「時間 → 人数」の一覧。 */
  layout?: "timeline" | "list";
};

const HEADING = "できあがる必要人数";
const STRIP_ROW_HEIGHT_PX = 32;
const SEGMENT_GAP_PX = 2;
// 人数を帯の中に出せる幅の下限。
const COUNT_LABEL_MIN_WIDTH_PX = 28;

/**
 * バーから決まる必要人数を、ポジションごとに1行で出す。置き場所は使う側が決める。
 * timelineでは、バーの表と同じ幅の入れ物に置くと、時間の軸がそろう。
 */
export const RequiredCountStrip = ({ positions, bars, range, layout }: RequiredCountStripProps) => {
  const autoLayout = useBreakpointValue<"timeline" | "list">({ base: "list", lg: "timeline" }) ?? "timeline";
  const resolvedLayout = layout ?? autoLayout;
  const segmentsByPosition = useMemo(
    () => countRequiredSegments({ bars, positionIds: positions.map((position) => position.id), range }),
    [bars, positions, range],
  );
  const maxCount = Math.max(1, ...segmentsByPosition.flatMap((item) => item.segments.map((segment) => segment.count)));

  return (
    <Stack as="section" aria-label={HEADING} gap={2}>
      <Text textStyle="sm" fontWeight={700} color="gray.700">
        {HEADING}
      </Text>
      {resolvedLayout === "timeline" ? (
        <TimelineStrip
          positions={positions}
          segmentsByPosition={segmentsByPosition}
          range={range}
          maxCount={maxCount}
        />
      ) : (
        <ListStrip positions={positions} segmentsByPosition={segmentsByPosition} />
      )}
    </Stack>
  );
};

type StripProps = {
  positions: readonly StaffingBarEditorPosition[];
  segmentsByPosition: readonly PositionRequiredSegments[];
};

const PositionLabel = ({ position }: { position: StaffingBarEditorPosition }) => (
  <Flex align="center" gap={2} minW={0}>
    <Box boxSize="10px" borderRadius="full" flexShrink={0} style={{ background: position.color }} aria-hidden />
    <Text textStyle="sm" fontWeight={600} color="gray.800" truncate>
      {position.name}
    </Text>
  </Flex>
);

const TimelineStrip = ({
  positions,
  segmentsByPosition,
  range,
  maxCount,
}: StripProps & { range: StaffingBarRange; maxCount: number }) => {
  const timeRange = useMemo(() => buildTimelineRange(range, STAFFING_BAR_UNIT_MINUTES), [range]);
  const { measureRef, hourWidth } = useTimelineHourWidth(timeRange.end - timeRange.start);

  return (
    <Box overflowX="auto">
      <Stack gap={1} minW={`${LABEL_COLUMN_WIDTH_PX + getMinTrackWidth(timeRange)}px`}>
        {positions.map((position, index) => (
          <Flex key={position.id} align="center" h={`${STRIP_ROW_HEIGHT_PX}px`}>
            <Box w={`${LABEL_COLUMN_WIDTH_PX}px`} flexShrink={0} pl={3} pr={2}>
              <PositionLabel position={position} />
            </Box>
            <Box
              ref={index === 0 ? measureRef : undefined}
              role="list"
              aria-label={`${position.name}の必要人数`}
              position="relative"
              flex={1}
              minW={0}
              h="100%"
            >
              {(segmentsByPosition[index]?.segments ?? []).map((segment) => {
                const left = minutesToPixel(timeToMinutes(segment.start), timeRange, hourWidth);
                const width = minutesToPixel(timeToMinutes(segment.end), timeRange, hourWidth) - left - SEGMENT_GAP_PX;
                const label = `${formatShiftClockTimeRange(segment.start, segment.end)} ${segment.count}人`;
                return (
                  <Flex
                    key={segment.start}
                    role="listitem"
                    aria-label={label}
                    title={label}
                    position="absolute"
                    left={`${left + SEGMENT_GAP_PX / 2}px`}
                    width={`${Math.max(0, width)}px`}
                    top="3px"
                    bottom="3px"
                    align="center"
                    justify="center"
                    borderRadius="sm"
                    overflow="hidden"
                    style={{ background: getRequiredCountBackground(position.color, segment.count, maxCount) }}
                  >
                    {width >= COUNT_LABEL_MIN_WIDTH_PX && (
                      <Text
                        as="span"
                        textStyle="xs"
                        fontWeight={700}
                        color="gray.900"
                        fontVariantNumeric="tabular-nums"
                        whiteSpace="nowrap"
                        aria-hidden
                      >
                        {segment.count}人
                      </Text>
                    )}
                  </Flex>
                );
              })}
            </Box>
          </Flex>
        ))}
      </Stack>
    </Box>
  );
};

const ListStrip = ({ positions, segmentsByPosition }: StripProps) => (
  <Stack gap={3}>
    {positions.map((position, index) => {
      const segments = segmentsByPosition[index]?.segments ?? [];
      return (
        <Stack key={position.id} gap={1}>
          <PositionLabel position={position} />
          {segments.length === 0 ? (
            <Text fontSize="sm" color="fg.muted">
              バーを足すと人数が出ます
            </Text>
          ) : (
            <Box as="ul" listStyleType="none" aria-label={`${position.name}の必要人数`}>
              {segments.map((segment) => (
                <Flex
                  as="li"
                  key={segment.start}
                  align="center"
                  justify="space-between"
                  gap={3}
                  py={1}
                  borderBottomWidth="1px"
                  borderColor="gray.100"
                  fontSize="sm"
                  fontVariantNumeric="tabular-nums"
                >
                  <Text as="span" color="gray.700">
                    {formatShiftClockTimeRange(segment.start, segment.end)}
                  </Text>
                  <Text as="span" fontWeight={700} color="gray.900">
                    {segment.count}人
                  </Text>
                </Flex>
              ))}
            </Box>
          )}
        </Stack>
      );
    })}
  </Stack>
);
