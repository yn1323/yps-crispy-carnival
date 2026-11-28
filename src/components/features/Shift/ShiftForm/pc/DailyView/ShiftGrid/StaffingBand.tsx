import { Box, chakra, Flex, Icon, Popover, Portal, Presence, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { useRef, useState } from "react";
import { LuCheck, LuChevronDown, LuChevronUp, LuDiff, LuUsers } from "react-icons/lu";
import { minutesToPixel } from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import { getCountLabel, getSegmentBackground } from "@/src/components/shared/StaffingCountBandEditor";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Tooltip } from "@/src/components/ui/tooltip";
import { formatShiftClockTimeRange, minutesToTime } from "@/src/domains/shift/time";
import type { TimeRange } from "@/src/domains/shift/types";
import { DayTemplateMenu, NewcomerOnlyMark, useDayStaffingView } from "../../../staffingParts";
import {
  type DayStaffingView,
  describeStaffingCount,
  getBandSegmentStyle,
  type RequiredSpanView,
  resolveBandSegmentContent,
  type StaffingBandSegmentView,
  type StaffingBandView,
  summarizeStaffingBands,
  toRequiredSpans,
} from "../../../staffingPresentation";
import { hourWidthAtom, selectedDateAtom, shiftConfigAtom } from "../../../stores";
import { TimeHeader } from "../TimeHeader";
import { GridLines } from "./GridLines";
import { NonEditableTimeOverlay } from "./NonEditableTimeOverlay";

const SEGMENT_GAP_PX = 2;
const BAND_ROW_HEIGHT_PX = 28;
// 行が増えても表を隠しきらないよう、帯の行は6行分までにとどめ、それ以上は帯の中でスクロールさせる。
const BAND_MAX_VISIBLE_ROWS = 6;

type SegmentProps = {
  band: StaffingBandView;
  segment: StaffingBandSegmentView;
  timeRange: TimeRange;
  hourWidth: number;
  /** その日に必要人数が1つでもあるか。ない日は、人数をポジションの色の箱に入れて出す。 */
  dayHasRequirements: boolean;
};

/** 帯の1区間。過不足だけを出し、人数と必要人数、見習いだけであることは、titleと押したときの欄で出す。 */
const BandSegment = ({ band, segment, timeRange, hourWidth, dayHasRequirements }: SegmentProps) => {
  const left = minutesToPixel(segment.startMinutes, timeRange, hourWidth);
  const width = Math.max(0, minutesToPixel(segment.endMinutes, timeRange, hourWidth) - left - SEGMENT_GAP_PX);
  const content = resolveBandSegmentContent(segment, width);
  const style = getBandSegmentStyle(segment, {
    dayHasRequirements,
    positionColor: band.color,
  });
  const description = describeStaffingCount(segment);

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
          {content.showsCheckMark && (
            <Icon boxSize={3.5} aria-hidden>
              <LuCheck />
            </Icon>
          )}
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
            </Flex>
            <Text textStyle="sm" fontWeight={500} color="gray.600" fontVariantNumeric="tabular-nums">
              {segment.timeLabel}
            </Text>
            <Box mt={2} textStyle="sm" color="gray.800">
              <Text fontVariantNumeric="tabular-nums">{description.count}</Text>
              {/* 帯の注意のアイコンと同じ色で示す。 */}
              {description.newcomerNote && (
                <Text color="orange.700" fontWeight={600}>
                  {description.newcomerNote}
                </Text>
              )}
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
 * 見出しには、帯が比べる必要人数の元になる、その日のテンプレートを置く。
 */
export const StaffingBand = ({ leftWidth }: { leftWidth: number }) => {
  const selectedDate = useAtomValue(selectedDateAtom);
  const view = useDayStaffingView(selectedDate);
  // シンプル表示へ切り替えたあとも、下へ消えきるまでは直前の人数を出す。
  const lastViewRef = useRef(view);
  if (view) lastViewRef.current = view;
  const shownView = view ?? lastViewRef.current;

  return (
    // 帯の枠。表の下端に留め、枠の下へ出た帯を切り取って、表の下端から出入りして見せる。
    // スタッフが少ない日も、帯を表の下端に留める。
    <Box position="sticky" bottom={0} mt="auto" zIndex={9} overflow="clip" css={{ overflowClipMargin: "6px" }}>
      <Presence
        present={view !== null}
        lazyMount
        unmountOnExit
        // 開いた時点でくわしく表示の画面では、動かさずに出す。
        skipAnimationOnMount
        _open={{
          animationName: "slide-from-bottom-full",
          animationDuration: "moderate",
          animationTimingFunction: "ease-out",
        }}
        _closed={{
          animationName: "slide-to-bottom-full",
          animationDuration: "moderate",
          animationTimingFunction: "ease-in",
        }}
        _motionReduce={{ animation: "none" }}
      >
        {shownView && <StaffingBandContent view={shownView} leftWidth={leftWidth} />}
      </Presence>
    </Box>
  );
};

/**
 * 必要人数だけを見せる区間。「必要人数設定」のテンプレートと同じく、ポジションの色を人数に合わせて濃くし、人数を出す。
 * 必要人数が変わる時刻だけで区切り、押しても何も開かない。
 */
const RequiredSpan = ({
  band,
  span,
  peak,
  timeRange,
  hourWidth,
}: {
  band: StaffingBandView;
  span: RequiredSpanView;
  /** その帯で最も多い必要人数。地色の濃さの基準にする。 */
  peak: number;
  timeRange: TimeRange;
  hourWidth: number;
}) => {
  const left = minutesToPixel(span.startMinutes, timeRange, hourWidth);
  const width = Math.max(0, minutesToPixel(span.endMinutes, timeRange, hourWidth) - left - SEGMENT_GAP_PX);
  const label = getCountLabel(span.required, width);
  const description = `${band.name} ${formatShiftClockTimeRange(minutesToTime(span.startMinutes), minutesToTime(span.endMinutes))} 必要${span.required}人`;

  return (
    <Flex
      data-required-span={span.required}
      title={description}
      position="absolute"
      left={`${left + SEGMENT_GAP_PX / 2}px`}
      width={`${width}px`}
      top="3px"
      bottom="3px"
      align="center"
      justify="center"
      overflow="hidden"
      borderRadius="sm"
      color="gray.900"
      textStyle="xs"
      fontWeight={700}
      fontVariantNumeric="tabular-nums"
      whiteSpace="nowrap"
      style={{ background: getSegmentBackground(band.color, span.required, peak) }}
    >
      <Box as="span" aria-hidden>
        {label.text}
      </Box>
      <chakra.span srOnly>{description}</chakra.span>
    </Flex>
  );
};

const StaffingBandContent = ({ view, leftWidth }: { view: DayStaffingView; leftWidth: number }) => {
  const selectedDate = useAtomValue(selectedDateAtom);
  const hourWidth = useAtomValue(hourWidthAtom);
  const { timeRange } = useAtomValue(shiftConfigAtom);
  const [isExpanded, setExpanded] = useState(false);
  // 帯の見せ方。falseは過不足（−1、+2、チェック）、trueはテンプレートと同じ必要人数。
  const [showsRequired, setShowsRequired] = useState(false);
  // 必要人数がない日は、必要人数で見せるものがないため、過不足の見せ方に戻す。
  const isRequiredMode = showsRequired && view.hasRequirements;
  const toggleLabel = isRequiredMode ? "過不足で表示" : "必要人数で表示";
  // 必要人数で見せる間は、過不足のないポジションもまとめずにすべて出す。
  const summary = summarizeStaffingBands(view, isExpanded || isRequiredMode);

  return (
    <Box
      as="section"
      aria-label="人数"
      bg="white"
      borderTopWidth="1px"
      borderColor="gray.300"
      boxShadow="0 -2px 4px rgba(0,0,0,0.04)"
    >
      {/*
        見出しの左にその日のテンプレートのメニュー、右に表の上と同じ時刻を置く。
        足りない時間と見習いだけの時間は、帯の区間で示す。必要人数がない日は、テンプレートが「未設定」と出る。
      */}
      <Flex align="center">
        <Flex
          w={`${leftWidth}px`}
          flexShrink={0}
          align="center"
          gap={2}
          px={3}
          py="6px"
          minW={0}
          alignSelf="stretch"
          borderRightWidth="1px"
          borderColor="gray.100"
        >
          {/* 1列目の幅いっぱいに広げ、入りきらない名前は「…」で省略する。 */}
          <DayTemplateMenu date={selectedDate} view={view} fillsWidth />
          {/* 見た目は切り替えても変えず、押すと次に切り替わる見せ方のアイコンへ変える。 */}
          <Tooltip content={toggleLabel} openDelay={300}>
            <IconButton
              aria-label={toggleLabel}
              size="xs"
              h="28px"
              minW="28px"
              flexShrink={0}
              // どちらの見せ方でも、tealの地に白のアイコンで出す。
              variant="solid"
              colorPalette="teal"
              disabled={!view.hasRequirements}
              onClick={() => setShowsRequired((current) => !current)}
            >
              {isRequiredMode ? <LuDiff /> : <LuUsers />}
            </IconButton>
          </Tooltip>
        </Flex>
        <Box flex={1} minW={0} aria-hidden>
          <TimeHeader timeRange={timeRange} />
        </Box>
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
            <Box role="group" aria-label={`${band.name}の人数`} position="relative" flex={1} minW={0} bg="gray.50">
              {/* 表の行と同じ地の色、受付時間外の網かけ、縦線を、区間の後ろに敷く。 */}
              <NonEditableTimeOverlay timeRange={timeRange} />
              <GridLines timeRange={timeRange} />
              {isRequiredMode
                ? (() => {
                    const spans = toRequiredSpans(band.segments);
                    const peak = Math.max(0, ...spans.map((span) => span.required));
                    return spans.map((span) => (
                      <RequiredSpan
                        key={span.key}
                        band={band}
                        span={span}
                        peak={peak}
                        timeRange={timeRange}
                        hourWidth={hourWidth}
                      />
                    ));
                  })()
                : band.segments.map((segment) => (
                    <BandSegment
                      key={segment.key}
                      band={band}
                      segment={segment}
                      timeRange={timeRange}
                      hourWidth={hourWidth}
                      dayHasRequirements={view.hasRequirements}
                    />
                  ))}
            </Box>
          </Flex>
        ))}
      </Box>
      {summary.toggleLabel && !isRequiredMode && (
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
