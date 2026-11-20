import { Box, chakra, Flex, Icon } from "@chakra-ui/react";
import { useAtom } from "jotai";
import { useId } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { FulfillmentBand } from "../../FulfillmentBand";
import { type DayFulfillmentView, getFulfillmentPercentStyle } from "../../fulfillmentPresentation";
import { minutesToTimelinePercent, SP_TIMELINE_INSET_X_PX } from "../../spTimelineScale";
import { isFulfillmentExpandedAtom } from "../../stores";

// 不足の人数は、この幅以上の区間にだけ出す。狭い区間は色だけで示す。
const MIN_LABEL_WIDTH_PX = 28;
const AXIS_HEIGHT_PX = 20;
// 帯と時刻の軸は、スタッフのカードのバーと同じ左右の余白の内側に描く。区画の地と線は画面の幅いっぱいのまま。
const TIMELINE_INSET_X = `${SP_TIMELINE_INSET_X_PX}px`;

/**
 * 3時間ごとの時刻。スタッフのカードのバーと同じ物差しで、実際の時刻の位置に中央をそろえて置く。
 * 左右の余白（25px）は、いちばん長い「翌12」の半分より広いため、両端の時刻も画面の端からはみ出さない。
 */
const TimeAxis = ({ view }: { view: DayFulfillmentView }) => (
  <Box position="relative" h={`${AXIS_HEIGHT_PX}px`} textStyle="xs" color="gray.600" aria-hidden>
    {view.ticks.map((tick) => (
      <Box
        key={tick.minutes}
        data-tick-minutes={tick.minutes}
        position="absolute"
        top={0}
        left={`${minutesToTimelinePercent(tick.minutes, view.timelineRange)}%`}
        transform="translateX(-50%)"
        fontVariantNumeric="tabular-nums"
        lineHeight="20px"
        whiteSpace="nowrap"
      >
        {tick.label}
      </Box>
    ))}
  </Box>
);

/**
 * 1時間ごとの縦線。時刻の軸の下から、最後の帯の下端まで、帯の後ろに引く。
 * 帯と同じ物差しと余白の内側に置き、スタッフのカードのバーの時刻と縦にそろえる。
 */
const HourLines = ({ view }: { view: DayFulfillmentView }) => (
  <Box
    position="absolute"
    top={`${AXIS_HEIGHT_PX}px`}
    bottom={3}
    left={TIMELINE_INSET_X}
    right={TIMELINE_INSET_X}
    pointerEvents="none"
    aria-hidden
  >
    {view.hourLines.map((minutes) => (
      <Box
        key={minutes}
        data-hour-line-minutes={minutes}
        position="absolute"
        top={0}
        bottom={0}
        left={`${minutesToTimelinePercent(minutes, view.timelineRange)}%`}
        w="1px"
        ms="-0.5px"
        bg="gray.200"
      />
    ))}
  </Box>
);

/**
 * 選んでいる日の充足。入れるものの行のすぐ下に、画面の幅いっぱいの区画として置く。
 * 閉じた状態は「充足 72%」と進捗バーの1行で、開くと、ポジションごとの充足の帯を出す。
 * 上端に留めるかどうかは、置く側（DetailControls）が決める。
 * 必要人数のない日（viewがnull）は何も出さない。
 */
export const FulfillmentSection = ({ view }: { view: DayFulfillmentView | null }) => {
  const [isExpanded, setExpanded] = useAtom(isFulfillmentExpandedAtom);
  const contentId = useId();
  if (!view) return null;

  const percentStyle = getFulfillmentPercentStyle(view.percent);

  return (
    <Box as="section" aria-label="充足" bg="white" borderBottomWidth="1px" borderColor="gray.200">
      <chakra.button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
        display="flex"
        alignItems="center"
        gap={3}
        w="full"
        minH="44px"
        px={4}
        textAlign="left"
        cursor="pointer"
        transitionProperty="colors"
        transitionDuration="faster"
        _active={{ bg: "gray.100", transitionDuration: "0ms" }}
        _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
      >
        <Box
          as="span"
          textStyle="sm"
          fontWeight={700}
          flexShrink={0}
          fontVariantNumeric="tabular-nums"
          color={percentStyle.color}
        >
          充足 {view.percent}%
        </Box>
        <Box flex={1} minW={0}>
          {!isExpanded && (
            <Box h="6px" borderRadius="full" bg="gray.200" overflow="hidden" aria-hidden>
              <Box h="full" borderRadius="full" bg={percentStyle.barColor} style={{ width: `${view.percent}%` }} />
            </Box>
          )}
        </Box>
        <Icon boxSize={4} color="gray.600" flexShrink={0} aria-hidden>
          {isExpanded ? <LuChevronUp /> : <LuChevronDown />}
        </Icon>
      </chakra.button>
      {isExpanded && (
        <Box id={contentId} position="relative" pb={3} px={TIMELINE_INSET_X}>
          <TimeAxis view={view} />
          <HourLines view={view} />
          {view.bands.map((band, index) => (
            <Box key={band.positionId} position="relative" mt={index === 0 ? 1 : 2}>
              {view.showsPositionNames && (
                // 名前の文字は、後ろの縦線と重ならないよう白の地に載せる。
                <Flex
                  align="center"
                  gap="6px"
                  w="fit-content"
                  maxW="full"
                  pe={1}
                  mb="2px"
                  bg="white"
                  textStyle="xs"
                  fontWeight={600}
                  color="gray.800"
                >
                  <Box
                    boxSize="8px"
                    borderRadius="full"
                    flexShrink={0}
                    style={{ background: band.color }}
                    aria-hidden
                  />
                  <Box as="span" truncate>
                    {band.name}
                  </Box>
                </Flex>
              )}
              <FulfillmentBand
                label={`${band.name}の充足`}
                segments={band.segments}
                range={view.range}
                timelineRange={view.timelineRange}
                minLabelWidthPx={MIN_LABEL_WIDTH_PX}
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};
