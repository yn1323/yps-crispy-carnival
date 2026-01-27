import { Box, Table, Text, VStack } from "@chakra-ui/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { ContextMenu } from "./ContextMenu";
import { DateTabs } from "./DateTabs";
import { DragPreview } from "./DragPreview";
import { GridLines } from "./GridLines";
import { useClipboard } from "./hooks/useClipboard";
import { useDrag } from "./hooks/useDrag";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useUndoRedo } from "./hooks/useUndoRedo";
import { PositionToolbar } from "./PositionToolbar";
import { ShiftBar } from "./ShiftBar";
import { ShiftPopover } from "./ShiftPopover";
import { SummaryRow } from "./SummaryRow";
import { TimeHeader } from "./TimeHeader";
import type { ShiftData, ShiftTableTestProps, SummaryDisplayMode, ToolMode } from "./types";
import { deletePositionFromShift, normalizePositions } from "./utils/shiftOperations";

// 時間スロットを生成
const generateTimeSlots = (start: number, end: number) => {
  const slots: string[] = [];
  for (let hour = start; hour <= end; hour++) {
    slots.push(`${hour}`);
  }
  return slots;
};

export const ShiftTableTest = ({ staffs, positions, initialShifts, dates, timeRange }: ShiftTableTestProps) => {
  // === Undo/Redo管理 ===
  const { state: shifts, set: setShifts, undo, redo, canUndo, canRedo } = useUndoRedo(initialShifts);

  // === 正規化ラッパー ===
  const breakPosition = useMemo(() => positions.find((p) => p.name === "休憩") ?? null, [positions]);

  const setShiftsNormalized = useCallback(
    (newShifts: ShiftData[]) => {
      if (!breakPosition) {
        setShifts(newShifts);
        return;
      }
      setShifts(
        newShifts.map((shift) => ({
          ...shift,
          positions: normalizePositions({ positions: shift.positions, breakPosition }),
        })),
      );
    },
    [setShifts, breakPosition],
  );

  // === ツール・ポジション状態 ===
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [hoveredShiftId, setHoveredShiftId] = useState<string | null>(null);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [summaryDisplayMode, setSummaryDisplayMode] = useState<SummaryDisplayMode>("color");

  // selectedPositionIdからポジションオブジェクトを取得（useDrag用）
  const selectedPosition = selectedPositionId ? (positions.find((p) => p.id === selectedPositionId) ?? null) : null;

  // === ポップオーバー状態 ===
  const [popoverShift, setPopoverShift] = useState<ShiftData | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);

  // === コンテキストメニュー状態 ===
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuShiftId, setContextMenuShiftId] = useState<string | null>(null);

  // === ペースト先特定用 ===
  const [hoveredStaffId, setHoveredStaffId] = useState<string | null>(null);

  // === クリップボード ===
  const { copy, paste, hasClipboard } = useClipboard();

  // 行コンテナのref（カーソル位置計算用）
  const rowContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // === 横スクロール用 ===
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollDragRef = useRef({ isScrolling: false, startX: 0, startScrollLeft: 0 });
  const [isScrollDragging, setIsScrollDragging] = useState(false);

  // スタッフ名取得関数（useDrag用）
  const getStaffName = useCallback((staffId: string) => staffs.find((s) => s.id === staffId)?.name ?? "", [staffs]);

  // === ドラッグ管理 ===
  const { dragState, isDragging, handleMouseDown, handleMouseMove, handleMouseUp, getCursor } = useDrag({
    shifts,
    setShifts: setShiftsNormalized,
    selectedPosition,
    toolMode,
    selectedDate,
    timeRange,
    getStaffName,
  });

  // 時間スロット
  const timeSlots = useMemo(() => generateTimeSlots(timeRange.start, timeRange.end), [timeRange.start, timeRange.end]);

  // 選択日のシフトをスタッフごとにフィルタ
  const getShiftsForStaff = (staffId: string) => {
    return shifts.filter((s) => s.staffId === staffId && s.date === selectedDate);
  };

  // シフト削除（履歴に追加）
  const handleDeleteShift = useCallback(
    (shiftId: string) => {
      const newShifts = shifts.filter((s) => s.id !== shiftId);
      setShiftsNormalized(newShifts);
      // ポップオーバー・コンテキストメニューを閉じる
      setPopoverShift(null);
      setPopoverAnchor(null);
      setContextMenuPosition(null);
      setContextMenuShiftId(null);
    },
    [shifts, setShiftsNormalized],
  );

  // シフトクリック（ツールモードに応じた処理）
  const handleShiftClick = useCallback(
    (shiftId: string, positionId: string | null, e: React.MouseEvent) => {
      // 消すモード: 対象ポジションを削除
      if (toolMode === "erase" && positionId) {
        const targetShift = shifts.find((s) => s.id === shiftId);
        if (targetShift && breakPosition) {
          const updatedShift = deletePositionFromShift({
            shift: targetShift,
            positionSegmentId: positionId,
            breakPositionId: breakPosition.id,
          });
          const updatedShifts = shifts.map((s) => (s.id === shiftId ? updatedShift : s));
          setShiftsNormalized(updatedShifts);
        } else if (targetShift) {
          const updatedPositions = targetShift.positions.filter((p) => p.id !== positionId);
          const updatedShift = { ...targetShift, positions: updatedPositions };
          setShifts(shifts.map((s) => (s.id === shiftId ? updatedShift : s)));
        }
        return;
      }

      // 選択モード: ポップオーバー表示
      if (toolMode === "select") {
        const shift = shifts.find((s) => s.id === shiftId);
        if (shift) {
          setPopoverShift(shift);
          setPopoverAnchor(e.currentTarget as HTMLElement);
        }
      }
      // 割当モード: クリックでは何もしない（ドラッグのみ）
    },
    [shifts, toolMode, setShifts, setShiftsNormalized, breakPosition],
  );

  // ポップオーバーを閉じる
  const handlePopoverClose = useCallback(() => {
    setPopoverShift(null);
    setPopoverAnchor(null);
  }, []);

  // ポジション個別削除
  const handleDeletePosition = useCallback(
    (positionId: string) => {
      if (!popoverShift) return;
      const updatedShift = breakPosition
        ? deletePositionFromShift({
            shift: popoverShift,
            positionSegmentId: positionId,
            breakPositionId: breakPosition.id,
          })
        : { ...popoverShift, positions: popoverShift.positions.filter((p) => p.id !== positionId) };
      const newShifts = shifts.map((s) => (s.id === popoverShift.id ? updatedShift : s));
      setShiftsNormalized(newShifts);
      // ポップオーバーにも正規化済み状態を反映
      const normalizedPositions = breakPosition
        ? normalizePositions({ positions: updatedShift.positions, breakPosition })
        : updatedShift.positions;
      setPopoverShift({ ...updatedShift, positions: normalizedPositions });
    },
    [popoverShift, shifts, setShiftsNormalized, breakPosition],
  );

  // ポップオーバーから全ポジション削除（希望シフト時間は残す）
  const handleClearAllPositions = useCallback(() => {
    if (!popoverShift) return;
    const updatedShift = {
      ...popoverShift,
      positions: [],
    };
    const newShifts = shifts.map((s) => (s.id === popoverShift.id ? updatedShift : s));
    setShiftsNormalized(newShifts);
    // ポップオーバーの状態も更新
    setPopoverShift(updatedShift);
  }, [popoverShift, shifts, setShiftsNormalized]);

  // 右クリック（コンテキストメニュー表示）
  const handleContextMenu = useCallback((e: React.MouseEvent, shiftId: string) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuShiftId(shiftId);
  }, []);

  // コンテキストメニューを閉じる
  const handleContextMenuClose = useCallback(() => {
    setContextMenuPosition(null);
    setContextMenuShiftId(null);
  }, []);

  // コピー
  const handleCopy = useCallback(() => {
    const targetShiftId = contextMenuShiftId ?? hoveredShiftId;
    if (targetShiftId) {
      const shift = shifts.find((s) => s.id === targetShiftId);
      if (shift) {
        copy(shift);
      }
    }
    handleContextMenuClose();
  }, [contextMenuShiftId, hoveredShiftId, shifts, copy, handleContextMenuClose]);

  // ペースト
  const handlePaste = useCallback(() => {
    if (hoveredStaffId && hasClipboard) {
      const pastedShift = paste(hoveredStaffId, selectedDate);
      if (pastedShift) {
        setShiftsNormalized([...shifts, pastedShift]);
      }
    }
    handleContextMenuClose();
  }, [hoveredStaffId, hasClipboard, paste, selectedDate, shifts, setShiftsNormalized, handleContextMenuClose]);

  // コンテキストメニューから削除
  const handleDeleteFromContextMenu = useCallback(() => {
    if (contextMenuShiftId) {
      handleDeleteShift(contextMenuShiftId);
    }
  }, [contextMenuShiftId, handleDeleteShift]);

  // キーボードショートカット
  useKeyboardShortcuts({
    onUndo: undo,
    onRedo: redo,
    onCopy: handleCopy,
    onPaste: handlePaste,
  });

  // スクロール終了処理
  const stopScrollDrag = useCallback(() => {
    scrollDragRef.current.isScrolling = false;
    setIsScrollDragging(false);
  }, []);

  // 行コンテナのマウスイベントハンドラー
  const handleRowMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, staffId: string) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const dragStarted = handleMouseDown(e, staffId, rect);

      // 選択モードでドラッグ未開始（リサイズ端でない）→ 横スクロール開始
      if (toolMode === "select" && !dragStarted && tableContainerRef.current) {
        scrollDragRef.current = {
          isScrolling: true,
          startX: e.clientX,
          startScrollLeft: tableContainerRef.current.scrollLeft,
        };
        setIsScrollDragging(true);
      }
    },
    [handleMouseDown, toolMode],
  );

  const handleRowMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      handleMouseMove(e, rect);
    },
    [handleMouseMove],
  );

  // カーソルスタイルを取得
  const getRowCursor = useCallback(
    (staffId: string, e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      return getCursor(staffId, x, rect.width);
    },
    [getCursor],
  );

  // カーソル状態を管理
  const [cursorStyle, setCursorStyle] = useState<Record<string, string>>({});

  const handleRowMouseMoveForCursor = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, staffId: string) => {
      // 横スクロール中
      if (scrollDragRef.current.isScrolling && tableContainerRef.current) {
        const dx = e.clientX - scrollDragRef.current.startX;
        tableContainerRef.current.scrollLeft = scrollDragRef.current.startScrollLeft - dx;
      }

      const cursor = getRowCursor(staffId, e);
      setCursorStyle((prev) => ({ ...prev, [staffId]: cursor }));
      handleRowMouseMove(e);
    },
    [getRowCursor, handleRowMouseMove],
  );

  return (
    <Box p={4}>
      {/* ポジションツールバー（Undo/Redo統合済み） */}
      <Box mb={4}>
        <PositionToolbar
          toolMode={toolMode}
          onToolModeChange={setToolMode}
          positions={positions}
          selectedPositionId={selectedPositionId}
          onPositionSelect={setSelectedPositionId}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          summaryDisplayMode={summaryDisplayMode}
          onSummaryDisplayModeChange={setSummaryDisplayMode}
        />
      </Box>

      {/* 日付タブ + シフト表（一体化） */}
      <Box border="1px solid" borderColor="gray.200" borderRadius="lg">
        {/* 日付タブ */}
        <DateTabs dates={dates} selectedDate={selectedDate} onSelect={setSelectedDate} />

        {/* シフト表 */}
        <Box ref={tableContainerRef} overflowX="auto">
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row bg="gray.50">
                <Table.ColumnHeader w="120px" position="sticky" left={0} bg="gray.50" zIndex={1}>
                  スタッフ
                </Table.ColumnHeader>
                <Table.ColumnHeader colSpan={timeSlots.length} p={0}>
                  <TimeHeader timeRange={timeRange} />
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {staffs.map((staff) => {
                const staffShifts = getShiftsForStaff(staff.id);
                return (
                  <Table.Row key={staff.id} _hover={{ bg: "gray.50" }}>
                    <Table.Cell
                      fontWeight="medium"
                      position="sticky"
                      left={0}
                      bg="white"
                      zIndex={1}
                      borderRight="1px solid"
                      borderColor="gray.100"
                    >
                      {staff.name}
                      {!staff.isSubmitted && (
                        <Text as="span" color="gray.400" fontSize="xs" ml={1}>
                          (未)
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell colSpan={timeSlots.length} p={0}>
                      <Box
                        ref={(el: HTMLDivElement | null) => {
                          rowContainerRefs.current[staff.id] = el;
                        }}
                        position="relative"
                        height="50px"
                        px={5}
                        bg={staff.isSubmitted ? "transparent" : "gray.50"}
                        onMouseDown={(e) => handleRowMouseDown(e, staff.id)}
                        onMouseMove={(e) => handleRowMouseMoveForCursor(e, staff.id)}
                        onMouseUp={() => {
                          handleMouseUp();
                          stopScrollDrag();
                        }}
                        onMouseLeave={() => {
                          handleMouseUp();
                          stopScrollDrag();
                          setHoveredStaffId(null);
                        }}
                        onMouseEnter={() => setHoveredStaffId(staff.id)}
                        cursor={isScrollDragging ? "grabbing" : (cursorStyle[staff.id] ?? "default")}
                        userSelect="none"
                      >
                        {/* グリッドライン（最背面） */}
                        <GridLines timeRange={timeRange} />

                        {/* シフトバー（提出済み・未提出両方表示） */}
                        {staffShifts.map((shift) => (
                          <ShiftBar
                            key={shift.id}
                            shift={shift}
                            timeRange={timeRange}
                            onHover={setHoveredShiftId}
                            onClick={handleShiftClick}
                            onContextMenu={handleContextMenu}
                            isDragging={isDragging}
                            currentMinutes={dragState.currentMinutes}
                            linkedTarget={dragState.targetShiftId === shift.id ? dragState.linkedTarget : null}
                          />
                        ))}

                        {/* ドラッグプレビュー（リサイズ以外のドラッグ中のみ表示） */}
                        {isDragging &&
                          dragState.staffId === staff.id &&
                          dragState.mode !== "position-resize-start" &&
                          dragState.mode !== "position-resize-end" && (
                            <DragPreview
                              mode={dragState.mode}
                              startMinutes={dragState.startMinutes}
                              currentMinutes={dragState.currentMinutes}
                              timeRange={timeRange}
                              positionColor={dragState.positionColor}
                            />
                          )}
                      </Box>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
              {/* サマリー行（サブトータル） */}
              <SummaryRow
                shifts={shifts}
                positions={positions}
                timeRange={timeRange}
                date={selectedDate}
                isExpanded={isSummaryExpanded}
                onToggleExpand={() => setIsSummaryExpanded(!isSummaryExpanded)}
                timeSlotsCount={timeSlots.length}
                displayMode={summaryDisplayMode}
              />
            </Table.Body>
          </Table.Root>
        </Box>
      </Box>

      {/* ポップオーバー */}
      <ShiftPopover
        shift={popoverShift}
        anchorEl={popoverAnchor}
        isOpen={popoverShift !== null}
        onClose={handlePopoverClose}
        onDeletePosition={handleDeletePosition}
        onDeleteShift={handleClearAllPositions}
      />

      {/* コンテキストメニュー */}
      <ContextMenu
        position={contextMenuPosition}
        isOpen={contextMenuPosition !== null}
        onClose={handleContextMenuClose}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDelete={handleDeleteFromContextMenu}
        canPaste={hasClipboard}
      />

      {/* デバッグ情報 */}
      <VStack align="start" mt={4} p={3} bg="blue.50" borderRadius="lg" fontSize="xs" color="blue.700">
        <Text fontWeight="bold">デバッグ情報:</Text>
        <Text>選択日: {selectedDate}</Text>
        <Text>ツールモード: {toolMode}</Text>
        <Text>選択ポジション: {selectedPosition?.name ?? "(なし)"}</Text>
        <Text>ホバー中シフト: {hoveredShiftId ?? "(なし)"}</Text>
        <Text>シフト数: {shifts.length}</Text>
        <Text>
          履歴: Undo可能={canUndo ? "Y" : "N"} / Redo可能={canRedo ? "Y" : "N"}
        </Text>
        <Text>ドラッグモード: {dragState.mode ?? "(なし)"}</Text>
      </VStack>
    </Box>
  );
};
