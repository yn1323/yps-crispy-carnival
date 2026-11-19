import { Box, chakra, Flex, Icon } from "@chakra-ui/react";
import { useAtom, useAtomValue } from "jotai";
import { useId } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { FulfillmentBand } from "../../FulfillmentBand";
import { type DayFulfillmentView, getFulfillmentPercentStyle } from "../../fulfillmentPresentation";
import { isFulfillmentExpandedAtom, selectedDayFulfillmentViewAtom } from "../../stores";

const BAND_HEIGHT_PX = 28;
// 不足の人数は、この幅以上の区間にだけ出す。狭い区間は色だけで示す。
const MIN_LABEL_WIDTH_PX = 28;
const AXIS_HEIGHT_PX = 20;

/** 3時間ごとの時刻。帯と同じ幅に置く。両端の時刻は、画面の端で切れないよう内側へ寄せる。 */
const TimeAxis = ({ view }: { view: DayFulfillmentView }) => {
  const { range } = view;
  return (
    <Box position="relative" h={`${AXIS_HEIGHT_PX}px`} textStyle="xs" color="gray.600" aria-hidden>
      {view.ticks.map((tick) => {
        const position =
          tick.minutes === range.start
            ? { left: "16px" }
            : tick.minutes === range.end
              ? { right: "16px" }
              : {
                  left: `${((tick.minutes - range.start) / (range.end - range.start)) * 100}%`,
                  transform: "translateX(-50%)",
                };
        return (
          <Box
            key={tick.minutes}
            position="absolute"
            top={0}
            fontVariantNumeric="tabular-nums"
            lineHeight="20px"
            whiteSpace="nowrap"
            {...position}
          >
            {tick.label}
          </Box>
        );
      })}
    </Box>
  );
};

/**
 * 選んでいる日の充足。日付の見出しのすぐ下に、画面の幅いっぱいの区画として置く。
 * 閉じた状態は「充足 72%」と進捗バーの1行で、一覧をスクロールしても上端に留まる。
 * 開くと、ポジションごとの充足の帯を出し、一覧と一緒にスクロールする。
 * 必要人数のない日は何も出さない。
 */
export const FulfillmentSection = () => {
  const view = useAtomValue(selectedDayFulfillmentViewAtom);
  const [isExpanded, setExpanded] = useAtom(isFulfillmentExpandedAtom);
  const contentId = useId();
  if (!view) return null;

  const percentStyle = getFulfillmentPercentStyle(view.percent);

  return (
    <Box
      as="section"
      aria-label="充足"
      position={isExpanded ? "static" : "sticky"}
      top={0}
      zIndex={2}
      bg="white"
      borderBottomWidth="1px"
      borderColor="gray.200"
    >
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
        <Box id={contentId} pb={3}>
          <TimeAxis view={view} />
          {view.bands.map((band, index) => (
            <Box key={band.positionId} mt={index === 0 ? 1 : 2}>
              {view.showsPositionNames && (
                <Flex align="center" gap="6px" px={4} pb="2px" textStyle="xs" fontWeight={600} color="gray.800">
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
                heightPx={BAND_HEIGHT_PX}
                minLabelWidthPx={MIN_LABEL_WIDTH_PX}
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};
