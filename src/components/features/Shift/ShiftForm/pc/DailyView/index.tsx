import { Box, Flex } from "@chakra-ui/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { StaffEditModal } from "@/src/components/features/Staff/StaffEditModal";
import { useDialog } from "@/src/components/ui/Dialog";
import {
  breakPositionAtom,
  selectedDateAtom,
  selectedPositionIdAtom,
  shiftConfigAtom,
  shiftsAtom,
  toolModeAtom,
} from "../../stores";
import type { ShiftData } from "../../types";
import { deletePositionFromShift, normalizePositions } from "../../utils/shiftOperations";
import { DateTabs } from "./DateTabs";
import { PositionToolbar } from "./PositionToolbar";
import { ShiftGrid } from "./ShiftGrid";
import { ShiftPopover } from "./ShiftPopover";

type UndoRedoHandlers = {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export const DailyView = ({ undo, redo, canUndo, canRedo }: UndoRedoHandlers) => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const setShifts = useSetAtom(shiftsAtom);
  const breakPosition = useAtomValue(breakPositionAtom);
  const [toolMode, setToolMode] = useAtom(toolModeAtom);
  const [selectedPositionId, setSelectedPositionId] = useAtom(selectedPositionIdAtom);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);

  const { positions, dates, isReadOnly, shopId } = config;

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

  // === ポップオーバー状態 ===
  const [popoverShift, setPopoverShift] = useState<ShiftData | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null);

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
      setShifts(newShifts);
      const normalizedPositions = breakPosition
        ? normalizePositions({ positions: updatedShift.positions, breakPosition })
        : updatedShift.positions;
      if (normalizedPositions.length === 0) {
        handlePopoverClose();
        return;
      }
      setPopoverShift({ ...updatedShift, positions: normalizedPositions });
    },
    [popoverShift, shifts, setShifts, breakPosition, handlePopoverClose],
  );

  // 全ポジション削除
  const handleClearAllPositions = useCallback(() => {
    if (!popoverShift) return;
    const updatedShift = { ...popoverShift, positions: [] };
    const newShifts = shifts.map((s) => (s.id === popoverShift.id ? updatedShift : s));
    setShifts(newShifts);
    handlePopoverClose();
  }, [popoverShift, shifts, setShifts, handlePopoverClose]);

  // paintクリック時のポップオーバー表示
  const handlePaintClickPopover = useCallback((shift: ShiftData, anchorRect: DOMRect) => {
    setPopoverShift(shift);
    setPopoverAnchor(anchorRect);
  }, []);

  return (
    <Flex direction="column" flex={1} minHeight={0}>
      {/* ポジションツールバー（閲覧専用時は非表示） */}
      {!isReadOnly && (
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
      )}

      {/* 日付タブ + シフト表 */}
      <Flex
        direction="column"
        flex={1}
        minHeight={0}
        border="1px solid"
        borderColor="gray.200"
        borderRadius="lg"
        overflow="hidden"
      >
        <DateTabs dates={dates} selectedDate={selectedDate} onSelect={setSelectedDate} />
        <ShiftGrid
          onShiftClick={handleShiftClick}
          onStaffNameClick={handleStaffNameClick}
          onPaintClickPopover={handlePaintClickPopover}
        />
      </Flex>

      {/* ポップオーバー */}
      <ShiftPopover
        shift={popoverShift}
        anchorRect={popoverAnchor}
        isOpen={popoverShift !== null}
        isStaffSubmitted={
          popoverShift ? (config.staffs.find((s) => s.id === popoverShift.staffId)?.isSubmitted ?? false) : false
        }
        onClose={handlePopoverClose}
        onDeletePosition={handleDeletePosition}
        onDeleteShift={handleClearAllPositions}
        isReadOnly={isReadOnly}
      />

      {/* スタッフ編集モーダル（閲覧専用時は非表示） */}
      {!isReadOnly && selectedStaffId && (
        <StaffEditModal
          staffId={selectedStaffId}
          shopId={shopId}
          isOpen={staffEditModal.isOpen}
          onOpenChange={staffEditModal.onOpenChange}
          onClose={staffEditModal.close}
        />
      )}
    </Flex>
  );
};
