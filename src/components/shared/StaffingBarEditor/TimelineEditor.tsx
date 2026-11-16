import { Box, chakra, Flex, Text } from "@chakra-ui/react";
import { type MutableRefObject, type PointerEvent as ReactPointerEvent, useId, useMemo, useRef, useState } from "react";
import { LuChevronDown, LuChevronRight, LuPlus } from "react-icons/lu";
import { TimelineGridLines, TimelineHourLabels } from "@/src/components/shared/ShiftTimeline";
import {
  getDisplayEndMinutes,
  getDisplayStartMinutes,
  getTimeAxisWidth,
  isWithinEditableRange,
  minutesToPixel,
  pixelToEditableMinutes,
  pixelToRawMinutes,
} from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import { Button } from "@/src/components/ui/Button";
import {
  addStaffingBar,
  countRequiredSegments,
  type EditableStaffingBar,
  getResizedStaffingBarTime,
  isStaffingBarWithinRange,
  packStaffingBars,
  type RequiredSegment,
  removeStaffingBar,
  resizeStaffingBar,
  type StaffingBarResult,
  type StaffingBarRules,
} from "@/src/domains/shift/staffingBars";
import { formatShiftClockTimeRange, minutesToTime, timeToMinutes } from "@/src/domains/shift/time";
import type { TimeRange } from "@/src/domains/shift/types";
import { RequiredCountSegments } from "./RequiredCountSegments";
import {
  buildTimelineRange,
  getDragTimeLabelCenter,
  getMinTrackWidth,
  getRejectionMessage,
  getTimelineMetrics,
  isBarOnTimeline,
  type StaffingBarEditorPosition,
  type StaffingBarLayout,
  type TimelineMetrics,
} from "./script";
import { TimelineBar } from "./TimelineBar";
import { type StaffingBarDrag, type StaffingBarDragSource, useStaffingBarDrag } from "./useStaffingBarDrag";
import { useTimelineHourWidth } from "./useTimelineHourWidth";

type TimelineEditorProps = {
  positions: readonly StaffingBarEditorPosition[];
  bars: readonly EditableStaffingBar[];
  rules: StaffingBarRules;
  isReadOnly: boolean;
  /** narrowでは、左の列を行の番号だけにし、ポジションごとに「できあがる必要人数」を出す。 */
  layout: StaffingBarLayout;
  /** 指で操作する画面か。バーを押すと onOpenEdit の入力を開き、端の伸び縮みは出さない。なぞっている間は時刻を出す。 */
  isTouch: boolean;
  onChange: (bars: EditableStaffingBar[]) => void;
  /** 「時刻を選んで足す」を押したとき */
  onOpenAdd: (position: StaffingBarEditorPosition) => void;
  /** 指で操作する画面で、バーを押したとき */
  onOpenEdit: (position: StaffingBarEditorPosition, bar: EditableStaffingBar) => void;
};

type Notice = { positionId: string; message: string };

// 「できあがる必要人数」の帯の高さ。
const COUNT_ROW_HEIGHT_PX = 28;
// なぞっている間の時刻の札の高さと、行との間隔。札は指で隠れないよう、行の上に出す。
const DRAG_TIME_LABEL_HEIGHT_PX = 24;
const DRAG_TIME_LABEL_GAP_PX = 6;

/**
 * バーの表。空いた場所をなぞるとバーが引ける。マウスでも指でも同じ操作になる。
 * マウスで使う画面では、バーの端をドラッグして伸び縮みできる。
 * 足す、伸び縮みさせる、時刻を変える操作のあと、同じ行で端が接したバーは1本にまとまる。
 */
export const TimelineEditor = ({
  positions,
  bars,
  rules,
  isReadOnly,
  layout,
  isTouch,
  onChange,
  onOpenAdd,
  onOpenEdit,
}: TimelineEditorProps) => {
  const metrics = useMemo(() => getTimelineMetrics(layout), [layout]);
  const timeRange = useMemo(() => buildTimelineRange(rules.range, rules.unitMinutes), [rules]);
  const { measureRef, hourWidth } = useTimelineHourWidth(timeRange.end - timeRange.start, metrics);
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<Notice | null>(null);
  // 端のドラッグでバーを動かした直後のclickでは、バーの欄を開かない。
  const suppressOpenRef = useRef(false);

  const packed = useMemo(
    () =>
      packStaffingBars({
        bars: bars.filter((bar) => isBarOnTimeline(bar, timeRange)),
        positionIds: positions.map((position) => position.id),
      }),
    [bars, positions, timeRange],
  );
  // 狭い画面では、ポジションごとの必要人数を、バーの行のすぐ下に出す。
  const requiredSegments = useMemo(
    () =>
      layout === "narrow"
        ? countRequiredSegments({ bars, positionIds: positions.map((position) => position.id), range: rules.range })
        : [],
    [layout, bars, positions, rules.range],
  );
  const maxRequiredCount = Math.max(
    1,
    ...requiredSegments.flatMap((item) => item.segments.map((segment) => segment.count)),
  );

  const apply = (positionId: string, result: StaffingBarResult) => {
    if (!result.ok) {
      setNotice({ positionId, message: getRejectionMessage(result.reason, rules) });
      return;
    }
    setNotice(null);
    onChange(result.bars);
  };

  const handleCommit = (drag: StaffingBarDrag) => {
    if (drag.kind === "create") {
      const start = Math.min(drag.anchorMinutes, drag.currentMinutes);
      const end = Math.max(drag.anchorMinutes, drag.currentMinutes);
      // 動かさずに離した場合は、何も足さない。
      if (end - start < rules.unitMinutes) return;
      apply(
        drag.positionId,
        addStaffingBar({
          bars,
          bar: { positionId: drag.positionId, start: minutesToTime(start), end: minutesToTime(end) },
          rules,
        }),
      );
      return;
    }
    const before = bars.find((bar) => bar.id === drag.barId);
    const after =
      before && getResizedStaffingBarTime({ bar: before, edge: drag.edge, minutes: drag.currentMinutes, rules });
    // 動かさずに離した場合は、押しただけとして扱い、バーの欄を開く。
    if (before && after && before.start === after.start && before.end === after.end) return;
    const result = resizeStaffingBar({ bars, barId: drag.barId, edge: drag.edge, minutes: drag.currentMinutes, rules });
    // pointerupに続くclickだけを止める。離した場所がバーの外でclickが来ない場合に備え、すぐ戻す。
    suppressOpenRef.current = true;
    window.setTimeout(() => {
      suppressOpenRef.current = false;
    }, 0);
    apply(drag.positionId, result);
  };

  const { drag, startDrag } = useStaffingBarDrag({
    toMinutes: (clientX, trackRect) =>
      pixelToEditableMinutes({
        x: clientX - trackRect.left,
        timeRange,
        hourWidth,
        axisPadding: metrics.axisPadding,
      }),
    onCommit: handleCommit,
  });

  const toggleCollapsed = (positionId: string) =>
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(positionId)) next.delete(positionId);
      else next.add(positionId);
      return next;
    });

  return (
    <Box overflowX="auto">
      <Box minW={`${metrics.labelColumnWidth + getMinTrackWidth(timeRange, metrics)}px`}>
        <Flex>
          <Box w={`${metrics.labelColumnWidth}px`} flexShrink={0} />
          <Box flex={1} minW={0} ref={measureRef}>
            <TimelineHourLabels timeRange={timeRange} hourWidth={hourWidth} axisPadding={metrics.axisPadding} />
          </Box>
        </Flex>
        {positions.map((position, index) => (
          <PositionBlock
            key={position.id}
            position={position}
            rows={packed[index]?.rows ?? [[]]}
            requiredSegments={layout === "narrow" ? (requiredSegments[index]?.segments ?? []) : null}
            maxRequiredCount={maxRequiredCount}
            bars={bars}
            rules={rules}
            timeRange={timeRange}
            hourWidth={hourWidth}
            metrics={metrics}
            layout={layout}
            isReadOnly={isReadOnly}
            isTouch={isTouch}
            isCollapsed={collapsedIds.has(position.id)}
            notice={notice?.positionId === position.id ? notice.message : null}
            drag={drag?.positionId === position.id ? drag : null}
            isDragging={drag !== null}
            suppressOpenRef={suppressOpenRef}
            onToggleCollapsed={() => toggleCollapsed(position.id)}
            onOpenAdd={() => onOpenAdd(position)}
            onOpenEdit={(bar) => onOpenEdit(position, bar)}
            onStartDrag={startDrag}
            onApply={(result) => apply(position.id, result)}
            onChange={(next) => {
              setNotice(null);
              onChange(next);
            }}
          />
        ))}
      </Box>
    </Box>
  );
};

type PositionBlockProps = {
  position: StaffingBarEditorPosition;
  /** 行へ詰めたバー。最後の行は常に空。 */
  rows: EditableStaffingBar[][];
  /** バーの行のすぐ下に出す、このポジションの必要人数。出さない場合はnull。 */
  requiredSegments: readonly RequiredSegment[] | null;
  /** 必要人数の色の濃さの基準にする、いちばん多い人数 */
  maxRequiredCount: number;
  bars: readonly EditableStaffingBar[];
  rules: StaffingBarRules;
  timeRange: TimeRange;
  hourWidth: number;
  metrics: TimelineMetrics;
  layout: StaffingBarLayout;
  isReadOnly: boolean;
  isTouch: boolean;
  isCollapsed: boolean;
  notice: string | null;
  /** このポジションで進んでいるドラッグ */
  drag: StaffingBarDrag | null;
  /** どこかのポジションでドラッグが進んでいるか */
  isDragging: boolean;
  suppressOpenRef: MutableRefObject<boolean>;
  onToggleCollapsed: () => void;
  onOpenAdd: () => void;
  onOpenEdit: (bar: EditableStaffingBar) => void;
  onStartDrag: (drag: StaffingBarDrag, source: StaffingBarDragSource) => void;
  onApply: (result: StaffingBarResult) => void;
  onChange: (bars: EditableStaffingBar[]) => void;
};

const PositionBlock = ({
  position,
  rows,
  requiredSegments,
  maxRequiredCount,
  bars,
  rules,
  timeRange,
  hourWidth,
  metrics,
  layout,
  isReadOnly,
  isTouch,
  isCollapsed,
  notice,
  drag,
  isDragging,
  suppressOpenRef,
  onToggleCollapsed,
  onOpenAdd,
  onOpenEdit,
  onStartDrag,
  onApply,
  onChange,
}: PositionBlockProps) => {
  const bodyId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const { labelColumnWidth, axisPadding, rowHeight, barHeight } = metrics;
  const barTopOffset = (rowHeight - barHeight) / 2;
  // 見出しの本数は、表示範囲の外にあって表に出ないバーも含めて数える。
  const barCount = bars.filter((bar) => bar.positionId === position.id).length;
  // 読み取り専用では、バーを引くための空の行を出さない。表に出るバーがないときだけ、空であることを伝える行を残す。
  const hasEmptyRow = !isReadOnly || rows.length === 1;
  const visibleRows = hasEmptyRow ? rows : rows.slice(0, -1);
  const emptyRowIndex = hasEmptyRow ? visibleRows.length - 1 : -1;
  const toPixel = (minutes: number) => minutesToPixel(minutes, timeRange, hourWidth, axisPadding);

  const handleTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // 左ボタンと、1本目の指だけで始める。
    if (event.button !== 0 || !event.isPrimary) return;
    const track = event.currentTarget;
    // バーの欄（Popover）は表の外へ描画するが、Reactのイベントは表まで伝わる。
    // 欄の中を押した操作でバーを引き始めないよう、表の中で始まった操作だけを受け取る。
    if (!(event.target instanceof Node) || !track.contains(event.target)) return;
    const trackRect = track.getBoundingClientRect();
    const x = event.clientX - trackRect.left;
    if (!isWithinEditableRange(pixelToRawMinutes({ x, timeRange, hourWidth, axisPadding }), timeRange)) return;
    const minutes = pixelToEditableMinutes({ x, timeRange, hourWidth, axisPadding });
    const rowIndex = Math.min(
      visibleRows.length - 1,
      Math.max(0, Math.floor((event.clientY - trackRect.top) / rowHeight)),
    );
    onStartDrag(
      { kind: "create", positionId: position.id, rowIndex, anchorMinutes: minutes, currentMinutes: minutes },
      { pointerId: event.pointerId, track, captureTarget: track },
    );
  };

  const handleResizeStart = (
    bar: EditableStaffingBar,
    edge: "start" | "end",
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    const track = trackRef.current;
    if (!track) return;
    onStartDrag(
      {
        kind: "resize",
        positionId: position.id,
        barId: bar.id,
        edge,
        currentMinutes: timeToMinutes(edge === "start" ? bar.start : bar.end),
      },
      // 動かさずに離したときのclickがバーへ届くよう、押した端でポインタを捕まえる。
      { pointerId: event.pointerId, track, captureTarget: event.currentTarget },
    );
  };

  /**
   * 端をドラッグしている間の、バーの見た目の時刻。受け付けられない位置では、もとの時刻のままにする。
   * 隣のバーに接しても、離すまではまとめた形にせず、動かしているバーだけを伸び縮みさせる。
   */
  const getDisplayedTime = (bar: EditableStaffingBar) => {
    if (drag?.kind !== "resize" || drag.barId !== bar.id) return bar;
    const result = resizeStaffingBar({ bars, barId: bar.id, edge: drag.edge, minutes: drag.currentMinutes, rules });
    return result.ok ? getResizedStaffingBarTime({ bar, edge: drag.edge, minutes: drag.currentMinutes, rules }) : bar;
  };

  // バーを引いている間のプレビュー。刻み1つ分も動かしていない間は出さない。
  const preview =
    drag?.kind === "create" && Math.abs(drag.currentMinutes - drag.anchorMinutes) >= rules.unitMinutes
      ? {
          rowIndex: drag.rowIndex,
          start: Math.min(drag.anchorMinutes, drag.currentMinutes),
          end: Math.max(drag.anchorMinutes, drag.currentMinutes),
        }
      : null;
  const previewLeft = preview ? toPixel(preview.start) : 0;
  const previewWidth = preview ? toPixel(preview.end) - previewLeft : 0;

  return (
    <Box as="section" aria-label={`${position.name}のバー`} borderTopWidth="1px" borderColor="gray.200">
      <Flex align="center" justify="space-between" gap={2} minH="44px" pl={1} pr={2} bg="gray.50">
        <chakra.button
          type="button"
          aria-expanded={!isCollapsed}
          aria-controls={bodyId}
          onClick={onToggleCollapsed}
          display="inline-flex"
          alignItems="center"
          gap={2}
          minH="44px"
          px={2}
          minW={0}
          // 表を横にスクロールしても、見出しは見える位置に留める。
          position="sticky"
          left={1}
          borderRadius="md"
          cursor="pointer"
          color="gray.800"
          _hover={{ bg: "blackAlpha.50" }}
          _active={{ bg: "blackAlpha.100" }}
          _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
        >
          {isCollapsed ? <LuChevronRight aria-hidden /> : <LuChevronDown aria-hidden />}
          <Box boxSize="10px" borderRadius="full" flexShrink={0} style={{ background: position.color }} aria-hidden />
          <Text as="span" textStyle="sm" fontWeight={700} truncate>
            {position.name}
          </Text>
          <Text as="span" textStyle="xs" color="gray.500" fontVariantNumeric="tabular-nums" flexShrink={0}>
            {barCount}本
          </Text>
        </chakra.button>
        {!isReadOnly && (
          // 表を横にスクロールしても押せるよう、右端に留める。長いポジション名とは、地色で重なりを隠す。
          <Box position="sticky" right={2} flexShrink={0} bg="gray.50">
            <Button
              ref={addButtonRef}
              type="button"
              data-staffing-add={position.id}
              variant="ghost"
              colorPalette="teal"
              // 狭い画面では、ポジション名を省かずに並べられるよう、文字を小さくする。押せる高さは44pxを保つ。
              size={layout === "narrow" ? "xs" : "sm"}
              minH={isTouch ? "44px" : undefined}
              gap={1}
              fontWeight="semibold"
              onClick={onOpenAdd}
            >
              <LuPlus aria-hidden />
              時刻を選んで足す
            </Button>
          </Box>
        )}
      </Flex>
      {notice && (
        <Text role="alert" px={3} py={1.5} fontSize="sm" color="red.600" bg="white">
          {notice}
        </Text>
      )}
      <Box id={bodyId} display={isCollapsed ? "none" : "block"} position="relative" bg="white">
        <Flex>
          <Box w={`${labelColumnWidth}px`} flexShrink={0} aria-hidden>
            {visibleRows.map((_, rowIndex) => (
              <Flex
                key={rowIndex}
                h={`${rowHeight}px`}
                align="center"
                justify="flex-end"
                pr={layout === "narrow" ? 1 : 3}
                borderTopWidth="1px"
                borderColor="gray.100"
              >
                {rowIndex !== emptyRowIndex && (
                  <Text textStyle="2xs" color="gray.400" fontVariantNumeric="tabular-nums">
                    {rowIndex + 1}
                  </Text>
                )}
              </Flex>
            ))}
          </Box>
          <Box
            ref={trackRef}
            data-staffing-track={position.id}
            position="relative"
            flex={1}
            minW={0}
            h={`${visibleRows.length * rowHeight}px`}
            overflow="hidden"
            userSelect="none"
            // 指の縦の動きは画面のスクロール、横の動きはバーを引く操作にする。
            touchAction={isReadOnly ? undefined : "pan-y pinch-zoom"}
            css={{ WebkitTouchCallout: "none" }}
            onPointerDown={isReadOnly ? undefined : handleTrackPointerDown}
          >
            {visibleRows.map((_, rowIndex) => (
              <Box
                key={rowIndex}
                position="absolute"
                insetX={0}
                top={`${rowIndex * rowHeight}px`}
                h={`${rowHeight}px`}
                borderTopWidth="1px"
                borderColor="gray.100"
                pointerEvents="none"
              />
            ))}
            <NonEditableOverlay timeRange={timeRange} toPixel={toPixel} />
            <TimelineGridLines unitMinutes={rules.unitMinutes} hourWidth={hourWidth} axisPadding={axisPadding} />
            {hasEmptyRow && (
              <EmptyRowHint
                top={emptyRowIndex * rowHeight + barTopOffset}
                height={barHeight}
                timeRange={timeRange}
                toPixel={toPixel}
                label={isReadOnly ? "バーはありません" : "空いたところをなぞると、バーを足せます"}
                // 空の行でバーを引いている間は、プレビューを隠さないよう説明を消す。
                isHidden={drag?.kind === "create" && drag.rowIndex === emptyRowIndex}
              />
            )}
            {rows.flatMap((row, rowIndex) =>
              row.map((bar) => {
                const displayed = getDisplayedTime(bar);
                const left = toPixel(Math.max(timeToMinutes(displayed.start), getDisplayStartMinutes(timeRange)));
                const right = toPixel(Math.min(timeToMinutes(displayed.end), getDisplayEndMinutes(timeRange)));
                return (
                  <TimelineBar
                    key={bar.id}
                    bar={bar}
                    displayedTime={displayed}
                    position={position}
                    bars={bars}
                    rules={rules}
                    left={left}
                    width={right - left}
                    top={rowIndex * rowHeight + barTopOffset}
                    height={barHeight}
                    rowHeight={rowHeight}
                    isReadOnly={isReadOnly}
                    isLocked={!isStaffingBarWithinRange(bar, rules.range)}
                    isDragging={isDragging}
                    isResizing={drag?.kind === "resize" && drag.barId === bar.id}
                    suppressOpenRef={suppressOpenRef}
                    onOpenEdit={isTouch ? () => onOpenEdit(bar) : undefined}
                    onResizeStart={handleResizeStart}
                    onApply={(result) => {
                      onApply(result);
                      // 隣のバーとまとまって押したバーがなくなると、開いていた欄も消える。フォーカスを見出しのボタンへ移す。
                      if (result.ok && !result.bars.some((item) => item.id === bar.id)) addButtonRef.current?.focus();
                    }}
                    onDelete={() => {
                      onChange(removeStaffingBar(bars, bar.id));
                      addButtonRef.current?.focus();
                    }}
                  />
                );
              }),
            )}
            {preview && (
              <Box
                data-staffing-preview
                position="absolute"
                left={`${previewLeft}px`}
                width={`${previewWidth.toFixed(2)}px`}
                top={`${preview.rowIndex * rowHeight + barTopOffset}px`}
                h={`${barHeight}px`}
                borderRadius="md"
                opacity={0.5}
                pointerEvents="none"
                zIndex={3}
                style={{ background: position.color }}
              />
            )}
          </Box>
        </Flex>
        {preview && isTouch && (
          // 指で操作する画面ではバーの中に時刻が入らないため、引いている間の時刻を、指で隠れない行の上に出す。
          <Text
            data-staffing-drag-time
            aria-hidden
            position="absolute"
            left={`${
              labelColumnWidth +
              getDragTimeLabelCenter({
                previewLeft,
                previewWidth,
                trackWidth: getTimeAxisWidth(timeRange, hourWidth, axisPadding),
              })
            }px`}
            top={`${preview.rowIndex * rowHeight - DRAG_TIME_LABEL_HEIGHT_PX - DRAG_TIME_LABEL_GAP_PX}px`}
            h={`${DRAG_TIME_LABEL_HEIGHT_PX}px`}
            lineHeight={`${DRAG_TIME_LABEL_HEIGHT_PX}px`}
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
            zIndex={5}
          >
            {formatShiftClockTimeRange(minutesToTime(preview.start), minutesToTime(preview.end))}
          </Text>
        )}
        {requiredSegments && (!isReadOnly || requiredSegments.length > 0) && (
          <Box borderTopWidth="1px" borderColor="gray.200" bg="gray.50" pt={1.5} pb={1}>
            <Text pl={`${labelColumnWidth + axisPadding}px`} textStyle="2xs" fontWeight={700} color="gray.600">
              できあがる必要人数
            </Text>
            <Flex h={`${COUNT_ROW_HEIGHT_PX}px`} align="center">
              <Box w={`${labelColumnWidth}px`} flexShrink={0} />
              {requiredSegments.length === 0 ? (
                <Text pl={`${axisPadding}px`} textStyle="xs" color="fg.muted">
                  バーを足すと人数が出ます
                </Text>
              ) : (
                <RequiredCountSegments
                  position={position}
                  segments={requiredSegments}
                  timeRange={timeRange}
                  hourWidth={hourWidth}
                  axisPadding={axisPadding}
                  maxCount={maxRequiredCount}
                  allowsNumberOnly
                />
              )}
            </Flex>
          </Box>
        )}
      </Box>
    </Box>
  );
};

/** 受付時間の外の時間。表示は1時間単位へ広げているため、端に残る編集できない時間を灰色にする。 */
const NonEditableOverlay = ({ timeRange, toPixel }: { timeRange: TimeRange; toPixel: (minutes: number) => number }) => {
  const displayStart = getDisplayStartMinutes(timeRange);
  const displayEnd = getDisplayEndMinutes(timeRange);
  const ranges = [
    { start: displayStart, end: timeRange.editableStartMinutes ?? displayStart },
    { start: timeRange.editableEndMinutes ?? displayEnd, end: displayEnd },
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

type EmptyRowHintProps = {
  top: number;
  height: number;
  timeRange: TimeRange;
  toPixel: (minutes: number) => number;
  label: string;
  isHidden: boolean;
};

/** 一番下の空の行の説明。行は人を表さない置き場所なので、点線の枠で空いていることを示す。 */
const EmptyRowHint = ({ top, height, timeRange, toPixel, label, isHidden }: EmptyRowHintProps) => {
  const left = toPixel(timeRange.editableStartMinutes ?? getDisplayStartMinutes(timeRange));
  const right = toPixel(timeRange.editableEndMinutes ?? getDisplayEndMinutes(timeRange));
  return (
    <Flex
      position="absolute"
      left={`${left}px`}
      width={`${right - left}px`}
      top={`${top}px`}
      h={`${height}px`}
      align="center"
      justify="center"
      borderWidth="1px"
      borderStyle="dashed"
      borderColor="gray.300"
      borderRadius="md"
      bg="white"
      pointerEvents="none"
      zIndex={1}
      visibility={isHidden ? "hidden" : "visible"}
    >
      <Text textStyle="2xs" color="gray.500" truncate px={2}>
        {label}
      </Text>
    </Flex>
  );
};
