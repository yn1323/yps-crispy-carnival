import { Box, Flex, Text } from "@chakra-ui/react";
import { minutesToPixel } from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import type { RequiredSegment } from "@/src/domains/shift/staffingBars";
import { formatShiftClockTimeRange, timeToMinutes } from "@/src/domains/shift/time";
import type { TimeRange } from "@/src/domains/shift/types";
import { getRequiredCountBackground, getRequiredCountLabel, type StaffingBarEditorPosition } from "./script";

type RequiredCountSegmentsProps = {
  position: StaffingBarEditorPosition;
  /** 必要人数が変わる時刻で区切った区間。0人の区間は渡さない。 */
  segments: readonly RequiredSegment[];
  timeRange: TimeRange;
  /** 1時間の幅（px） */
  hourWidth: number;
  /** 時間の軸の左右のパディング（px） */
  axisPadding: number;
  /** 色の濃さの基準にする、いちばん多い人数 */
  maxCount: number;
  /** 幅の足りない区間で、「人」を省いた数字だけを出すか。1時間の幅が狭い画面で使う。 */
  allowsNumberOnly?: boolean;
  /** 時間の軸の幅を測る場合に渡す */
  measureRef?: (element: HTMLElement | null) => void;
};

const SEGMENT_GAP_PX = 2;

/** 1つのポジションの必要人数を、時間の軸にそろえた1行の帯で出す。親の高さいっぱいに広がる。 */
export const RequiredCountSegments = ({
  position,
  segments,
  timeRange,
  hourWidth,
  axisPadding,
  maxCount,
  allowsNumberOnly = false,
  measureRef,
}: RequiredCountSegmentsProps) => (
  <Box
    ref={measureRef}
    role="list"
    aria-label={`${position.name}の必要人数`}
    position="relative"
    flex={1}
    minW={0}
    h="100%"
  >
    {segments.map((segment) => {
      const left = minutesToPixel(timeToMinutes(segment.start), timeRange, hourWidth, axisPadding);
      const width =
        minutesToPixel(timeToMinutes(segment.end), timeRange, hourWidth, axisPadding) - left - SEGMENT_GAP_PX;
      const label = `${formatShiftClockTimeRange(segment.start, segment.end)} ${segment.count}人`;
      const countLabel = getRequiredCountLabel({ count: segment.count, widthPx: width, allowsNumberOnly });
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
          {countLabel && (
            <Text
              as="span"
              textStyle="xs"
              fontWeight={700}
              color="gray.900"
              fontVariantNumeric="tabular-nums"
              whiteSpace="nowrap"
              aria-hidden
            >
              {countLabel}
            </Text>
          )}
        </Flex>
      );
    })}
  </Box>
);
