import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import {
  countRequiredSegments,
  STAFFING_BAR_UNIT_MINUTES,
  type StaffingBarRange,
} from "@/src/domains/shift/staffingBars";
import type { StaffingBar } from "@/src/domains/shift/types";
import { RequiredCountSegments } from "./RequiredCountSegments";
import {
  buildTimelineRange,
  getMinTrackWidth,
  getTimelineMetrics,
  type StaffingBarEditorPosition,
  type StaffingBarLayout,
} from "./script";
import { useStaffingBarLayout } from "./useStaffingBarLayout";
import { useTimelineHourWidth } from "./useTimelineHourWidth";

export type RequiredCountStripProps = {
  positions: readonly StaffingBarEditorPosition[];
  /** 必要人数のバー。受付時間の外にかかる部分は数えない。 */
  bars: readonly StaffingBar[];
  /** 受付時間（分） */
  range: StaffingBarRange;
  /** 未指定なら画面幅で切り替える。narrowでは何も出さない。 */
  layout?: StaffingBarLayout;
};

const HEADING = "できあがる必要人数";
const STRIP_ROW_HEIGHT_PX = 32;
// 広い画面のバーの表（StaffingBarEditor）と、時間の軸をそろえる。
const METRICS = getTimelineMetrics("wide");

/**
 * バーから決まる必要人数を、ポジションごとに1行で出す。置き場所は使う側が決める。
 * バーの表と同じ幅の入れ物に置くと、時間の軸がそろう。
 * 狭い画面では、バーの表（StaffingBarEditor）がポジションごとに人数を出すため、この部品は何も出さない。
 */
export const RequiredCountStrip = ({ layout, ...props }: RequiredCountStripProps) => {
  const resolved = useStaffingBarLayout(layout);
  return resolved.layout === "wide" ? <WideStrip {...props} /> : null;
};

const WideStrip = ({ positions, bars, range }: Omit<RequiredCountStripProps, "layout">) => {
  const segmentsByPosition = useMemo(
    () => countRequiredSegments({ bars, positionIds: positions.map((position) => position.id), range }),
    [bars, positions, range],
  );
  const maxCount = Math.max(1, ...segmentsByPosition.flatMap((item) => item.segments.map((segment) => segment.count)));
  const timeRange = useMemo(() => buildTimelineRange(range, STAFFING_BAR_UNIT_MINUTES), [range]);
  const { measureRef, hourWidth } = useTimelineHourWidth(timeRange.end - timeRange.start, METRICS);

  return (
    <Stack as="section" aria-label={HEADING} gap={2}>
      <Text textStyle="sm" fontWeight={700} color="gray.700">
        {HEADING}
      </Text>
      <Box overflowX="auto">
        <Stack gap={1} minW={`${METRICS.labelColumnWidth + getMinTrackWidth(timeRange, METRICS)}px`}>
          {positions.map((position, index) => (
            <Flex key={position.id} align="center" h={`${STRIP_ROW_HEIGHT_PX}px`}>
              <Flex align="center" gap={2} minW={0} w={`${METRICS.labelColumnWidth}px`} flexShrink={0} pl={3} pr={2}>
                <Box
                  boxSize="10px"
                  borderRadius="full"
                  flexShrink={0}
                  style={{ background: position.color }}
                  aria-hidden
                />
                <Text textStyle="sm" fontWeight={600} color="gray.800" truncate>
                  {position.name}
                </Text>
              </Flex>
              <RequiredCountSegments
                position={position}
                segments={segmentsByPosition[index]?.segments ?? []}
                timeRange={timeRange}
                hourWidth={hourWidth}
                axisPadding={METRICS.axisPadding}
                maxCount={maxCount}
                measureRef={index === 0 ? measureRef : undefined}
              />
            </Flex>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
};
