import { useCallback, useRef, useState } from "react";
import { MIN_SHIFT_DURATION_MINUTES, RESIZE_EDGE_THRESHOLD } from "../constants";
import type { DragMode, PositionType, ShiftData, StaffType, TimeRange } from "../types";
import {
  createShift,
  detectPositionResizeEdge,
  detectResizeEdge,
  findShiftAtPosition,
  mergeOverlappingShifts,
  paintPosition,
  pixelToMinutes,
  resizePosition,
  resizeShift,
} from "../utils/shiftOperations";

type DragState = {
  mode: DragMode;
  staffId: string | null;
  startMinutes: number;
  currentMinutes: number;
  targetShiftId: string | null;
  targetPositionId: string | null;
  positionColor: string | null;
  resizeEdge: "start" | "end" | null;
};

type UseDragParams = {
  shifts: ShiftData[];
  setShifts: (shifts: ShiftData[]) => void;
  selectedPosition: PositionType | null;
  selectedDate: string;
  timeRange: TimeRange;
  staffs: StaffType[];
};

type UseDragReturn = {
  dragState: DragState;
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent, staffId: string, containerRect: DOMRect) => void;
  handleMouseMove: (e: React.MouseEvent, containerRect: DOMRect) => void;
  handleMouseUp: () => void;
  getCursor: (staffId: string, x: number, containerWidth: number) => string;
};

const initialDragState: DragState = {
  mode: null,
  staffId: null,
  startMinutes: 0,
  currentMinutes: 0,
  targetShiftId: null,
  targetPositionId: null,
  positionColor: null,
  resizeEdge: null,
};

export const useDrag = ({
  shifts,
  setShifts,
  selectedPosition,
  selectedDate,
  timeRange,
  staffs,
}: UseDragParams): UseDragReturn => {
  const [dragState, setDragState] = useState<DragState>(initialDragState);
  const idCounterRef = useRef(0);

  const generateId = useCallback(() => {
    idCounterRef.current += 1;
    return `shift-${Date.now()}-${idCounterRef.current}`;
  }, []);

  const isDragging = dragState.mode !== null;

  // === ドラッグ開始 ===
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, staffId: string, containerRect: DOMRect) => {
      // 未提出スタッフはドラッグ不可
      const staff = staffs.find((s) => s.id === staffId);
      if (!staff?.isSubmitted) return;

      const x = e.clientX - containerRect.left;
      const containerWidth = containerRect.width;
      const minutes = pixelToMinutes({ x, containerWidth, timeRange });

      // 1. ポジション選択中 → 塗りモード
      if (selectedPosition) {
        const targetShift = findShiftAtPosition({
          shifts,
          staffId,
          date: selectedDate,
          minutes,
        });

        if (targetShift) {
          setDragState({
            mode: "paint",
            staffId,
            startMinutes: minutes,
            currentMinutes: minutes,
            targetShiftId: targetShift.id,
            targetPositionId: null,
            positionColor: selectedPosition.color,
            resizeEdge: null,
          });
          return;
        }
      }

      // 2. ポジションバー端 → ポジションリサイズモード
      const positionResizeInfo = detectPositionResizeEdge({
        shifts,
        staffId,
        date: selectedDate,
        x,
        containerWidth,
        timeRange,
        threshold: RESIZE_EDGE_THRESHOLD,
      });

      if (positionResizeInfo) {
        setDragState({
          mode: positionResizeInfo.edge === "start" ? "position-resize-start" : "position-resize-end",
          staffId,
          startMinutes: minutes,
          currentMinutes: minutes,
          targetShiftId: positionResizeInfo.shiftId,
          targetPositionId: positionResizeInfo.positionId,
          positionColor: positionResizeInfo.positionColor,
          resizeEdge: positionResizeInfo.edge,
        });
        return;
      }

      // 3. 労働時間バー端 → リサイズモード
      const resizeInfo = detectResizeEdge({
        shifts,
        staffId,
        date: selectedDate,
        x,
        containerWidth,
        timeRange,
        threshold: RESIZE_EDGE_THRESHOLD,
      });

      if (resizeInfo) {
        setDragState({
          mode: resizeInfo.edge === "start" ? "resize-start" : "resize-end",
          staffId,
          startMinutes: minutes,
          currentMinutes: minutes,
          targetShiftId: resizeInfo.shiftId,
          targetPositionId: null,
          positionColor: null,
          resizeEdge: resizeInfo.edge,
        });
        return;
      }

      // 4. 空白エリア → 作成モード
      const existingShift = findShiftAtPosition({
        shifts,
        staffId,
        date: selectedDate,
        minutes,
      });

      if (!existingShift) {
        setDragState({
          mode: "create",
          staffId,
          startMinutes: minutes,
          currentMinutes: minutes,
          targetShiftId: null,
          targetPositionId: null,
          positionColor: null,
          resizeEdge: null,
        });
      }
    },
    [shifts, selectedPosition, selectedDate, timeRange, staffs],
  );

  // === ドラッグ中 ===
  const handleMouseMove = useCallback(
    (e: React.MouseEvent, containerRect: DOMRect) => {
      if (!dragState.mode) return;

      const x = e.clientX - containerRect.left;
      const containerWidth = containerRect.width;
      const minutes = pixelToMinutes({ x, containerWidth, timeRange });

      setDragState((prev) => ({
        ...prev,
        currentMinutes: minutes,
      }));
    },
    [dragState.mode, timeRange],
  );

  // === ドラッグ終了 ===
  const handleMouseUp = useCallback(() => {
    if (!dragState.mode || !dragState.staffId) {
      setDragState(initialDragState);
      return;
    }

    const { mode, staffId, startMinutes, currentMinutes, targetShiftId, targetPositionId, resizeEdge } = dragState;

    // 1. 作成モード
    if (mode === "create") {
      const staff = staffs.find((s) => s.id === staffId);
      if (staff && Math.abs(currentMinutes - startMinutes) >= timeRange.unit) {
        const newShift = createShift({
          id: generateId(),
          staffId,
          staffName: staff.name,
          date: selectedDate,
          startMinutes,
          endMinutes: currentMinutes,
        });

        const updatedShifts = [...shifts, newShift];
        const mergedShifts = mergeOverlappingShifts({
          shifts: updatedShifts,
          staffId,
          date: selectedDate,
        });
        setShifts(mergedShifts);
      }
    }

    // 2. 労働時間リサイズモード
    if ((mode === "resize-start" || mode === "resize-end") && targetShiftId && resizeEdge) {
      const targetShift = shifts.find((s) => s.id === targetShiftId);
      if (targetShift) {
        const resizedShift = resizeShift({
          shift: targetShift,
          edge: resizeEdge,
          newMinutes: currentMinutes,
          minDuration: MIN_SHIFT_DURATION_MINUTES,
        });

        const updatedShifts = shifts.map((s) => (s.id === targetShiftId ? resizedShift : s));
        const mergedShifts = mergeOverlappingShifts({
          shifts: updatedShifts,
          staffId,
          date: selectedDate,
        });
        setShifts(mergedShifts);
      }
    }

    // 3. ポジションリサイズモード
    if (
      (mode === "position-resize-start" || mode === "position-resize-end") &&
      targetShiftId &&
      targetPositionId &&
      resizeEdge
    ) {
      const targetShift = shifts.find((s) => s.id === targetShiftId);
      if (targetShift) {
        const resizedShift = resizePosition({
          shift: targetShift,
          positionId: targetPositionId,
          edge: resizeEdge,
          newMinutes: currentMinutes,
          minDuration: MIN_SHIFT_DURATION_MINUTES,
        });

        const updatedShifts = shifts.map((s) => (s.id === targetShiftId ? resizedShift : s));
        const mergedShifts = mergeOverlappingShifts({
          shifts: updatedShifts,
          staffId,
          date: selectedDate,
        });
        setShifts(mergedShifts);
      }
    }

    // 4. 塗りモード
    if (mode === "paint" && targetShiftId && selectedPosition) {
      const targetShift = shifts.find((s) => s.id === targetShiftId);
      if (targetShift && Math.abs(currentMinutes - startMinutes) >= timeRange.unit) {
        const paintedShift = paintPosition({
          shift: targetShift,
          positionId: selectedPosition.id,
          positionName: selectedPosition.name,
          positionColor: selectedPosition.color,
          startMinutes,
          endMinutes: currentMinutes,
          segmentId: generateId(),
        });

        const updatedShifts = shifts.map((s) => (s.id === targetShiftId ? paintedShift : s));
        setShifts(updatedShifts);
      }
    }

    setDragState(initialDragState);
  }, [dragState, shifts, setShifts, selectedPosition, selectedDate, timeRange, staffs, generateId]);

  // === カーソル判定 ===
  const getCursor = useCallback(
    (staffId: string, x: number, containerWidth: number): string => {
      // 未提出スタッフはデフォルトカーソル
      const staff = staffs.find((s) => s.id === staffId);
      if (!staff?.isSubmitted) return "default";

      if (isDragging) {
        if (
          dragState.mode === "resize-start" ||
          dragState.mode === "resize-end" ||
          dragState.mode === "position-resize-start" ||
          dragState.mode === "position-resize-end"
        ) {
          return "ew-resize";
        }
        return "crosshair";
      }

      // ポジションバー端（労働時間バー端より優先）
      const positionResizeInfo = detectPositionResizeEdge({
        shifts,
        staffId,
        date: selectedDate,
        x,
        containerWidth,
        timeRange,
        threshold: RESIZE_EDGE_THRESHOLD,
      });

      if (positionResizeInfo) {
        return "ew-resize";
      }

      // 労働時間バー端
      const resizeInfo = detectResizeEdge({
        shifts,
        staffId,
        date: selectedDate,
        x,
        containerWidth,
        timeRange,
        threshold: RESIZE_EDGE_THRESHOLD,
      });

      if (resizeInfo) {
        return "ew-resize";
      }

      // ポジション選択中 → crosshair
      if (selectedPosition) {
        return "crosshair";
      }

      return "default";
    },
    [isDragging, dragState.mode, shifts, selectedDate, timeRange, selectedPosition, staffs],
  );

  return {
    dragState,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    getCursor,
  };
};
