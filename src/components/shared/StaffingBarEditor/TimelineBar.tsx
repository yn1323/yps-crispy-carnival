import { Box, chakra, Flex, Popover, Portal, Stack, Text } from "@chakra-ui/react";
import { type MutableRefObject, type PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from "react";
import { LuTrash2, LuX } from "react-icons/lu";
import { RESIZE_EDGE_THRESHOLD } from "@/src/components/shared/ShiftTimeline/constants";
import { Button, IconButton } from "@/src/components/ui/Button";
import {
  type EditableStaffingBar,
  type StaffingBarResult,
  type StaffingBarRules,
  updateStaffingBar,
} from "@/src/domains/shift/staffingBars";
import { formatShiftClockTime, formatShiftClockTimeRange } from "@/src/domains/shift/time";
import { BarTimeFields } from "./BarTimeFields";
import { buildTimeOptions, canShowBarLabel, getRejectionMessage, type StaffingBarEditorPosition } from "./script";

type TimelineBarProps = {
  bar: EditableStaffingBar;
  /** 端をドラッグしている間の見た目の時刻 */
  displayedTime: { start: string; end: string };
  position: StaffingBarEditorPosition;
  bars: readonly EditableStaffingBar[];
  rules: StaffingBarRules;
  left: number;
  width: number;
  top: number;
  height: number;
  /** 行の高さ。指で操作する画面では、バーの上下の余白まで押せる範囲にする。 */
  rowHeight: number;
  isReadOnly: boolean;
  /** 受付時間の外にかかるバー。切りそろえるまで動かせない。 */
  isLocked: boolean;
  /** どこかでドラッグが進んでいるか */
  isDragging: boolean;
  isResizing: boolean;
  suppressOpenRef: MutableRefObject<boolean>;
  /**
   * 渡すと、バーを押したときにその場の欄を開かず、この処理を呼ぶ。端の伸び縮みも出さない。
   * 指で操作する画面で、時刻を変える入力を大きく開くために使う。
   */
  onOpenEdit?: () => void;
  onResizeStart: (bar: EditableStaffingBar, edge: "start" | "end", event: ReactPointerEvent<HTMLElement>) => void;
  onApply: (result: StaffingBarResult) => void;
  onDelete: () => void;
};

/** バーの表の1本のバー。押すと時刻を変える欄が開き、マウスでは端をドラッグして伸び縮みできる。 */
export const TimelineBar = ({
  bar,
  displayedTime,
  position,
  bars,
  rules,
  left,
  width,
  top,
  height,
  rowHeight,
  isReadOnly,
  isLocked,
  isDragging,
  isResizing,
  suppressOpenRef,
  onOpenEdit,
  onResizeStart,
  onApply,
  onDelete,
}: TimelineBarProps) => {
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
    h: `${height}px`,
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

  const interactive = {
    type: "button",
    "data-staffing-bar": bar.id,
    "aria-label": accessibleLabel,
    ...layout,
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
    _hover: { filter: "brightness(1.08)" },
    _active: { filter: "brightness(0.92)" },
    _focusVisible: { outline: "2px solid", outlineColor: "gray.900", outlineOffset: "1px" },
    style: { background: position.color },
  } as const;

  if (onOpenEdit) {
    const hitInset = `-${(rowHeight - height) / 2}px`;
    return (
      <chakra.button
        {...interactive}
        // 進んでいるドラッグの下にあるバーは、指を離した場所として拾わない。
        pointerEvents={isDragging ? "none" : "auto"}
        transition="filter 0.15s"
        // 押せる範囲を、行の高さいっぱいへ広げる。
        _before={{ content: '""', position: "absolute", insetX: 0, top: hitInset, bottom: hitInset }}
        // 空いた場所をなぞる操作（バーを引く操作）を、バーの上では始めない。
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onOpenEdit}
      >
        <Box as="span" display="flex" alignItems="center" overflow="hidden" w="100%" h="100%" borderRadius="md">
          {label}
        </Box>
      </chakra.button>
    );
  }

  const handleSize = `${Math.min(RESIZE_EDGE_THRESHOLD, Math.max(0, width) / 3)}px`;
  const startResize = (edge: "start" | "end") => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    onResizeStart(bar, edge, event);
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
          {...interactive}
          overflow="hidden"
          // 端を動かしている間は、同じ行のほかのバーより手前に出す。
          zIndex={isResizing ? 4 : 2}
          pointerEvents={isDragging && !isResizing ? "none" : "auto"}
          transition={isResizing ? "none" : "filter 0.15s"}
          // 空いた場所のドラッグ（バーを引く操作）を、バーの上では始めない。
          onPointerDown={(event) => {
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
            onPointerDown={startResize("start")}
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
            onPointerDown={startResize("end")}
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
                unitMinutes={rules.unitMinutes}
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
