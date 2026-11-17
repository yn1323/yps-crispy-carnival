import { Box, chakra, Flex, Popover, Text } from "@chakra-ui/react";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { LuClock } from "react-icons/lu";
import { TimelineGridLines, TimelineHourLabels } from "@/src/components/shared/ShiftTimeline";
import {
  getDisplayEndMinutes,
  getDisplayStartMinutes,
  getEditableEndMinutes,
  getEditableStartMinutes,
  getTimeAxisWidth,
  minutesToPixel,
} from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import { Button, IconButton } from "@/src/components/ui/Button";
import type { StaffingCountSpan } from "@/src/domains/shift/staffingSegments";
import type { TimeRange } from "@/src/domains/shift/types";
import {
  type BandMetrics,
  formatBandTimeRange,
  getCountLabel,
  getSegmentBackground,
  getSpanLabel,
  getSwipeTimeLabelCenter,
  type StaffingCountBandLayout,
  type StaffingCountBandPosition,
} from "./script";

type MinuteRange = { startMinutes: number; endMinutes: number };

type BandRowProps = {
  position: StaffingCountBandPosition;
  /** 受付時間を、人数が変わる時刻で区切った区間。人数の入っていない時間は0人の区間として含む。 */
  spans: readonly StaffingCountSpan[];
  timeRange: TimeRange;
  unitMinutes: number;
  /** 1時間の幅（px） */
  hourWidth: number;
  metrics: BandMetrics;
  layout: StaffingCountBandLayout;
  /** 帯を横にスクロールしても左に留める要素（見出し、その場に出す欄）の幅。 */
  stickyWidth: string;
  isReadOnly: boolean;
  /** このポジションで横へ動いた、なぞっている途中の範囲（分）。時刻の札と一緒に出す。 */
  swipedRange: MinuteRange | null;
  /** 人数を選ぶ欄を開いている範囲（分） */
  selectedRange: MinuteRange | null;
  /** 選んだ範囲の枠を、吹き出しの位置の基準にするか。 */
  anchorsPopover: boolean;
  /** その場に出す、人数を選ぶ欄。帯のすぐ下に置く。 */
  inlineForm: ReactNode;
  onTrackPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  /** 区間（または空いた時間）を押したとき */
  onOpenSpan: (span: StaffingCountSpan) => void;
  /** 「時間を選んで入れる」を押したとき */
  onOpenPick: () => void;
};

const PICK_LABEL = "時間を選んで入れる";
// 区間どうしのすき間。人数が変わる境目を、色だけに頼らずに見分けられるようにする。
const SPAN_GAP_PX = 2;
// 区間の地と、行の上下のすき間。
const FILL_INSET_PX = 4;
// なぞっている間の時刻の札の高さと、行との間隔。札は指で隠れないよう、行の上に出す。
const SWIPE_TIME_LABEL_HEIGHT_PX = 24;
const SWIPE_TIME_LABEL_GAP_PX = 4;

/**
 * 1つのポジションの帯。区間と空いた時間はボタンで、押すと人数を選ぶ欄を開く。
 * 帯の上を横になぞる操作は、使う側が onTrackPointerDown で受け取る。
 */
export const BandRow = ({
  position,
  spans,
  timeRange,
  unitMinutes,
  hourWidth,
  metrics,
  layout,
  stickyWidth,
  isReadOnly,
  swipedRange,
  selectedRange,
  anchorsPopover,
  inlineForm,
  onTrackPointerDown,
  onOpenSpan,
  onOpenPick,
}: BandRowProps) => {
  const { labelColumnWidth, actionColumnWidth, axisPadding, rowHeight } = metrics;
  const toPixel = (minutes: number) => minutesToPixel(minutes, timeRange, hourWidth, axisPadding);
  const peakCount = Math.max(0, ...spans.map((span) => span.count));
  const hasAnyCount = peakCount > 0;
  const trackWidth = getTimeAxisWidth(timeRange, hourWidth, axisPadding);

  const highlighted = swipedRange ?? selectedRange;
  const highlight = highlighted && (
    <Box
      data-band-selection
      position="absolute"
      left={`${toPixel(highlighted.startMinutes)}px`}
      width={`${toPixel(highlighted.endMinutes) - toPixel(highlighted.startMinutes)}px`}
      top="1px"
      bottom="1px"
      borderWidth="2px"
      borderColor="teal.600"
      borderRadius="md"
      bg="blackAlpha.200"
      pointerEvents="none"
      zIndex={3}
    />
  );

  const track = (
    <Box
      data-band-track={position.id}
      position="relative"
      flex={1}
      minW={0}
      h={`${rowHeight}px`}
      userSelect="none"
      // 指の縦の動きは画面のスクロール、横の動きは範囲を選ぶ操作にする。
      touchAction={isReadOnly ? undefined : "pan-y pinch-zoom"}
      css={{ WebkitTouchCallout: "none" }}
      onPointerDown={isReadOnly ? undefined : onTrackPointerDown}
    >
      <NonEditableOverlay timeRange={timeRange} toPixel={toPixel} />
      <TimelineGridLines unitMinutes={unitMinutes} hourWidth={hourWidth} axisPadding={axisPadding} />
      {spans.map((span) => (
        <BandSpan
          key={span.startMinutes}
          position={position}
          span={span}
          left={toPixel(span.startMinutes)}
          width={toPixel(span.endMinutes) - toPixel(span.startMinutes)}
          rowHeight={rowHeight}
          peakCount={peakCount}
          hasAnyCount={hasAnyCount}
          isReadOnly={isReadOnly}
          onOpen={() => onOpenSpan(span)}
        />
      ))}
      {highlight && (anchorsPopover && !swipedRange ? <Popover.Anchor asChild>{highlight}</Popover.Anchor> : highlight)}
    </Box>
  );

  const swipeTimeLabel = swipedRange && (
    <Text
      data-band-swipe-time
      aria-hidden
      position="absolute"
      left={`${
        labelColumnWidth +
        getSwipeTimeLabelCenter({
          left: toPixel(swipedRange.startMinutes),
          width: toPixel(swipedRange.endMinutes) - toPixel(swipedRange.startMinutes),
          trackWidth,
        })
      }px`}
      bottom={`${rowHeight + SWIPE_TIME_LABEL_GAP_PX}px`}
      h={`${SWIPE_TIME_LABEL_HEIGHT_PX}px`}
      lineHeight={`${SWIPE_TIME_LABEL_HEIGHT_PX}px`}
      transform="translateX(-50%)"
      px={2}
      borderRadius="md"
      bg="gray.900"
      color="white"
      textStyle="xs"
      fontWeight={700}
      fontVariantNumeric="tabular-nums"
      whiteSpace="nowrap"
      boxShadow="md"
      pointerEvents="none"
      zIndex={6}
    >
      {formatBandTimeRange(swipedRange)}
    </Text>
  );

  const dot = (
    <Box boxSize="10px" borderRadius="full" flexShrink={0} style={{ background: position.color }} aria-hidden />
  );

  return (
    <Box role="group" aria-label={`${position.name}の必要人数`} borderTopWidth="1px" borderColor="gray.200">
      {layout === "narrow" && (
        <>
          <Flex
            align="center"
            justify="space-between"
            gap={2}
            minH="44px"
            // 帯を横にスクロールしても、ポジション名とボタンは見える位置に留める。
            position="sticky"
            left={0}
            w={stickyWidth}
          >
            <Flex align="center" gap={2} minW={0}>
              {dot}
              <Text textStyle="sm" fontWeight={700} color="gray.900" lineClamp={2} wordBreak="break-all">
                {position.name}
              </Text>
            </Flex>
            {!isReadOnly && (
              <Button
                type="button"
                data-band-pick={position.id}
                variant="ghost"
                colorPalette="teal"
                size="xs"
                minH="44px"
                flexShrink={0}
                fontWeight="semibold"
                onClick={onOpenPick}
              >
                {PICK_LABEL}
              </Button>
            )}
          </Flex>
          <TimelineHourLabels timeRange={timeRange} hourWidth={hourWidth} axisPadding={axisPadding} />
        </>
      )}
      <Flex position="relative">
        {layout === "wide" && (
          <Flex
            align="center"
            gap={2}
            w={`${labelColumnWidth}px`}
            flexShrink={0}
            pr={2}
            // 帯を横にスクロールしても、ポジション名は見える位置に留める。
            position="sticky"
            left={0}
            zIndex={4}
            bg="white"
          >
            {dot}
            <Text
              textStyle="sm"
              fontWeight={700}
              color="gray.900"
              lineHeight="short"
              lineClamp={2}
              wordBreak="break-all"
              title={position.name}
            >
              {position.name}
            </Text>
          </Flex>
        )}
        {track}
        {layout === "wide" && (
          <Flex
            align="center"
            justify="flex-end"
            w={`${actionColumnWidth}px`}
            flexShrink={0}
            position="sticky"
            right={0}
            zIndex={4}
            bg="white"
          >
            {!isReadOnly && (
              <IconButton
                type="button"
                data-band-pick={position.id}
                variant="ghost"
                colorPalette="gray"
                size="sm"
                aria-label={PICK_LABEL}
                title={PICK_LABEL}
                onClick={onOpenPick}
              >
                <LuClock />
              </IconButton>
            )}
          </Flex>
        )}
        {swipeTimeLabel}
      </Flex>
      {inlineForm && (
        <Box position="sticky" left={0} w={stickyWidth} pt={2} pb={3}>
          {inlineForm}
        </Box>
      )}
    </Box>
  );
};

type BandSpanProps = {
  position: StaffingCountBandPosition;
  span: StaffingCountSpan;
  left: number;
  width: number;
  rowHeight: number;
  /** 色の濃さの基準にする、このポジションのいちばん多い人数 */
  peakCount: number;
  /** このポジションに、人数の入った時間が1つでもあるか */
  hasAnyCount: boolean;
  isReadOnly: boolean;
  onOpen: () => void;
};

/** 人数が変わらない、ひと続きの時間。人数の入った区間は色の地で出す。空いた時間は何も出さないか、案内文を出す。 */
const BandSpan = ({
  position,
  span,
  left,
  width,
  rowHeight,
  peakCount,
  hasAnyCount,
  isReadOnly,
  onOpen,
}: BandSpanProps) => {
  const fillWidth = Math.max(0, width - SPAN_GAP_PX);
  const label = getCountLabel(span.count, fillWidth);
  const isFilled = span.count > 0;
  // 人数を1つも入れていないポジションは、空いた時間に案内文を出す。
  const isHint = !hasAnyCount;
  const accessibleLabel = getSpanLabel(position.name, span);

  const fill = (
    <Box
      as="span"
      data-band-fill
      position="absolute"
      left={`${SPAN_GAP_PX / 2}px`}
      right={`${SPAN_GAP_PX / 2}px`}
      top={`${FILL_INSET_PX}px`}
      bottom={`${FILL_INSET_PX}px`}
      display="flex"
      alignItems="center"
      justifyContent={isHint || label.isCompact ? "center" : "flex-start"}
      pl={isHint || label.isCompact ? 0 : "6px"}
      borderRadius="sm"
      borderWidth={isHint ? "1px" : 0}
      borderStyle="dashed"
      borderColor="gray.300"
      // 狭い区間でも数字を切らずに出す。
      overflow={isHint ? "hidden" : "visible"}
      pointerEvents="none"
      style={isFilled ? { background: getSegmentBackground(position.color, span.count, peakCount) } : undefined}
    >
      {isHint ? (
        <Text as="span" textStyle="xs" color="gray.600" truncate px={2}>
          {isReadOnly ? "人数は入っていません" : "ドラッグして人数を設定"}
        </Text>
      ) : (
        isFilled && (
          <Text
            as="span"
            textStyle="xs"
            fontWeight={700}
            color="gray.900"
            fontVariantNumeric="tabular-nums"
            whiteSpace="nowrap"
          >
            {label.text}
          </Text>
        )
      )}
    </Box>
  );

  const frame = {
    position: "absolute",
    left: `${left}px`,
    width: `${Math.max(0, width)}px`,
    top: 0,
    h: `${rowHeight}px`,
    zIndex: 2,
  } as const;

  if (isReadOnly) {
    // 閲覧専用で人数の入っていない時間は、読み上げる内容がないため、案内文だけを残す。
    if (!isFilled && !isHint) return null;
    return (
      <Box role="img" aria-label={isFilled ? accessibleLabel : `${position.name} 人数は入っていません`} {...frame}>
        {fill}
      </Box>
    );
  }

  return (
    <chakra.button
      type="button"
      data-band-span={position.id}
      data-start={span.startMinutes}
      data-end={span.endMinutes}
      aria-label={accessibleLabel}
      {...frame}
      p={0}
      bg="transparent"
      cursor="pointer"
      // 押している間と、ポインタを載せている間は、地の色を少し変えて押せることを伝える。位置と大きさは変えない。
      css={{
        "&:hover > [data-band-fill]": isFilled
          ? { filter: "brightness(0.96)" }
          : { background: "var(--chakra-colors-black-alpha-50)" },
        "&:active > [data-band-fill]": isFilled
          ? { filter: "brightness(0.9)" }
          : { background: "var(--chakra-colors-black-alpha-200)" },
      }}
      _focusVisible={{ outline: "2px solid", outlineColor: "gray.900", outlineOffset: "-2px", zIndex: 4 }}
      onClick={onOpen}
    >
      {fill}
    </chakra.button>
  );
};

/** 受付時間の外の時間。表示は1時間単位へ広げているため、端に残る編集できない時間を灰色にする。 */
const NonEditableOverlay = ({ timeRange, toPixel }: { timeRange: TimeRange; toPixel: (minutes: number) => number }) => {
  const displayStart = getDisplayStartMinutes(timeRange);
  const displayEnd = getDisplayEndMinutes(timeRange);
  const ranges = [
    { start: displayStart, end: getEditableStartMinutes(timeRange) },
    { start: getEditableEndMinutes(timeRange), end: displayEnd },
  ].filter((range) => range.end > range.start);

  return (
    <>
      {ranges.map((range) => {
        const left = toPixel(range.start);
        return (
          <Box
            key={range.start}
            position="absolute"
            left={`${left}px`}
            width={`${toPixel(range.end) - left}px`}
            top={0}
            bottom={0}
            bg="gray.100"
            opacity={0.85}
            pointerEvents="none"
          />
        );
      })}
    </>
  );
};
