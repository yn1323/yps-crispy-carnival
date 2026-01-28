import { Box, Flex, Table, Text, VStack } from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StaffEditModal } from "@/src/components/features/Staff/StaffEditModal";
import { useDialog } from "@/src/components/ui/Dialog";
import { DateTabs } from "./DateTabs";
import { DragPreview } from "./DragPreview";
import { GridLines } from "./GridLines";
import { useDrag } from "./hooks/useDrag";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useUndoRedo } from "./hooks/useUndoRedo";
import { PositionToolbar } from "./PositionToolbar";
import { ShiftBar } from "./ShiftBar";
import { ShiftPopover } from "./ShiftPopover";
import { SortMenu } from "./SortMenu";
import { SummaryRow } from "./SummaryRow";
import { TimeHeader } from "./TimeHeader";
import {
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_MAX_SPEED,
  AUTO_SCROLL_MIN_SPEED,
  type ShiftData,
  type ShiftTableTestProps,
  type SortMode,
  type StaffType,
  type SummaryDisplayMode,
  type ToolMode,
} from "./types";
import { deletePositionFromShift, getTimeAxisWidth, normalizePositions } from "./utils/shiftOperations";
import { sortStaffs } from "./utils/sortStaffs";

// 時間スロットを生成
const generateTimeSlots = (start: number, end: number) => {
  const slots: string[] = [];
  for (let hour = start; hour <= end; hour++) {
    slots.push(`${hour}`);
  }
  return slots;
};

export const ShiftTableTest = ({ shopId, staffs, positions, initialShifts, dates, timeRange }: ShiftTableTestProps) => {
  // === Undo/Redo管理 ===
  const { state: shifts, set: setShifts, undo, redo, canUndo, canRedo } = useUndoRedo(initialShifts);

  // === スタッフ編集モーダル ===
  const staffEditModal = useDialog();
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  const handleStaffNameClick = useCallback(
    (staffId: string) => {
      setSelectedStaffId(staffId);
      staffEditModal.open();
    },
    [staffEditModal],
  );

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

  // === ソート状態（スナップショット方式） ===
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [sortedStaffIds, setSortedStaffIds] = useState<string[]>(() =>
    sortStaffs({ staffs, shifts: initialShifts, selectedDate: dates[0] ?? "", sortMode: "default" }).map((s) => s.id),
  );

  const handleSortChange = useCallback(
    (mode: SortMode) => {
      setSortMode(mode);
      const sorted = sortStaffs({ staffs, shifts, selectedDate, sortMode: mode });
      setSortedStaffIds(sorted.map((s) => s.id));
    },
    [staffs, shifts, selectedDate],
  );

  // 日付タブ切替時に再ソート
  const handleDateChange = useCallback(
    (date: string) => {
      setSelectedDate(date);
      const sorted = sortStaffs({ staffs, shifts, selectedDate: date, sortMode });
      setSortedStaffIds(sorted.map((s) => s.id));
    },
    [staffs, shifts, sortMode],
  );

  // ソート順でスタッフを並べ替え
  const sortedStaffs = useMemo(() => {
    const staffMap = new Map(staffs.map((s) => [s.id, s]));
    return sortedStaffIds.map((id) => staffMap.get(id)).filter((s): s is StaffType => s !== undefined);
  }, [staffs, sortedStaffIds]);

  // selectedPositionIdからポジションオブジェクトを取得（useDrag用）
  const selectedPosition = selectedPositionId ? (positions.find((p) => p.id === selectedPositionId) ?? null) : null;

  // === ポップオーバー状態 ===
  const [popoverShift, setPopoverShift] = useState<ShiftData | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null);

  // 行コンテナのref（カーソル位置計算用）
  const rowContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // paint モードクリック時のアンカー座標
  const paintClickAnchorRef = useRef<DOMRect | null>(null);

  // === 横スクロール用 ===
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollDragRef = useRef({ isScrolling: false, startX: 0, startScrollLeft: 0 });
  const [isScrollDragging, setIsScrollDragging] = useState(false);

  // === ドラッグ中の行rect保存（他行移動時も継続するため） ===
  const dragRowRectRef = useRef<DOMRect | null>(null);

  // === 自動スクロール用 ===
  const mouseClientXRef = useRef<number>(0); // マウスのX座標（viewport基準）
  const autoScrollRAFRef = useRef<number | null>(null); // requestAnimationFrame ID

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

  // 時間軸の固定幅を計算
  const timeAxisWidth = useMemo(() => getTimeAxisWidth(timeRange), [timeRange]);

  // 選択日のシフトをスタッフごとにフィルタ
  const getShiftsForStaff = (staffId: string) => {
    return shifts.filter((s) => s.staffId === staffId && s.date === selectedDate);
  };

  // スタッフの提出状態を判定（日付ごと）
  const getSubmissionStatus = (staff: StaffType, staffShifts: ShiftData[]) => {
    if (!staff.isSubmitted) return "not_submitted" as const;
    const hasRequest = staffShifts.some((s) => s.requestedTime !== null);
    if (hasRequest) return "has_request" as const;
    return "no_request" as const;
  };

  // シフトクリック（全モード共通: ポップオーバー表示）
  const handleShiftClick = useCallback(
    (shiftId: string, _positionId: string | null, e: React.MouseEvent) => {
      const shift = shifts.find((s) => s.id === shiftId);
      if (shift) {
        setPopoverShift(shift);
        setPopoverAnchor(e.currentTarget.getBoundingClientRect());
      }
    },
    [shifts],
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
      const normalizedPositions = breakPosition
        ? normalizePositions({ positions: updatedShift.positions, breakPosition })
        : updatedShift.positions;
      // ポジションが0件になったらポップオーバーを閉じる
      if (normalizedPositions.length === 0) {
        handlePopoverClose();
        return;
      }
      // ポップオーバーにも正規化済み状態を反映
      setPopoverShift({ ...updatedShift, positions: normalizedPositions });
    },
    [popoverShift, shifts, setShiftsNormalized, breakPosition, handlePopoverClose],
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
    // 全削除後はポップオーバーを閉じる
    handlePopoverClose();
  }, [popoverShift, shifts, setShiftsNormalized, handlePopoverClose]);

  // キーボードショートカット
  useKeyboardShortcuts({
    onUndo: undo,
    onRedo: redo,
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

      // ドラッグ開始時にrectを保存（他行移動時も継続するため）
      if (dragStarted) {
        dragRowRectRef.current = rect;
      }

      // 選択モードでドラッグ未開始（リサイズ端でない）→ 横スクロール開始
      if (toolMode === "select" && !dragStarted && tableContainerRef.current) {
        scrollDragRef.current = {
          isScrolling: true,
          startX: e.clientX,
          startScrollLeft: tableContainerRef.current.scrollLeft,
        };
        setIsScrollDragging(true);
        dragRowRectRef.current = rect; // スクロール用にも保存
      }
    },
    [handleMouseDown, toolMode],
  );

  // カーソルスタイルを取得
  const getRowCursor = useCallback(
    (staffId: string, e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      return getCursor(staffId, x);
    },
    [getCursor],
  );

  // カーソル状態を管理
  const [cursorStyle, setCursorStyle] = useState<Record<string, string>>({});

  const handleRowMouseMoveForCursor = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, staffId: string) => {
      // ドラッグ中でない場合のみカーソル更新（ドラッグ中はdocumentリスナーで処理）
      if (!isDragging && !scrollDragRef.current.isScrolling) {
        const cursor = getRowCursor(staffId, e);
        setCursorStyle((prev) => ({ ...prev, [staffId]: cursor }));
      }
    },
    [getRowCursor, isDragging],
  );

  // === document レベルのマウスイベントリスナー（ドラッグ継続用） ===
  useEffect(() => {
    const handleDocumentMouseMove = (e: MouseEvent) => {
      // マウス位置を常に更新（自動スクロール用）
      mouseClientXRef.current = e.clientX;

      // 横スクロール中
      if (isScrollDragging && tableContainerRef.current) {
        const dx = e.clientX - scrollDragRef.current.startX;
        tableContainerRef.current.scrollLeft = scrollDragRef.current.startScrollLeft - dx;
        return;
      }

      // ドラッグ中（ペイント/消去/リサイズ）
      if (isDragging && dragRowRectRef.current) {
        // 保存したrectを使ってhandleMouseMoveを呼び出す
        handleMouseMove(e as unknown as React.MouseEvent<HTMLDivElement>, dragRowRectRef.current);
      }
    };

    const handleDocumentMouseUp = () => {
      // ドラッグ終了処理
      if (isDragging) {
        handleMouseUp();
        dragRowRectRef.current = null;
      }
      // スクロール終了処理
      if (isScrollDragging) {
        stopScrollDrag();
        dragRowRectRef.current = null;
      }
    };

    // ドラッグ中またはスクロール中のみリスナー登録
    if (isDragging || isScrollDragging) {
      document.addEventListener("mousemove", handleDocumentMouseMove);
      document.addEventListener("mouseup", handleDocumentMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleDocumentMouseMove);
      document.removeEventListener("mouseup", handleDocumentMouseUp);
    };
  }, [isDragging, isScrollDragging, handleMouseMove, handleMouseUp, stopScrollDrag]);

  // === 自動スクロール（ドラッグ中に端に近づいたら発動） ===
  const STAFF_COLUMN_WIDTH = 120; // スタッフ名列の幅

  useEffect(() => {
    if (!isDragging || !tableContainerRef.current) {
      // ドラッグ終了時にRAFをキャンセル
      if (autoScrollRAFRef.current) {
        cancelAnimationFrame(autoScrollRAFRef.current);
        autoScrollRAFRef.current = null;
      }
      return;
    }

    const autoScroll = () => {
      const container = tableContainerRef.current;
      if (!container || !isDragging) return;

      const containerRect = container.getBoundingClientRect();
      const mouseX = mouseClientXRef.current;

      // 時間軸エリアの左端を基準に計算（スタッフ名列の幅を考慮）
      const timeAxisLeft = containerRect.left + STAFF_COLUMN_WIDTH;
      const timeAxisRight = containerRect.right;

      let scrollDelta = 0;

      // 左端に近い場合（時間軸エリア基準で判定）
      const distanceFromLeft = mouseX - timeAxisLeft;
      if (distanceFromLeft < AUTO_SCROLL_EDGE_PX && distanceFromLeft >= -STAFF_COLUMN_WIDTH) {
        // マウスがスタッフ名列内にある場合も含めて左スクロール発動
        const effectiveDistance = Math.max(0, distanceFromLeft);
        const ratio = (AUTO_SCROLL_EDGE_PX - effectiveDistance) / AUTO_SCROLL_EDGE_PX;
        scrollDelta = -(AUTO_SCROLL_MIN_SPEED + (AUTO_SCROLL_MAX_SPEED - AUTO_SCROLL_MIN_SPEED) * ratio);
      }
      // 右端に近い場合
      else {
        const distanceFromRight = timeAxisRight - mouseX;
        if (distanceFromRight < AUTO_SCROLL_EDGE_PX && distanceFromRight >= 0) {
          const ratio = (AUTO_SCROLL_EDGE_PX - distanceFromRight) / AUTO_SCROLL_EDGE_PX;
          scrollDelta = AUTO_SCROLL_MIN_SPEED + (AUTO_SCROLL_MAX_SPEED - AUTO_SCROLL_MIN_SPEED) * ratio;
        }
      }

      if (scrollDelta !== 0) {
        container.scrollLeft += scrollDelta;

        // スクロール後、rectを再取得してドラッグ座標を再計算
        if (dragState.staffId) {
          const currentRow = rowContainerRefs.current[dragState.staffId];
          if (currentRow) {
            dragRowRectRef.current = currentRow.getBoundingClientRect();
          }
        }

        if (dragRowRectRef.current) {
          const syntheticEvent = {
            clientX: mouseClientXRef.current,
            clientY: 0, // Y座標は使わないのでダミー
          } as unknown as React.MouseEvent<HTMLDivElement>;
          handleMouseMove(syntheticEvent, dragRowRectRef.current);
        }
      }

      // 次フレームをスケジュール
      autoScrollRAFRef.current = requestAnimationFrame(autoScroll);
    };

    // 自動スクロール開始
    autoScrollRAFRef.current = requestAnimationFrame(autoScroll);

    return () => {
      if (autoScrollRAFRef.current) {
        cancelAnimationFrame(autoScrollRAFRef.current);
        autoScrollRAFRef.current = null;
      }
    };
  }, [isDragging, handleMouseMove, dragState.staffId]);

  // maxHeight: _auth.tsx Container の余白分を差し引く
  // base: py=8px×2 + mb=80px(BottomMenu) = 96px
  // lg:   py=32px×2 = 64px
  return (
    <Flex direction="column" maxHeight={{ base: "calc(100dvh - 96px)", lg: "calc(100dvh - 64px + 200px)" }} p={4}>
      {/* ポジションツールバー（Undo/Redo統合済み） */}
      <Box mb={4} flexShrink={0}>
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
        />
      </Box>

      {/* 日付タブ + シフト表（一体化） */}
      <Flex
        direction="column"
        flex={1}
        minHeight={0}
        border="1px solid"
        borderColor="gray.200"
        borderRadius="lg"
        overflow="hidden"
      >
        {/* 日付タブ */}
        <DateTabs dates={dates} selectedDate={selectedDate} onSelect={handleDateChange} />

        {/* シフト表 */}
        <Box ref={tableContainerRef} flex={1} minHeight={0} overflowX="auto" overflowY="auto">
          <Table.Root size="sm" borderCollapse="separate" borderSpacing={0}>
            <Table.Header>
              <Table.Row bg="gray.50" position="sticky" top={0} zIndex={10} boxShadow="0 2px 4px rgba(0,0,0,0.04)">
                <Table.ColumnHeader w="120px" position="sticky" left={0} bg="gray.50" zIndex={11}>
                  <SortMenu sortMode={sortMode} onSortChange={handleSortChange} />
                </Table.ColumnHeader>
                <Table.ColumnHeader colSpan={timeSlots.length} p={0} w={`${timeAxisWidth}px`}>
                  <TimeHeader timeRange={timeRange} />
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body css={{ "& tr:last-child td": { borderBottom: "none" } }}>
              {sortedStaffs.map((staff) => {
                const staffShifts = getShiftsForStaff(staff.id);
                const status = getSubmissionStatus(staff, staffShifts);
                return (
                  <Table.Row key={staff.id} _hover={{ bg: "gray.50" }}>
                    <Table.Cell
                      position="sticky"
                      left={0}
                      bg="white"
                      zIndex={5}
                      borderRight="1px solid"
                      borderColor="gray.100"
                    >
                      <Box
                        cursor="pointer"
                        _hover={{ color: "teal.600" }}
                        onClick={() => handleStaffNameClick(staff.id)}
                      >
                        <Text fontWeight="medium">{staff.name}</Text>
                        {status === "no_request" && (
                          <Text color="gray.400" fontSize="xs">
                            希望なし
                          </Text>
                        )}
                        {status === "not_submitted" && (
                          <Text color="orange.400" fontSize="xs">
                            未提出
                          </Text>
                        )}
                      </Box>
                    </Table.Cell>
                    <Table.Cell colSpan={timeSlots.length} p={0} w={`${timeAxisWidth}px`}>
                      <Box
                        ref={(el: HTMLDivElement | null) => {
                          rowContainerRefs.current[staff.id] = el;
                        }}
                        position="relative"
                        height="50px"
                        width={`${timeAxisWidth}px`}
                        bg="transparent"
                        overflow="hidden"
                        onMouseDown={(e) => {
                          paintClickAnchorRef.current = (e.target as HTMLElement).getBoundingClientRect();
                          handleRowMouseDown(e, staff.id);
                        }}
                        onMouseMove={(e) => handleRowMouseMoveForCursor(e, staff.id)}
                        onMouseUp={() => {
                          // ドラッグ終了は document リスナーで処理するため、ここでは popover 表示のみ
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
                                setPopoverShift(targetShift);
                                setPopoverAnchor(paintClickAnchorRef.current);
                              }
                            }
                          }
                          // Erase モードで移動なし（クリック）→ ポジション上ならポップオーバー表示
                          if (
                            dragState.mode === "erase" &&
                            dragState.targetShiftId &&
                            Math.abs(dragState.currentMinutes - dragState.startMinutes) < timeRange.unit
                          ) {
                            const targetShift = shifts.find((s) => s.id === dragState.targetShiftId);
                            if (targetShift && paintClickAnchorRef.current) {
                              setPopoverShift(targetShift);
                              setPopoverAnchor(paintClickAnchorRef.current);
                            }
                          }
                        }}
                        onMouseLeave={() => {
                          // ドラッグ中は終了しない（documentリスナーで処理）
                          // カーソルスタイルのみリセット
                          if (!isDragging && !scrollDragRef.current.isScrolling) {
                            setCursorStyle((prev) => ({ ...prev, [staff.id]: "default" }));
                          }
                        }}
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
                            isDragging={isDragging}
                            currentMinutes={dragState.currentMinutes}
                            linkedTarget={dragState.targetShiftId === shift.id ? dragState.linkedTarget : null}
                          />
                        ))}

                        {/* 空状態テキスト（希望なし / 未提出） */}
                        {status !== "has_request" && staffShifts.every((s) => s.positions.length === 0) && (
                          <Flex position="absolute" inset={0} align="center" justify="center" pointerEvents="none">
                            <Text color={status === "no_request" ? "gray.400" : "orange.400"} fontSize="sm">
                              {status === "no_request" ? "希望なし" : "未提出"}
                            </Text>
                          </Flex>
                        )}

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
            <Table.Footer
              position="sticky"
              bottom={0}
              zIndex={10}
              bg="white"
              boxShadow="0 -2px 4px rgba(0,0,0,0.04)"
              css={{ "& tr:last-child td": { borderBottom: "none" } }}
            >
              <SummaryRow
                shifts={shifts}
                positions={positions}
                timeRange={timeRange}
                date={selectedDate}
                isExpanded={isSummaryExpanded}
                onToggleExpand={() => setIsSummaryExpanded(!isSummaryExpanded)}
                timeSlotsCount={timeSlots.length}
                timeAxisWidth={timeAxisWidth}
                displayMode={summaryDisplayMode}
                onDisplayModeChange={setSummaryDisplayMode}
              />
            </Table.Footer>
          </Table.Root>
        </Box>
      </Flex>

      {/* ポップオーバー */}
      <ShiftPopover
        shift={popoverShift}
        anchorRect={popoverAnchor}
        isOpen={popoverShift !== null}
        isStaffSubmitted={
          popoverShift ? (staffs.find((s) => s.id === popoverShift.staffId)?.isSubmitted ?? false) : false
        }
        onClose={handlePopoverClose}
        onDeletePosition={handleDeletePosition}
        onDeleteShift={handleClearAllPositions}
      />

      {/* スタッフ編集モーダル */}
      {selectedStaffId && (
        <StaffEditModal
          staffId={selectedStaffId}
          shopId={shopId}
          isOpen={staffEditModal.isOpen}
          onOpenChange={staffEditModal.onOpenChange}
          onClose={staffEditModal.close}
        />
      )}

      {/* デバッグ情報 */}
      <VStack flexShrink={0} align="start" mt={4} p={3} bg="blue.50" borderRadius="lg" fontSize="xs" color="blue.700">
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
    </Flex>
  );
};
