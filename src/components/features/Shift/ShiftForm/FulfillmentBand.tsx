import { Box, Flex } from "@chakra-ui/react";
import type { MinuteRange } from "@/src/domains/shift/breaks";
import { type FulfillmentSegmentView, getFulfillmentSegmentStyle } from "./fulfillmentPresentation";
import { minutesToTimelinePercent } from "./spTimelineScale";

/** 帯の高さ（px）。 */
const BAND_HEIGHT_PX = 20;
/** 帯全体の角の丸み（px）。区間ごとには丸めない。 */
const BAND_RADIUS_PX = 4;

type Props = {
  /** 読み上げに使う帯の名前。「ホールの充足」 */
  label: string;
  segments: readonly FulfillmentSegmentView[];
  /** 帯の左端から右端までにあたる時間。 */
  range: MinuteRange;
  /** 帯を置く物差しの範囲。スタッフのカードのバーと同じ範囲を渡し、同じ時刻を同じ位置にそろえる。 */
  timelineRange: MinuteRange;
  /** 区間の文字を出す、区間の幅の下限（px）。これより狭い区間は色だけにする。 */
  minLabelWidthPx: number;
};

/**
 * ポジション1つ分の充足の帯。区間の幅を時間に比例させ、状態を色で示す。
 * 親の幅を物差しの全体とし、帯はその中の必要人数のある時間にだけ置く。
 * 区間の間は1pxのすき間（白の線）で分ける。
 */
export const FulfillmentBand = ({ label, segments, range, timelineRange, minLabelWidthPx }: Props) => {
  const bandLeft = minutesToTimelinePercent(range.start, timelineRange);
  const bandWidth = minutesToTimelinePercent(range.end, timelineRange) - bandLeft;

  return (
    <Box position="relative" w="full" h={`${BAND_HEIGHT_PX}px`}>
      <Box
        role="list"
        aria-label={label}
        position="absolute"
        top={0}
        bottom={0}
        left={`${bandLeft}%`}
        w={`${bandWidth}%`}
        borderRadius={`${BAND_RADIUS_PX}px`}
        overflow="hidden"
      >
        {segments.map((segment, index) => {
          const style = getFulfillmentSegmentStyle(segment);
          const left = minutesToTimelinePercent(segment.startMinutes, range);
          return (
            <Flex
              key={segment.key}
              role="listitem"
              aria-label={segment.description}
              data-fulfillment-state={segment.state}
              data-shortage-level={segment.shortageLevel ?? undefined}
              position="absolute"
              top={0}
              bottom={0}
              left={`${left}%`}
              w={`${minutesToTimelinePercent(segment.endMinutes, range) - left}%`}
              align="center"
              justify="center"
              overflow="hidden"
              bg={style.bg}
              color={style.color}
              // 区間の境目は、幅を変えない内側の白い線で、1pxのすき間として見せる。
              boxShadow={index > 0 ? "inset 1px 0 0 white" : undefined}
              containerType="inline-size"
            >
              {segment.label && (
                <Box
                  as="span"
                  aria-hidden
                  fontSize="11px"
                  lineHeight="1"
                  fontWeight={700}
                  fontVariantNumeric="tabular-nums"
                  css={{ [`@container (width < ${minLabelWidthPx}px)`]: { display: "none" } }}
                >
                  {segment.label}
                </Box>
              )}
            </Flex>
          );
        })}
      </Box>
    </Box>
  );
};
