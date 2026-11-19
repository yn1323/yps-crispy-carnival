import { Box, Flex } from "@chakra-ui/react";
import type { MinuteRange } from "@/src/domains/shift/breaks";
import { type FulfillmentSegmentView, getFulfillmentSegmentStyle } from "./fulfillmentPresentation";

type Props = {
  /** 読み上げに使う帯の名前。「ホールの充足」 */
  label: string;
  segments: readonly FulfillmentSegmentView[];
  /** 帯の左端から右端までにあたる時間。 */
  range: MinuteRange;
  /** 帯の高さ（px）。 */
  heightPx: number;
  /** 区間の文字を出す、区間の幅の下限（px）。これより狭い区間は色だけにする。 */
  minLabelWidthPx: number;
};

/**
 * ポジション1つ分の充足の帯。区間の幅を時間に比例させ、状態を色で示す。
 * 帯は親の幅いっぱいに伸びる。区間に出す文字と、文字を出す幅の下限は、置く画面が決めて渡す。
 */
export const FulfillmentBand = ({ label, segments, range, heightPx, minLabelWidthPx }: Props) => {
  const length = range.end - range.start;
  const toPercent = (minutes: number) => ((minutes - range.start) / length) * 100;

  return (
    <Box role="list" aria-label={label} position="relative" w="full" h={`${heightPx}px`} bg="gray.200">
      {segments.map((segment, index) => {
        const style = getFulfillmentSegmentStyle(segment);
        const left = toPercent(segment.startMinutes);
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
            w={`${toPercent(segment.endMinutes) - left}%`}
            align="center"
            justify="center"
            overflow="hidden"
            bg={style.bg}
            color={style.color}
            // 区間の境目は、幅を変えない内側の線で示す。
            boxShadow={index > 0 ? "inset 1px 0 0 white" : undefined}
            containerType="inline-size"
          >
            {segment.label && (
              <Box
                as="span"
                aria-hidden
                textStyle="xs"
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
  );
};
