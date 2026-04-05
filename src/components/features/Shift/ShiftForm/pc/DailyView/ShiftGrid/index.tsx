import { Box, Flex, Icon, Table, Text } from "@chakra-ui/react";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuInfo, LuMousePointer2 } from "react-icons/lu";
import { SortMenu } from "../../../shared/SortMenu";
import { selectedDateAtom, shiftConfigAtom, shiftsAtom, sortedStaffsAtom, sortModeAtom } from "../../../stores";
import type { ShiftData, StaffType } from "../../../types";
import { getTimeAxisWidth } from "../../../utils/timeConversion";
import { useAutoScroll } from "../hooks/useAutoScroll";
import { useDrag } from "../hooks/useDrag";
import { TimeHeader } from "../TimeHeader";
import { StaffRow } from "./StaffRow";

// 時間スロットを生成
const generateTimeSlots = (start: number, end: number) => {
  const slots: string[] = [];
  for (let hour = start; hour <= end; hour++) {
    slots.push(`${hour}`);
  }
  return slots;
};

type ShiftGridProps = {
  onShiftClick: (shiftId: string, positionId: string | null, e: React.MouseEvent) => void;
  onStaffNameClick: (staffId: string) => void;
  // paintクリック時のポップオーバー表示用
  onPaintClickPopover: (shift: ShiftData, anchorRect: DOMRect) => void;
};

export const ShiftGrid = ({ onShiftClick, onStaffNameClick, onPaintClickPopover }: ShiftGridProps) => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const sortedStaffs = useAtomValue(sortedStaffsAtom);
  const [sortMode, setSortMode] = [useAtomValue(sortModeAtom), useAtom(sortModeAtom)[1]];
  const { timeRange, isReadOnly, currentStaffId } = config;

  // === ドラッグ管理 ===
  const { dragState, isDragging, handleMouseDown, handleMouseMove, handleMouseUp, getCursor } = useDrag();

  // === ref管理 ===
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const rowContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragRowRectRef = useRef<DOMRect | null>(null);
  const mouseClientXRef = useRef<number>(0);
  const paintClickAnchorRef = useRef<DOMRect | null>(null);

  // === 自動スクロール ===
  useAutoScroll({
    isDragging,
    tableContainerRef,
    rowContainerRefs,
    dragRowRectRef,
    mouseClientXRef,
    dragStaffId: dragState.staffId,
    handleMouseMove,
  });

  // 時間スロット
  const timeSlots = useMemo(() => generateTimeSlots(timeRange.start, timeRange.end), [timeRange.start, timeRange.end]);
  const timeAxisWidth = useMemo(() => getTimeAxisWidth(timeRange), [timeRange]);

  // 選択日のシフトをスタッフごとにフィルタ
  const getShiftsForStaff = useCallback(
    (staffId: string) => shifts.filter((s) => s.staffId === staffId && s.date === selectedDate),
    [shifts, selectedDate],
  );

  // カーソル状態を管理
  const [cursorStyles, setCursorStyles] = useState<Record<string, string>>({});

  // 行のマウスダウン
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

  // カーソル更新
  const handleRowMouseMoveForCursor = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, staffId: string) => {
      if (!isDragging) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const cursor = getCursor(staffId, x);
        setCursorStyles((prev) => ({ ...prev, [staffId]: cursor }));
      }
    },
    [getCursor, isDragging],
  );

  // paintクリック時のポップオーバー表示
  const handleMouseUpOnRow = useCallback(
    (_staffId: string) => {
      // Paint モードで移動なし（クリック）→ 既存ポジション上ならポップオーバー表示
      if (
        dragState.mode === "paint" &&
        dragState.targetShiftId &&
        Math.abs(dragState.currentMinutes - dragState.startMinutes) < timeRange.unit
      ) {
        const targetShift = shifts.find((s) => s.id === dragState.targetShiftId);
        if (targetShift) {
          const minutes = dragState.startMinutes;
          const hasExistingPosition = targetShift.positions.some((pos) => {
            const [sh, sm] = pos.start.split(":").map(Number);
            const [eh, em] = pos.end.split(":").map(Number);
            return minutes >= sh * 60 + sm && minutes < eh * 60 + em;
          });
          if (hasExistingPosition && paintClickAnchorRef.current) {
            onPaintClickPopover(targetShift, paintClickAnchorRef.current);
          }
        }
      }
    },
    [dragState, shifts, timeRange.unit, onPaintClickPopover],
  );

  // === document レベルのマウスイベントリスナー ===
  useEffect(() => {
    const handleDocumentMouseMove = (e: MouseEvent) => {
      mouseClientXRef.current = e.clientX;

      // ドラッグ中（ペイント/リサイズ）
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

  // 空状態判定: 選択日にポジション割当が1つもない
  const hasAnyPositions = useMemo(() => {
    return shifts.some((s) => s.date === selectedDate && s.positions.length > 0);
  }, [shifts, selectedDate]);

  return (
    <Box ref={tableContainerRef} flex={1} minHeight={0} overflowX="auto" overflowY="auto">
      {/* 空状態ガイド（レイアウトシフト防止のため常にレンダリング） */}
      {!isReadOnly && (
        <Flex
          bg="blue.50"
          borderBottom="1px solid"
          borderColor="blue.100"
          px={4}
          py={hasAnyPositions ? 0 : 3}
          gap={4}
          align="center"
          flexShrink={0}
          overflow="hidden"
          maxHeight={hasAnyPositions ? "0px" : "48px"}
          opacity={hasAnyPositions ? 0 : 1}
          transition="all 0.2s ease"
          borderBottomWidth={hasAnyPositions ? "0px" : "1px"}
        >
          <Icon as={LuInfo} color="blue.500" boxSize={5} flexShrink={0} />
          <Flex align="center" gap={2}>
            <Icon as={LuMousePointer2} color="gray.600" boxSize={4} />
            <Text fontSize="sm" color="gray.700">
              スタッフの行をドラッグして時間を割り当て
            </Text>
          </Flex>
        </Flex>
      )}
      <Table.Root size="sm" borderCollapse="separate" borderSpacing={0}>
        <Table.Header>
          <Table.Row bg="white" position="sticky" top={0} zIndex={10} boxShadow="0 2px 4px rgba(0,0,0,0.04)">
            <Table.ColumnHeader w="120px" whiteSpace="nowrap" position="sticky" left={0} bg="white" zIndex={11}>
              <SortMenu sortMode={sortMode} onSortChange={setSortMode} />
            </Table.ColumnHeader>
            <Table.ColumnHeader colSpan={timeSlots.length} p={0} w={`${timeAxisWidth}px`}>
              <TimeHeader timeRange={timeRange} />
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body css={{ "& tr:last-child td": { borderBottom: "none" } }}>
          {sortedStaffs.map((staff: StaffType) => {
            const staffShifts = getShiftsForStaff(staff.id);
            return (
              <StaffRow
                key={staff.id}
                staff={staff}
                staffShifts={staffShifts}
                timeRange={timeRange}
                timeAxisWidth={timeAxisWidth}
                timeSlotsCount={timeSlots.length}
                isCurrentStaff={staff.id === currentStaffId}
                isReadOnly={isReadOnly}
                onRowMouseDown={handleRowMouseDown}
                onRowMouseMoveForCursor={handleRowMouseMoveForCursor}
                onShiftClick={onShiftClick}
                onStaffNameClick={onStaffNameClick}
                dragState={dragState}
                isDragging={isDragging}
                cursorStyle={cursorStyles[staff.id] ?? "default"}
                rowRef={(el: HTMLDivElement | null) => {
                  rowContainerRefs.current[staff.id] = el;
                }}
                paintClickAnchorRef={paintClickAnchorRef}
                onMouseUpOnRow={handleMouseUpOnRow}
              />
            );
          })}
        </Table.Body>
      </Table.Root>
    </Box>
  );
};
