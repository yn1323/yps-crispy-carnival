import { Box, Flex, Text } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { StaffType } from "@/src/domains/shift/types";
import { TIME_AXIS_PADDING_PX } from "../../../constants";
import { useAllShiftDateNotes, useShiftDateNotes } from "../../../dateNotes";
import {
  dailySortedStaffsAtom,
  detailModeAtom,
  hourWidthAtom,
  issueStaffIdSetForSelectedDateAtom,
  selectedDateAtom,
  shiftByStaffIdForSelectedDateAtom,
  shiftConfigAtom,
  shiftsForSelectedDateAtom,
  warningMessagesByStaffIdForSelectedDateAtom,
} from "../../../stores";
import { useDrag } from "../hooks/useDrag";
import { RangeAssignMenu } from "../RangeAssignMenu";
import { TimeHeader } from "../TimeHeader";
import { POSITION_REVEAL_DURATION_MS } from "./ShiftBar";
import { StaffingBand } from "./StaffingBand";
import { StaffRow } from "./StaffRow";

const STAFF_COL_WIDTH = 200;
const NOTE_COL_WIDTH = 200;
const EMPTY_WARNING_MESSAGES: string[] = [];

type ShiftGridProps = {
  onShiftClick: (shiftId: string, positionId: string | null, e: React.MouseEvent) => void;
  onStaffNameClick: (staffId: string) => void;
};

export const ShiftGrid = ({ onShiftClick, onStaffNameClick }: ShiftGridProps) => {
  const config = useAtomValue(shiftConfigAtom);
  const shiftsForSelectedDate = useAtomValue(shiftsForSelectedDateAtom);
  const shiftByStaffId = useAtomValue(shiftByStaffIdForSelectedDateAtom);
  const sortedStaffs = useAtomValue(dailySortedStaffsAtom);
  const issueStaffIds = useAtomValue(issueStaffIdSetForSelectedDateAtom);
  const warningMessagesByStaffId = useAtomValue(warningMessagesByStaffIdForSelectedDateAtom);
  const setHourWidth = useSetAtom(hourWidthAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const isRevealingPositions = usePositionReveal();
  const dateNotes = useShiftDateNotes();
  const allDateNotes = useAllShiftDateNotes();
  const { timeRange, isReadOnly, currentStaffId } = config;

  const {
    dragState,
    isDragging,
    selection,
    clearSelection,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    getCursor,
  } = useDrag();
  // 選んだあとで勤務が消えた場合は、選択を出さない。
  const selectedShift = selection ? shiftsForSelectedDate.find((shift) => shift.id === selection.shiftId) : undefined;
  const selectionAnchorRef = useRef<HTMLDivElement | null>(null);

  const dragRowRectRef = useRef<DOMRect | null>(null);
  const timelineMeasureRef = useRef<HTMLDivElement | null>(null);
  // 範囲を選んだときのメニューを、この入れ物の中に収める。
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // タイムラインコンテナ幅に応じて hourWidth を動的計算
  useLayoutEffect(() => {
    const el = timelineMeasureRef.current;
    if (!el) return;
    const totalHours = timeRange.end - timeRange.start;
    if (totalHours <= 0) return;
    const update = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      const hw = Math.max(20, (width - TIME_AXIS_PADDING_PX * 2) / totalHours);
      setHourWidth(hw);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [timeRange.start, timeRange.end, setHourWidth]);

  const [cursorStyles, setCursorStyles] = useState<Record<string, string>>({});

  const handleRowMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, staffId: string) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const dragStarted = handleMouseDown(e, staffId, rect);
      if (dragStarted) {
        dragRowRectRef.current = rect;
      }
    },
    [handleMouseDown],
  );

  const handleRowMouseMoveForCursor = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, staffId: string) => {
      if (!isDragging) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const cursor = getCursor(staffId, x);
        setCursorStyles((prev) => (prev[staffId] === cursor ? prev : { ...prev, [staffId]: cursor }));
      }
    },
    [getCursor, isDragging],
  );

  useEffect(() => {
    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (isDragging && dragRowRectRef.current) {
        handleMouseMove(e as unknown as React.MouseEvent<HTMLDivElement>, dragRowRectRef.current);
      }
    };
    const handleDocumentMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
        dragRowRectRef.current = null;
      }
    };
    if (isDragging) {
      document.addEventListener("mousemove", handleDocumentMouseMove);
      document.addEventListener("mouseup", handleDocumentMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleDocumentMouseMove);
      document.removeEventListener("mouseup", handleDocumentMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <Flex
      direction="column"
      h="100%"
      minH={0}
      bg="gray.50"
      data-tour="shift-grid"
      data-position-reveal={isRevealingPositions || undefined}
    >
      <Box ref={scrollContainerRef} flex={1} minH={0} overflowY="auto" overflowX="hidden">
        <Flex direction="column" w="100%" minH="100%">
          {/* Sticky header */}
          <Flex
            position="sticky"
            top={0}
            zIndex={10}
            bg="white"
            borderBottomWidth="1px"
            borderColor="gray.200"
            boxShadow="0 2px 4px rgba(0,0,0,0.04)"
          >
            <Box w={`${STAFF_COL_WIDTH}px`} flexShrink={0} bg="white" />
            {dateNotes.hasNotes && (
              <Flex
                w={`${NOTE_COL_WIDTH}px`}
                flexShrink={0}
                align="center"
                px={3}
                bg="white"
                borderRightWidth="1px"
                borderColor="gray.100"
              >
                <Text textStyle="xs" fontWeight={600} color="gray.600">
                  連絡事項
                </Text>
              </Flex>
            )}
            <Box flex={1} minW={0} ref={timelineMeasureRef}>
              <TimeHeader timeRange={timeRange} />
            </Box>
          </Flex>
          {/* Rows */}
          {sortedStaffs.map((staff: StaffType) => {
            const shift = shiftByStaffId.get(staff.id);
            const isTargetShift = shift?.id === dragState.targetShiftId;
            const dragPreview =
              isDragging &&
              dragState.staffId === staff.id &&
              (dragState.mode === "paint" || dragState.mode === "select" || dragState.mode === "break")
                ? {
                    mode: dragState.mode,
                    startMinutes: dragState.startMinutes,
                    currentMinutes: dragState.currentMinutes,
                    positionColor: dragState.positionColor,
                  }
                : null;
            // 休憩の端をつまんで動かしている間は、その休憩を、動かしている途中の時刻で描く。
            const breakResize =
              isTargetShift && dragState.targetBreak
                ? {
                    from: dragState.targetBreak,
                    to:
                      dragState.mode === "break-resize-start"
                        ? { start: dragState.currentMinutes, end: dragState.targetBreak.end }
                        : { start: dragState.targetBreak.start, end: dragState.currentMinutes },
                  }
                : null;
            return (
              <StaffRow
                key={staff.id}
                dataTour={`shift-row-${staff.id}`}
                staff={staff}
                shift={shift}
                timeRange={timeRange}
                staffColWidth={STAFF_COL_WIDTH}
                isCurrentStaff={staff.id === currentStaffId}
                isReadOnly={isReadOnly}
                hasError={issueStaffIds.has(staff.id)}
                warningMessages={warningMessagesByStaffId.get(staff.id) ?? EMPTY_WARNING_MESSAGES}
                onRowMouseDown={handleRowMouseDown}
                onRowMouseMoveForCursor={handleRowMouseMoveForCursor}
                onShiftClick={onShiftClick}
                onStaffNameClick={onStaffNameClick}
                dragPreview={dragPreview}
                selectionRange={selection && selectedShift?.staffId === staff.id ? selection.range : null}
                selectionAnchorRef={selectionAnchorRef}
                isDragging={isDragging}
                cursorStyle={cursorStyles[staff.id] ?? "default"}
                resizeCurrentMinutes={isTargetShift ? dragState.currentMinutes : undefined}
                linkedTarget={isTargetShift ? dragState.linkedTarget : null}
                breakResize={breakResize}
                noteColumnWidth={dateNotes.hasNotes ? NOTE_COL_WIDTH : undefined}
                note={dateNotes.getNote(staff.id, selectedDate)}
                noteDate={selectedDate}
                nameNote={allDateNotes.getNote(staff.id, selectedDate)}
              />
            );
          })}
          <StaffingBand leftWidth={STAFF_COL_WIDTH + (dateNotes.hasNotes ? NOTE_COL_WIDTH : 0)} />
        </Flex>
      </Box>
      {selection && selectedShift && (
        <RangeAssignMenu
          key={`${selection.shiftId}-${selection.range.start}-${selection.range.end}`}
          shift={selectedShift}
          range={selection.range}
          anchorRef={selectionAnchorRef}
          boundaryRef={scrollContainerRef}
          onClose={clearSelection}
        />
      )}
    </Flex>
  );
};

/**
 * くわしく表示へ切り替えた直後だけtrueを返す。勤務のバーは、この間にポジションの色をにじませて出す。
 * 開いた時点でくわしく表示の画面と、日付を変えたときには動かさない。
 */
const usePositionReveal = () => {
  const detailMode = useAtomValue(detailModeAtom);
  const previousDetailModeRef = useRef(detailMode);
  const [isRevealing, setRevealing] = useState(false);
  // 色が変わった最初の描画から重ねるため、描画の前に切り替える。
  useLayoutEffect(() => {
    if (previousDetailModeRef.current === detailMode) return;
    previousDetailModeRef.current = detailMode;
    setRevealing(detailMode);
    if (!detailMode) return;
    const timer = setTimeout(() => setRevealing(false), POSITION_REVEAL_DURATION_MS);
    return () => clearTimeout(timer);
  }, [detailMode]);
  return isRevealing;
};
