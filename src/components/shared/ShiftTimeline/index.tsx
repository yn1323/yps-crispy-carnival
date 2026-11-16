import { Box, Text } from "@chakra-ui/react";
import type { TimeRange } from "@/src/domains/shift/types";
import { TIME_AXIS_PADDING_PX } from "./constants";

// 時間の軸を持つ表の、見出しとグリッド線。1時間の幅をpropsで受け、状態を持たない。
// 座標の計算は timelineGeometry.ts、定数は constants.ts に置く。

type TimelineHourLabelsProps = {
  timeRange: TimeRange;
  /** 1時間の幅（px） */
  hourWidth: number;
};

/** 1時間ごとの時刻の見出し。24時以降は「翌1:00」の形で出す。 */
export const TimelineHourLabels = ({ timeRange, hourWidth }: TimelineHourLabelsProps) => {
  const hours = Array.from({ length: timeRange.end - timeRange.start + 1 }, (_, index) => timeRange.start + index);
  // 幅が狭いときは、隣の見出しと重ならない間隔で間引く。
  const step = hourWidth >= 44 ? 1 : hourWidth >= 22 ? 2 : 4;

  return (
    <Box position="relative" height="28px" w="100%" aria-hidden>
      {hours
        .filter((hour) => (hour - timeRange.start) % step === 0)
        .map((hour) => (
          <Text
            key={hour}
            position="absolute"
            left={`${TIME_AXIS_PADDING_PX + (hour - timeRange.start) * hourWidth}px`}
            top="50%"
            transform="translate(-50%, -50%)"
            textStyle="2xs"
            color="gray.500"
            whiteSpace="nowrap"
            fontVariantNumeric="tabular-nums"
          >
            {hour >= 24 ? `翌${hour - 24}:00` : `${hour}:00`}
          </Text>
        ))}
    </Box>
  );
};

const dashedLinePattern = (width: number, color: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="8" viewBox="0 0 ${width} 8"><line x1="0.5" y1="0" x2="0.5" y2="4" stroke="${color}" stroke-width="1"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

type TimelineGridLinesProps = {
  /** 刻み（分） */
  unitMinutes: number;
  /** 1時間の幅（px） */
  hourWidth: number;
};

/** 刻みごとと1時間ごとの縦の点線。親をposition: relativeにして重ねる。 */
export const TimelineGridLines = ({ unitMinutes, hourWidth }: TimelineGridLinesProps) => (
  <Box
    position="absolute"
    inset={0}
    pointerEvents="none"
    zIndex={0}
    style={{
      backgroundImage: [
        dashedLinePattern((unitMinutes / 60) * hourWidth, "#e4e4e7"),
        dashedLinePattern(hourWidth, "#d4d4d8"),
      ].join(", "),
      backgroundPosition: `${TIME_AXIS_PADDING_PX}px 0, ${TIME_AXIS_PADDING_PX}px 0`,
      backgroundRepeat: "repeat, repeat",
    }}
  />
);
