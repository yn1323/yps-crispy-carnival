import { Box, Button, Flex, Icon, Table, Text, VStack } from "@chakra-ui/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { LuRedo2, LuUndo2 } from "react-icons/lu";
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
import type { ShiftData, ShiftTableTestProps, ToolSelection } from "./types";

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

  // === その他の状態 ===
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");
  const [selectedTool, setSelectedTool] = useState<ToolSelection>(null);
  const [hoveredShiftId, setHoveredShiftId] = useState<string | null>(null);

  // selectedToolからポジションを抽出（useDrag用）
  const selectedPosition = selectedTool !== "eraser" ? selectedTool : null;

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

  // スタッフ名取得関数（useDrag用）
  const getStaffName = useCallback((staffId: string) => staffs.find((s) => s.id === staffId)?.name ?? "", [staffs]);

  // === ドラッグ管理 ===
  const isEraserMode = selectedTool === "eraser";
  const { dragState, isDragging, handleMouseDown, handleMouseMove, handleMouseUp, getCursor } = useDrag({
    shifts,
    setShifts,
    selectedPosition,
    isEraserMode,
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
      setShifts(newShifts);
      // ポップオーバー・コンテキストメニューを閉じる
      setPopoverShift(null);
      setPopoverAnchor(null);
      setContextMenuPosition(null);
      setContextMenuShiftId(null);
    },
    [shifts, setShifts],
  );

  // シフトクリック（消しゴムモード時は削除、通常時はポップオーバー表示）
  const handleShiftClick = useCallback(
    (shiftId: string, positionId: string | null, e: React.MouseEvent) => {
      // 消しゴムモード時は対象ポジションを削除
      if (isEraserMode && positionId) {
        const targetShift = shifts.find((s) => s.id === shiftId);
        if (targetShift) {
          const updatedPositions = targetShift.positions.filter((p) => p.id !== positionId);
          const updatedShift = { ...targetShift, positions: updatedPositions };
          const updatedShifts = shifts.map((s) => (s.id === shiftId ? updatedShift : s));
          setShifts(updatedShifts);
        }
        return;
      }

      // 通常時はポップオーバー表示
      const shift = shifts.find((s) => s.id === shiftId);
      if (shift) {
        setPopoverShift(shift);
        setPopoverAnchor(e.currentTarget as HTMLElement);
      }
    },
    [shifts, isEraserMode, setShifts],
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
      const updatedShift = {
        ...popoverShift,
        positions: popoverShift.positions.filter((p) => p.id !== positionId),
      };
      const newShifts = shifts.map((s) => (s.id === popoverShift.id ? updatedShift : s));
      setShifts(newShifts);
      // ポップオーバーの状態も更新
      setPopoverShift(updatedShift);
    },
    [popoverShift, shifts, setShifts],
  );

  // ポップオーバーから全ポジション削除（希望シフト時間は残す）
  const handleClearAllPositions = useCallback(() => {
    if (!popoverShift) return;
    const updatedShift = {
      ...popoverShift,
      positions: [],
    };
    const newShifts = shifts.map((s) => (s.id === popoverShift.id ? updatedShift : s));
    setShifts(newShifts);
    // ポップオーバーの状態も更新
    setPopoverShift(updatedShift);
  }, [popoverShift, shifts, setShifts]);

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
        setShifts([...shifts, pastedShift]);
      }
    }
    handleContextMenuClose();
  }, [hoveredStaffId, hasClipboard, paste, selectedDate, shifts, setShifts, handleContextMenuClose]);

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

  // 行コンテナのマウスイベントハンドラー
  const handleRowMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, staffId: string) => {
      const rect = e.currentTarget.getBoundingClientRect();
      handleMouseDown(e, staffId, rect);
    },
    [handleMouseDown],
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
      const cursor = getRowCursor(staffId, e);
      setCursorStyle((prev) => ({ ...prev, [staffId]: cursor }));
      handleRowMouseMove(e);
    },
    [getRowCursor, handleRowMouseMove],
  );

  return (
    <Box p={4}>
      {/* Undo/Redoボタン */}
      <Flex gap={2} mb={4}>
        <Button size="sm" variant="outline" onClick={undo} disabled={!canUndo}>
          <Icon as={LuUndo2} mr={1} />
          Undo
        </Button>
        <Button size="sm" variant="outline" onClick={redo} disabled={!canRedo}>
          <Icon as={LuRedo2} mr={1} />
          Redo
        </Button>
      </Flex>

      {/* ポジションツールバー */}
      <Box mb={4}>
        <PositionToolbar positions={positions} selectedTool={selectedTool} onSelect={setSelectedTool} />
      </Box>

      {/* 日付タブ */}
      <Box mb={4}>
        <DateTabs dates={dates} selectedDate={selectedDate} onSelect={setSelectedDate} />
      </Box>

      {/* シフト表 */}
      <Box overflowX="auto" border="1px solid" borderColor="gray.200" borderRadius="lg">
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
                      onMouseUp={handleMouseUp}
                      onMouseLeave={() => {
                        handleMouseUp();
                        setHoveredStaffId(null);
                      }}
                      onMouseEnter={() => setHoveredStaffId(staff.id)}
                      cursor={cursorStyle[staff.id] ?? "default"}
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
          </Table.Body>
        </Table.Root>
      </Box>

      {/* サマリー行 */}
      <SummaryRow shifts={shifts} positions={positions} timeRange={timeRange} date={selectedDate} />

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
        <Text>選択ポジション: {selectedPosition?.name ?? "(なし)"}</Text>
        <Text>ホバー中シフト: {hoveredShiftId ?? "(なし)"}</Text>
        <Text>シフト数: {shifts.length}</Text>
        <Text>
          履歴: Undo可能={canUndo ? "✅" : "❌"} / Redo可能={canRedo ? "✅" : "❌"}
        </Text>
        <Text>ドラッグモード: {dragState.mode ?? "(なし)"}</Text>
      </VStack>
    </Box>
  );
};
