import { Box, chakra, Flex, type FlexProps, Icon } from "@chakra-ui/react";
import { useAtom } from "jotai";
import { useId, useState } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { FulfillmentBand, FulfillmentRequiredBand } from "../../FulfillmentBand";
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

const BAND_MODES = [
  { value: false, label: "不足" },
  { value: true, label: "必要" },
] as const;

/**
 * 帯の見せ方を選ぶ2つ並びの切り替え。「不足」は過不足（−1と色）、「必要」はPCの帯と同じ必要人数で見せる。
 * 選んでいる側を白の地に濃い文字で浮かせ、選んでいない側は灰色の地に薄い文字にする。
 */
const BandModeToggle = ({
  showsRequired,
  onModeChange,
  ...boxProps
}: { showsRequired: boolean; onModeChange: (showsRequired: boolean) => void } & Omit<FlexProps, "onChange">) => (
  <Flex
    role="radiogroup"
    aria-label="帯の見せ方"
    p="2px"
    gap="2px"
    bg="gray.100"
    borderWidth="1px"
    borderColor="gray.200"
    borderRadius="md"
    {...boxProps}
  >
    {BAND_MODES.map((mode) => {
      const checked = mode.value === showsRequired;
      return (
        <chakra.button
          key={mode.label}
          type="button"
          role="radio"
          aria-checked={checked}
          onClick={() => onModeChange(mode.value)}
          position="relative"
          h="28px"
          px={3}
          borderRadius="sm"
          textStyle="sm"
          fontWeight={checked ? 600 : 500}
          color={checked ? "gray.900" : "gray.600"}
          bg={checked ? "white" : "transparent"}
          boxShadow={checked ? "0 1px 2px rgba(0,0,0,0.08)" : undefined}
          cursor="pointer"
          transitionProperty="colors"
          transitionDuration="faster"
          // 見た目は小さく保ち、押せる範囲だけを高さ44pxまで広げる。
          _after={{ content: '""', position: "absolute", insetX: 0, insetY: "-8px" }}
          _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
        >
          {mode.label}
        </chakra.button>
      );
    })}
  </Flex>
);

/**
 * 選んでいる日の充足。入れるものの行のすぐ下に、画面の幅いっぱいの区画として置く。
 * 閉じた状態は「充足 72%」と進捗バーの1行で、開くと、ポジションごとの充足の帯を出す。
 * 開いた帯は、PCの帯と同じく、過不足と必要人数の見せ方を切り替えられる。
 * 上端に留めるかどうかは、置く側（DetailControls）が決める。
 * 必要人数のない日（viewがnull）は何も出さない。
 */
export const FulfillmentSection = ({ view }: { view: DayFulfillmentView | null }) => {
  const [isExpanded, setExpanded] = useAtom(isFulfillmentExpandedAtom);
  // 帯の見せ方。falseは過不足（−1と色）、trueはテンプレートと同じ必要人数。
  const [showsRequired, setShowsRequired] = useState(false);
  const contentId = useId();
  if (!view) return null;

  const percentStyle = getFulfillmentPercentStyle(view.percent);

  return (
    <Box as="section" aria-label="充足" bg="white" borderBottomWidth="1px" borderColor="gray.200">
      {/* 行全体が開閉のボタンのため、見せ方の切り替えは中に入れず、行の中央に重ねて置く。 */}
      <Box position="relative">
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
        {/* 開いている間だけ、開閉の印の左に出す。 */}
        {isExpanded && (
          <BandModeToggle
            showsRequired={showsRequired}
            onModeChange={setShowsRequired}
            position="absolute"
            top="50%"
            right="44px"
            transform="translateY(-50%)"
          />
        )}
      </Box>
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
              {showsRequired ? (
                <FulfillmentRequiredBand
                  label={`${band.name}の必要人数`}
                  spans={band.requiredSpans}
                  range={view.range}
                  timelineRange={view.timelineRange}
                />
              ) : (
                <FulfillmentBand
                  label={`${band.name}の充足`}
                  segments={band.segments}
                  range={view.range}
                  timelineRange={view.timelineRange}
                  minLabelWidthPx={MIN_LABEL_WIDTH_PX}
                />
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};
