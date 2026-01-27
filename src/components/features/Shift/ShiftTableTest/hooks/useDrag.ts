import { useCallback, useRef, useState } from "react";
import { RESIZE_EDGE_THRESHOLD } from "../constants";
import type { DragMode, LinkedResizeTarget, PositionType, ShiftData, TimeRange, ToolMode } from "../types";
import {
  detectLinkedResizeEdge,
  erasePosition,
  findPositionAtPosition,
  findShiftAtPosition,
  paintPosition,
  pixelToMinutes,
  resizeLinkedPositions,
  resizePosition,
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
  linkedTarget: LinkedResizeTarget | null;
};

type UseDragParams = {
  shifts: ShiftData[];
  setShifts: (shifts: ShiftData[]) => void;
  selectedPosition: PositionType | null;
  toolMode: ToolMode;
  selectedDate: string;
  timeRange: TimeRange;
  getStaffName: (staffId: string) => string;
};

type UseDragReturn = {
  dragState: DragState;
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent, staffId: string, containerRect: DOMRect) => boolean;
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
  linkedTarget: null,
};

export const useDrag = ({
  shifts,
  setShifts,
  selectedPosition,
  toolMode,
  selectedDate,
  timeRange,
  getStaffName,
}: UseDragParams): UseDragReturn => {
  const [dragState, setDragState] = useState<DragState>(initialDragState);
  const idCounterRef = useRef(0);

  const generateId = useCallback(() => {
    idCounterRef.current += 1;
    return `segment-${Date.now()}-${idCounterRef.current}`;
  }, []);

  const isDragging = dragState.mode !== null;

  // === ドラッグ開始（戻り値: ドラッグ開始したか） ===
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, staffId: string, containerRect: DOMRect): boolean => {
      const x = e.clientX - containerRect.left;
      const containerWidth = containerRect.width;
      const minutes = pixelToMinutes({ x, containerWidth, timeRange });

      // === 選択モード: リサイズのみ ===
      if (toolMode === "select") {
        const linkedResizeInfo = detectLinkedResizeEdge({
          shifts,
          staffId,
          date: selectedDate,
          x,
          containerWidth,
          timeRange,
          threshold: RESIZE_EDGE_THRESHOLD,
        });

        if (linkedResizeInfo) {
          const { linkedTarget } = linkedResizeInfo;
          const isLinked = linkedTarget.prevPosition && linkedTarget.nextPosition;
          const edge = linkedTarget.nextPosition && !linkedTarget.prevPosition ? "start" : "end";
          const targetPositionId =
            linkedTarget.prevPosition?.positionId ?? linkedTarget.nextPosition?.positionId ?? null;
          const positionColor =
            linkedTarget.prevPosition?.positionColor ?? linkedTarget.nextPosition?.positionColor ?? null;

          setDragState({
            mode: isLinked ? "position-resize-end" : edge === "start" ? "position-resize-start" : "position-resize-end",
            staffId,
            startMinutes: minutes,
            currentMinutes: minutes,
            targetShiftId: linkedResizeInfo.shiftId,
            targetPositionId,
            positionColor,
            resizeEdge: edge,
            linkedTarget,
          });
          return true;
        }
        // リサイズ端でなければドラッグなし（スクロールはindex.tsx側で処理）
        return false;
      }

      // === 割当モード: リサイズ or 塗り ===
      if (toolMode === "assign") {
        // まずリサイズエッジを判定（既存バーの端をドラッグした場合）
        const linkedResizeInfo = detectLinkedResizeEdge({
          shifts,
          staffId,
          date: selectedDate,
          x,
          containerWidth,
          timeRange,
          threshold: RESIZE_EDGE_THRESHOLD,
        });

        if (linkedResizeInfo) {
          const { linkedTarget } = linkedResizeInfo;
          const isLinked = linkedTarget.prevPosition && linkedTarget.nextPosition;
          const edge = linkedTarget.nextPosition && !linkedTarget.prevPosition ? "start" : "end";
          const targetPositionId =
            linkedTarget.prevPosition?.positionId ?? linkedTarget.nextPosition?.positionId ?? null;
          const positionColor =
            linkedTarget.prevPosition?.positionColor ?? linkedTarget.nextPosition?.positionColor ?? null;

          setDragState({
            mode: isLinked ? "position-resize-end" : edge === "start" ? "position-resize-start" : "position-resize-end",
            staffId,
            startMinutes: minutes,
            currentMinutes: minutes,
            targetShiftId: linkedResizeInfo.shiftId,
            targetPositionId,
            positionColor,
            resizeEdge: edge,
            linkedTarget,
          });
          return true;
        }

        // リサイズエッジでなければ塗りモード
        if (!selectedPosition) return false;

        let targetShift = findShiftAtPosition({
          shifts,
          staffId,
          date: selectedDate,
          minutes,
        });

        // シフトがなければ新規作成（未提出者対応）
        if (!targetShift) {
          const newShiftId = generateId();
          const newShift: ShiftData = {
            id: newShiftId,
            staffId,
            staffName: getStaffName(staffId),
            date: selectedDate,
            requestedTime: null,
            positions: [],
          };
          setShifts([...shifts, newShift]);
          targetShift = newShift;
        }

        setDragState({
          mode: "paint",
          staffId,
          startMinutes: minutes,
          currentMinutes: minutes,
          targetShiftId: targetShift.id,
          targetPositionId: null,
          positionColor: selectedPosition.color,
          resizeEdge: null,
          linkedTarget: null,
        });
        return true;
      }

      // === 消すモード: ドラッグ消去 ===
      if (toolMode === "erase") {
        const positionInfo = findPositionAtPosition({
          shifts,
          staffId,
          date: selectedDate,
          minutes,
        });

        if (positionInfo) {
          setDragState({
            mode: "erase",
            staffId,
            startMinutes: minutes,
            currentMinutes: minutes,
            targetShiftId: positionInfo.shiftId,
            targetPositionId: positionInfo.positionId,
            positionColor: null,
            resizeEdge: null,
            linkedTarget: null,
          });
          return true;
        }
        return false;
      }

      return false;
    },
    [shifts, setShifts, selectedPosition, toolMode, selectedDate, timeRange, generateId, getStaffName],
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

    const { mode, startMinutes, currentMinutes, targetShiftId, targetPositionId, resizeEdge, linkedTarget } = dragState;

    // 1. ポジションリサイズモード（連結リサイズ対応）
    if ((mode === "position-resize-start" || mode === "position-resize-end") && targetShiftId) {
      const targetShift = shifts.find((s) => s.id === targetShiftId);
      if (targetShift && linkedTarget) {
        const resizedShift = resizeLinkedPositions({
          shift: targetShift,
          linkedTarget,
          newMinutes: currentMinutes,
          minDuration: timeRange.unit,
        });

        const updatedShifts = shifts.map((s) => (s.id === targetShiftId ? resizedShift : s));
        setShifts(updatedShifts);
      } else if (targetShift && targetPositionId && resizeEdge) {
        const resizedShift = resizePosition({
          shift: targetShift,
          positionId: targetPositionId,
          edge: resizeEdge,
          newMinutes: currentMinutes,
          minDuration: timeRange.unit,
        });

        const updatedShifts = shifts.map((s) => (s.id === targetShiftId ? resizedShift : s));
        setShifts(updatedShifts);
      }
    }

    // 2. 塗りモード
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

    // 3. 消去モード（ドラッグ範囲消去）
    if (mode === "erase" && dragState.staffId) {
      const staffShifts = shifts.filter((s) => s.staffId === dragState.staffId && s.date === selectedDate);
      let updatedShifts = [...shifts];

      for (const staffShift of staffShifts) {
        const erasedShift = erasePosition({
          shift: staffShift,
          startMinutes,
          endMinutes: currentMinutes,
        });
        updatedShifts = updatedShifts.map((s) => (s.id === staffShift.id ? erasedShift : s));
      }
      setShifts(updatedShifts);
    }

    setDragState(initialDragState);
  }, [dragState, shifts, setShifts, selectedPosition, selectedDate, timeRange, generateId]);

  // === カーソル判定 ===
  const getCursor = useCallback(
    (staffId: string, x: number, containerWidth: number): string => {
      // ドラッグ中
      if (isDragging) {
        if (dragState.mode === "position-resize-start" || dragState.mode === "position-resize-end") {
          return "ew-resize";
        }
        if (dragState.mode === "erase" || dragState.mode === "paint") {
          return "crosshair";
        }
        return "default";
      }

      // 選択モード
      if (toolMode === "select") {
        const linkedResizeInfo = detectLinkedResizeEdge({
          shifts,
          staffId,
          date: selectedDate,
          x,
          containerWidth,
          timeRange,
          threshold: RESIZE_EDGE_THRESHOLD,
        });
        if (linkedResizeInfo) {
          return "ew-resize";
        }
        return "grab";
      }

      // 割当モード
      if (toolMode === "assign") {
        const linkedResizeInfo = detectLinkedResizeEdge({
          shifts,
          staffId,
          date: selectedDate,
          x,
          containerWidth,
          timeRange,
          threshold: RESIZE_EDGE_THRESHOLD,
        });
        if (linkedResizeInfo) {
          return "ew-resize";
        }
        if (selectedPosition) {
          return "crosshair";
        }
        return "default";
      }

      // 消すモード
      if (toolMode === "erase") {
        const minutes = pixelToMinutes({ x, containerWidth, timeRange });
        const positionInfo = findPositionAtPosition({
          shifts,
          staffId,
          date: selectedDate,
          minutes,
        });
        if (positionInfo) {
          return "crosshair";
        }
        return "default";
      }

      return "default";
    },
    [isDragging, dragState.mode, shifts, selectedDate, timeRange, selectedPosition, toolMode],
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
