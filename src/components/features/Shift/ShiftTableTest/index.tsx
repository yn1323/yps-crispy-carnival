import { Box, Button, Flex, Icon, Table, Text, VStack } from "@chakra-ui/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { LuRedo2, LuUndo2 } from "react-icons/lu";
import { DateTabs } from "./DateTabs";
import { useDrag } from "./hooks/useDrag";
import { useUndoRedo } from "./hooks/useUndoRedo";
import { PositionToolbar } from "./PositionToolbar";
import { ShiftBar } from "./ShiftBar";
import type { PositionType, ShiftTableTestProps } from "./types";

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
  const [selectedPosition, setSelectedPosition] = useState<PositionType | null>(null);
  const [hoveredShiftId, setHoveredShiftId] = useState<string | null>(null);

  // 行コンテナのref（カーソル位置計算用）
  const rowContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // === ドラッグ管理 ===
  const { dragState, isDragging, handleMouseDown, handleMouseMove, handleMouseUp, getCursor } = useDrag({
    shifts,
    setShifts,
    selectedPosition,
    selectedDate,
    timeRange,
    staffs,
  });

  // 時間スロット
  const timeSlots = useMemo(() => generateTimeSlots(timeRange.start, timeRange.end), [timeRange.start, timeRange.end]);

  // 選択日のシフトをスタッフごとにフィルタ
  const getShiftsForStaff = (staffId: string) => {
    return shifts.filter((s) => s.staffId === staffId && s.date === selectedDate);
  };

  // シフト削除（履歴に追加）
  const handleDeleteShift = (shiftId: string) => {
    const newShifts = shifts.filter((s) => s.id !== shiftId);
    setShifts(newShifts);
  };

  // シフトクリック（ポップオーバー表示用 - Phase 0.4で実装）
  const handleShiftClick = (shiftId: string) => {
    console.log("Shift clicked:", shiftId);
    // TODO: Phase 0.4でポップオーバー実装
  };

  // 右クリック（コンテキストメニュー - Phase 0.4で実装）
  const handleContextMenu = (e: React.MouseEvent, shiftId: string) => {
    e.preventDefault();
    console.log("Context menu:", shiftId);
    // TODO: Phase 0.4でコンテキストメニュー実装
  };

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
        <PositionToolbar positions={positions} selectedPosition={selectedPosition} onSelect={setSelectedPosition} />
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
              {timeSlots.map((time) => (
                <Table.ColumnHeader key={time} w="60px" textAlign="center" fontSize="xs" color="gray.600">
                  {time}時
                </Table.ColumnHeader>
              ))}
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
                  </Table.Cell>
                  <Table.Cell colSpan={timeSlots.length} p={0}>
                    <Box
                      ref={(el: HTMLDivElement | null) => {
                        rowContainerRefs.current[staff.id] = el;
                      }}
                      position="relative"
                      height="50px"
                      bg={staff.isSubmitted ? "transparent" : "gray.50"}
                      onMouseDown={(e) => handleRowMouseDown(e, staff.id)}
                      onMouseMove={(e) => handleRowMouseMoveForCursor(e, staff.id)}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      cursor={cursorStyle[staff.id] ?? "default"}
                      userSelect="none"
                    >
                      {staff.isSubmitted ? (
                        staffShifts.map((shift) => (
                          <ShiftBar
                            key={shift.id}
                            shift={shift}
                            timeRange={timeRange}
                            onHover={setHoveredShiftId}
                            onClick={handleShiftClick}
                            onContextMenu={handleContextMenu}
                            onDelete={handleDeleteShift}
                            isDragging={isDragging}
                          />
                        ))
                      ) : (
                        <Flex height="100%" align="center" justify="center">
                          <Text color="gray.400" fontSize="sm">
                            (未提出)
                          </Text>
                        </Flex>
                      )}
                    </Box>
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* サマリー行 (Phase 0.4で実装) */}
      <Box mt={4} p={3} bg="gray.50" borderRadius="lg">
        <Text fontWeight="bold" color="gray.600" fontSize="sm">
          ▶ 合計（Phase 0.4で折りたたみサマリー実装予定）
        </Text>
      </Box>

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
