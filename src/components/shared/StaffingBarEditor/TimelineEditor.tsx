import { Box, chakra, Flex, Popover, Portal, Stack, Text } from "@chakra-ui/react";
import { type MutableRefObject, type MouseEvent as ReactMouseEvent, useId, useMemo, useRef, useState } from "react";
import { LuChevronDown, LuChevronRight, LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { TimelineGridLines, TimelineHourLabels } from "@/src/components/shared/ShiftTimeline";
import { RESIZE_EDGE_THRESHOLD } from "@/src/components/shared/ShiftTimeline/constants";
import {
  getDisplayEndMinutes,
  getDisplayStartMinutes,
  isWithinEditableRange,
  minutesToPixel,
  pixelToEditableMinutes,
  pixelToRawMinutes,
} from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import { Button, IconButton } from "@/src/components/ui/Button";
import {
  addStaffingBar,
  type EditableStaffingBar,
  isStaffingBarWithinRange,
  packStaffingBars,
  removeStaffingBar,
  resizeStaffingBar,
  type StaffingBarResult,
  type StaffingBarRules,
  updateStaffingBar,
} from "@/src/domains/shift/staffingBars";
import {
  formatShiftClockTime,
  formatShiftClockTimeRange,
  minutesToTime,
  timeToMinutes,
} from "@/src/domains/shift/time";
import type { TimeRange } from "@/src/domains/shift/types";
import { BarTimeFields } from "./BarTimeFields";
import {
  BAR_HEIGHT_PX,
  BAR_ROW_HEIGHT_PX,
  buildTimelineRange,
  buildTimeOptions,
  canShowBarLabel,
  getMinTrackWidth,
  getRejectionMessage,
  isBarOnTimeline,
  LABEL_COLUMN_WIDTH_PX,
  type StaffingBarEditorPosition,
} from "./script";
import { type StaffingBarDrag, useStaffingBarDrag } from "./useStaffingBarDrag";
import { useTimelineHourWidth } from "./useTimelineHourWidth";

type TimelineEditorProps = {
  positions: readonly StaffingBarEditorPosition[];
  bars: readonly EditableStaffingBar[];
  rules: StaffingBarRules;
  isReadOnly: boolean;
  onChange: (bars: EditableStaffingBar[]) => void;
  /** 「時刻を選んで足す」を押したとき */
  onOpenAdd: (position: StaffingBarEditorPosition) => void;
};

type Notice = { positionId: string; message: string };

const BAR_TOP_OFFSET_PX = (BAR_ROW_HEIGHT_PX - BAR_HEIGHT_PX) / 2;

/** PCのバーの表。空いた場所をドラッグするとバーが引け、端をドラッグすると伸び縮みする。 */
export const TimelineEditor = ({ positions, bars, rules, isReadOnly, onChange, onOpenAdd }: TimelineEditorProps) => {
  const timeRange = useMemo(() => buildTimelineRange(rules.range, rules.unitMinutes), [rules]);
  const { measureRef, hourWidth } = useTimelineHourWidth(timeRange.end - timeRange.start);
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
    const result = resizeStaffingBar({ bars, barId: drag.barId, edge: drag.edge, minutes: drag.currentMinutes, rules });
    const after = result.ok ? result.bars.find((bar) => bar.id === drag.barId) : undefined;
    // 動かさずに離した場合は、押しただけとして扱い、バーの欄を開く。
    if (result.ok && before && after && before.start === after.start && before.end === after.end) return;
    // mouseupに続くclickだけを止める。離した場所がバーの外でclickが来ない場合に備え、すぐ戻す。
    suppressOpenRef.current = true;
    window.setTimeout(() => {
      suppressOpenRef.current = false;
    }, 0);
    apply(drag.positionId, result);
  };

  const { drag, startDrag } = useStaffingBarDrag({
    toMinutes: (clientX, trackRect) => pixelToEditableMinutes({ x: clientX - trackRect.left, timeRange, hourWidth }),
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
      <Box minW={`${LABEL_COLUMN_WIDTH_PX + getMinTrackWidth(timeRange)}px`}>
        <Flex>
          <Box w={`${LABEL_COLUMN_WIDTH_PX}px`} flexShrink={0} />
          <Box flex={1} minW={0} ref={measureRef}>
            <TimelineHourLabels timeRange={timeRange} hourWidth={hourWidth} />
          </Box>
        </Flex>
        {positions.map((position, index) => (
          <PositionBlock
            key={position.id}
            position={position}
            rows={packed[index]?.rows ?? [[]]}
            bars={bars}
            rules={rules}
            timeRange={timeRange}
            hourWidth={hourWidth}
            isReadOnly={isReadOnly}
            isCollapsed={collapsedIds.has(position.id)}
            notice={notice?.positionId === position.id ? notice.message : null}
            drag={drag?.positionId === position.id ? drag : null}
            isDragging={drag !== null}
            suppressOpenRef={suppressOpenRef}
            onToggleCollapsed={() => toggleCollapsed(position.id)}
            onOpenAdd={() => onOpenAdd(position)}
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
  bars: readonly EditableStaffingBar[];
  rules: StaffingBarRules;
  timeRange: TimeRange;
  hourWidth: number;
  isReadOnly: boolean;
  isCollapsed: boolean;
  notice: string | null;
  /** このポジションで進んでいるドラッグ */
  drag: StaffingBarDrag | null;
  /** どこかのポジションでドラッグが進んでいるか */
  isDragging: boolean;
  suppressOpenRef: MutableRefObject<boolean>;
  onToggleCollapsed: () => void;
  onOpenAdd: () => void;
  onStartDrag: (drag: StaffingBarDrag, trackRect: DOMRect) => void;
  onApply: (result: StaffingBarResult) => void;
  onChange: (bars: EditableStaffingBar[]) => void;
};

const PositionBlock = ({
  position,
  rows,
  bars,
  rules,
  timeRange,
  hourWidth,
  isReadOnly,
  isCollapsed,
  notice,
  drag,
  isDragging,
  suppressOpenRef,
  onToggleCollapsed,
  onOpenAdd,
  onStartDrag,
  onApply,
  onChange,
}: PositionBlockProps) => {
  const bodyId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // 見出しの本数は、表示範囲の外にあって表に出ないバーも含めて数える。
  const barCount = bars.filter((bar) => bar.positionId === position.id).length;
  // 読み取り専用では、バーを引くための空の行を出さない。表に出るバーがないときだけ、空であることを伝える行を残す。
  const hasEmptyRow = !isReadOnly || rows.length === 1;
  const visibleRows = hasEmptyRow ? rows : rows.slice(0, -1);
  const emptyRowIndex = hasEmptyRow ? visibleRows.length - 1 : -1;

  const handleTrackMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const trackRect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - trackRect.left;
    if (!isWithinEditableRange(pixelToRawMinutes({ x, timeRange, hourWidth }), timeRange)) return;
    const minutes = pixelToEditableMinutes({ x, timeRange, hourWidth });
    const rowIndex = Math.min(
      visibleRows.length - 1,
      Math.max(0, Math.floor((event.clientY - trackRect.top) / BAR_ROW_HEIGHT_PX)),
    );
    onStartDrag(
      { kind: "create", positionId: position.id, rowIndex, anchorMinutes: minutes, currentMinutes: minutes },
      trackRect,
    );
  };

  const handleResizeStart = (bar: EditableStaffingBar, edge: "start" | "end") => {
    const trackRect = trackRef.current?.getBoundingClientRect();
    if (!trackRect) return;
    onStartDrag(
      {
        kind: "resize",
        positionId: position.id,
        barId: bar.id,
        edge,
        currentMinutes: timeToMinutes(edge === "start" ? bar.start : bar.end),
      },
      trackRect,
    );
  };

  /** 端をドラッグしている間の、バーの見た目の時刻。受け付けられない位置では、もとの時刻のままにする。 */
  const getDisplayedTime = (bar: EditableStaffingBar) => {
    if (drag?.kind !== "resize" || drag.barId !== bar.id) return bar;
    const result = resizeStaffingBar({ bars, barId: bar.id, edge: drag.edge, minutes: drag.currentMinutes, rules });
    return (result.ok ? result.bars.find((item) => item.id === bar.id) : undefined) ?? bar;
  };

  return (
    <Box as="section" aria-label={`${position.name}のバー`} borderTopWidth="1px" borderColor="gray.200">
      <Flex align="center" justify="space-between" gap={2} minH="36px" pl={1} pr={2} bg="gray.50">
        <chakra.button
          type="button"
          aria-expanded={!isCollapsed}
          aria-controls={bodyId}
          onClick={onToggleCollapsed}
          display="inline-flex"
          alignItems="center"
          gap={2}
          minH="36px"
          px={2}
          minW={0}
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
          <Button
            ref={addButtonRef}
            type="button"
            variant="ghost"
            colorPalette="teal"
            size="xs"
            gap={1}
            fontWeight="semibold"
            flexShrink={0}
            onClick={onOpenAdd}
          >
            <LuPlus aria-hidden />
            時刻を選んで足す
          </Button>
        )}
      </Flex>
      {notice && (
        <Text role="alert" px={3} py={1.5} fontSize="sm" color="red.600" bg="white">
          {notice}
        </Text>
      )}
      <Flex id={bodyId} display={isCollapsed ? "none" : "flex"} bg="white">
        <Box w={`${LABEL_COLUMN_WIDTH_PX}px`} flexShrink={0} aria-hidden>
          {visibleRows.map((_, rowIndex) => (
            <Flex
              key={rowIndex}
              h={`${BAR_ROW_HEIGHT_PX}px`}
              align="center"
              justify="flex-end"
              pr={3}
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
          h={`${visibleRows.length * BAR_ROW_HEIGHT_PX}px`}
          overflow="hidden"
          userSelect="none"
          onMouseDown={isReadOnly ? undefined : handleTrackMouseDown}
        >
          {visibleRows.map((_, rowIndex) => (
            <Box
              key={rowIndex}
              position="absolute"
              insetX={0}
              top={`${rowIndex * BAR_ROW_HEIGHT_PX}px`}
              h={`${BAR_ROW_HEIGHT_PX}px`}
              borderTopWidth="1px"
              borderColor="gray.100"
              pointerEvents="none"
            />
          ))}
          <NonEditableOverlay timeRange={timeRange} hourWidth={hourWidth} />
          <TimelineGridLines unitMinutes={rules.unitMinutes} hourWidth={hourWidth} />
          {hasEmptyRow && (
            <EmptyRowHint
              top={emptyRowIndex * BAR_ROW_HEIGHT_PX}
              timeRange={timeRange}
              hourWidth={hourWidth}
              label={isReadOnly ? "バーはありません" : "空いたところをなぞると、バーを足せます"}
              // 空の行でバーを引いている間は、プレビューを隠さないよう説明を消す。
              isHidden={drag?.kind === "create" && drag.rowIndex === emptyRowIndex}
            />
          )}
          {rows.flatMap((row, rowIndex) =>
            row.map((bar) => {
              const displayed = getDisplayedTime(bar);
              const left = minutesToPixel(
                Math.max(timeToMinutes(displayed.start), getDisplayStartMinutes(timeRange)),
                timeRange,
                hourWidth,
              );
              const right = minutesToPixel(
                Math.min(timeToMinutes(displayed.end), getDisplayEndMinutes(timeRange)),
                timeRange,
                hourWidth,
              );
              return (
                <BarItem
                  key={bar.id}
                  bar={bar}
                  displayedTime={displayed}
                  position={position}
                  bars={bars}
                  rules={rules}
                  left={left}
                  width={right - left}
                  top={rowIndex * BAR_ROW_HEIGHT_PX + BAR_TOP_OFFSET_PX}
                  isReadOnly={isReadOnly}
                  isLocked={!isStaffingBarWithinRange(bar, rules.range)}
                  isDragging={isDragging}
                  isResizing={drag?.kind === "resize" && drag.barId === bar.id}
                  suppressOpenRef={suppressOpenRef}
                  onResizeStart={handleResizeStart}
                  onApply={onApply}
                  onDelete={() => {
                    onChange(removeStaffingBar(bars, bar.id));
                    addButtonRef.current?.focus();
                  }}
                />
              );
            }),
          )}
          {drag?.kind === "create" && Math.abs(drag.currentMinutes - drag.anchorMinutes) >= rules.unitMinutes && (
            <Box
              data-staffing-preview
              position="absolute"
              left={`${minutesToPixel(Math.min(drag.anchorMinutes, drag.currentMinutes), timeRange, hourWidth)}px`}
              width={`${((Math.abs(drag.currentMinutes - drag.anchorMinutes) / 60) * hourWidth).toFixed(2)}px`}
              top={`${drag.rowIndex * BAR_ROW_HEIGHT_PX + BAR_TOP_OFFSET_PX}px`}
              h={`${BAR_HEIGHT_PX}px`}
              borderRadius="md"
              opacity={0.5}
              pointerEvents="none"
              zIndex={3}
              style={{ background: position.color }}
            />
          )}
        </Box>
      </Flex>
    </Box>
  );
};

/** 受付時間の外の時間。表示は1時間単位へ広げているため、端に残る編集できない時間を灰色にする。 */
const NonEditableOverlay = ({ timeRange, hourWidth }: { timeRange: TimeRange; hourWidth: number }) => {
  const displayStart = getDisplayStartMinutes(timeRange);
  const displayEnd = getDisplayEndMinutes(timeRange);
  const ranges = [
    { start: displayStart, end: timeRange.editableStartMinutes ?? displayStart },
    { start: timeRange.editableEndMinutes ?? displayEnd, end: displayEnd },
  ].filter((range) => range.end > range.start);

  return (
    <>
      {ranges.map((range) => {
        const left = minutesToPixel(range.start, timeRange, hourWidth);
        return (
          <Box
            key={range.start}
            position="absolute"
            left={`${left}px`}
            width={`${minutesToPixel(range.end, timeRange, hourWidth) - left}px`}
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
  timeRange: TimeRange;
  hourWidth: number;
  label: string;
  isHidden: boolean;
};

/** 一番下の空の行の説明。行は人を表さない置き場所なので、点線の枠で空いていることを示す。 */
const EmptyRowHint = ({ top, timeRange, hourWidth, label, isHidden }: EmptyRowHintProps) => {
  const left = minutesToPixel(
    timeRange.editableStartMinutes ?? getDisplayStartMinutes(timeRange),
    timeRange,
    hourWidth,
  );
  const right = minutesToPixel(timeRange.editableEndMinutes ?? getDisplayEndMinutes(timeRange), timeRange, hourWidth);
  return (
    <Flex
      position="absolute"
      left={`${left}px`}
      width={`${right - left}px`}
      top={`${top + BAR_TOP_OFFSET_PX}px`}
      h={`${BAR_HEIGHT_PX}px`}
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

type BarItemProps = {
  bar: EditableStaffingBar;
  /** 端をドラッグしている間の見た目の時刻 */
  displayedTime: { start: string; end: string };
  position: StaffingBarEditorPosition;
  bars: readonly EditableStaffingBar[];
  rules: StaffingBarRules;
  left: number;
  width: number;
  top: number;
  isReadOnly: boolean;
  /** 受付時間の外にかかるバー。切りそろえるまで動かせない。 */
  isLocked: boolean;
  isDragging: boolean;
  isResizing: boolean;
  suppressOpenRef: MutableRefObject<boolean>;
  onResizeStart: (bar: EditableStaffingBar, edge: "start" | "end") => void;
  onApply: (result: StaffingBarResult) => void;
  onDelete: () => void;
};

const BarItem = ({
  bar,
  displayedTime,
  position,
  bars,
  rules,
  left,
  width,
  top,
  isReadOnly,
  isLocked,
  isDragging,
  isResizing,
  suppressOpenRef,
  onResizeStart,
  onApply,
  onDelete,
}: BarItemProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timeOptions = useMemo(() => buildTimeOptions(rules), [rules]);
  const timeLabel = `${formatShiftClockTime(displayedTime.start)}–${formatShiftClockTime(displayedTime.end)}`;
  const accessibleLabel = `${position.name} ${formatShiftClockTimeRange(bar.start, bar.end)}`;
  const layout = {
    position: "absolute",
    left: `${left}px`,
    width: `${Math.max(0, width)}px`,
    top: `${top}px`,
    h: `${BAR_HEIGHT_PX}px`,
    borderRadius: "md",
    zIndex: 2,
  } as const;
  const label = canShowBarLabel(width) && (
    <Text
      as="span"
      textStyle="caption"
      fontWeight={600}
      color="white"
      fontVariantNumeric="tabular-nums"
      whiteSpace="nowrap"
      px="8px"
      pointerEvents="none"
    >
      {timeLabel}
    </Text>
  );

  if (isReadOnly || isLocked) {
    return (
      <Flex
        data-staffing-bar={bar.id}
        role="img"
        aria-label={isLocked ? `${accessibleLabel}（受付時間の外）` : accessibleLabel}
        title={isLocked ? "受付時間の外にかかっています" : undefined}
        {...layout}
        align="center"
        overflow="hidden"
        pointerEvents="none"
        opacity={isLocked ? 0.55 : 1}
        outline={isLocked ? "1.5px dashed rgba(255,255,255,0.9)" : undefined}
        outlineOffset="-3px"
        style={{ background: position.color }}
      >
        {label}
      </Flex>
    );
  }

  const handleSize = `${Math.min(RESIZE_EDGE_THRESHOLD, Math.max(0, width) / 3)}px`;
  const startResize = (edge: "start" | "end") => (event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    onResizeStart(bar, edge);
  };

  return (
    <Popover.Root
      open={isOpen}
      onOpenChange={(details) => {
        // 端をドラッグで動かした直後のclickは、欄を開く操作として扱わない。
        if (details.open && suppressOpenRef.current) {
          suppressOpenRef.current = false;
          return;
        }
        setIsOpen(details.open);
        setFieldError(null);
      }}
      positioning={{ placement: "bottom-start", gutter: 6 }}
      // 開いたら、閉じるボタンではなく開始の選択へフォーカスを移す。
      initialFocusEl={() => contentRef.current?.querySelector("select") ?? null}
      lazyMount
      unmountOnExit
    >
      <Popover.Trigger asChild>
        <chakra.button
          type="button"
          data-staffing-bar={bar.id}
          aria-label={accessibleLabel}
          {...layout}
          display="flex"
          alignItems="center"
          overflow="hidden"
          cursor="pointer"
          boxShadow="0 1px 2px rgba(0,0,0,0.2)"
          // 端を動かしている間は、同じ行のほかのバーより手前に出す。
          zIndex={isResizing ? 4 : 2}
          pointerEvents={isDragging && !isResizing ? "none" : "auto"}
          transition={isResizing ? "none" : "filter 0.15s"}
          _hover={{ filter: "brightness(1.08)" }}
          _active={{ filter: "brightness(0.92)" }}
          _focusVisible={{ outline: "2px solid", outlineColor: "gray.900", outlineOffset: "1px" }}
          style={{ background: position.color }}
          // 空いた場所のドラッグ（バーを引く操作）を、バーの上では始めない。
          onMouseDown={(event) => {
            event.stopPropagation();
            suppressOpenRef.current = false;
          }}
        >
          {label}
          <Box
            as="span"
            data-staffing-bar-edge="start"
            position="absolute"
            left={0}
            top={0}
            bottom={0}
            w={handleSize}
            cursor="ew-resize"
            onMouseDown={startResize("start")}
          />
          <Box
            as="span"
            data-staffing-bar-edge="end"
            position="absolute"
            right={0}
            top={0}
            bottom={0}
            w={handleSize}
            cursor="ew-resize"
            onMouseDown={startResize("end")}
          />
        </chakra.button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          {/* 欄の名前はaria-labelで付ける。開くまで中身を作らないため、見出しとの結び付けに頼らない。 */}
          <Popover.Content ref={contentRef} w="280px" p={3} aria-label={`${position.name}のバー`}>
            <Stack gap={3}>
              <Flex align="center" justify="space-between" gap={2}>
                <Flex align="center" gap={2} minW={0}>
                  <Box
                    boxSize="10px"
                    borderRadius="full"
                    flexShrink={0}
                    style={{ background: position.color }}
                    aria-hidden
                  />
                  <Text textStyle="sm" fontWeight={700} truncate>
                    {position.name}のバー
                  </Text>
                </Flex>
                <Popover.CloseTrigger asChild>
                  <IconButton type="button" size="xs" variant="ghost" colorPalette="gray" aria-label="閉じる">
                    <LuX />
                  </IconButton>
                </Popover.CloseTrigger>
              </Flex>
              <BarTimeFields
                start={bar.start}
                end={bar.end}
                options={timeOptions}
                onChange={(time) => {
                  const result = updateStaffingBar({ bars, barId: bar.id, ...time, rules });
                  setFieldError(result.ok ? null : getRejectionMessage(result.reason, rules));
                  if (result.ok) onApply(result);
                }}
              />
              {fieldError && (
                <Text role="alert" fontSize="sm" color="red.600">
                  {fieldError}
                </Text>
              )}
              <Flex justify="flex-end">
                <Button
                  type="button"
                  variant="ghost"
                  colorPalette="red"
                  color="red.600"
                  size="sm"
                  gap={1.5}
                  onClick={onDelete}
                >
                  <LuTrash2 aria-hidden />
                  削除
                </Button>
              </Flex>
            </Stack>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
};
