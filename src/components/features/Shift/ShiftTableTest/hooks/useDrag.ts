import { useCallback, useRef, useState } from "react";
import { MIN_SHIFT_DURATION_MINUTES, RESIZE_EDGE_THRESHOLD } from "../constants";
import type { DragMode, LinkedResizeTarget, PositionType, ShiftData, TimeRange } from "../types";
import {
  detectLinkedResizeEdge,
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
  isEraserMode: boolean;
  selectedDate: string;
  timeRange: TimeRange;
  getStaffName: (staffId: string) => string;
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
  linkedTarget: null,
};

export const useDrag = ({
  shifts,
  setShifts,
  selectedPosition,
  isEraserMode,
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

  // === ドラッグ開始 ===
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, staffId: string, containerRect: DOMRect) => {
      const x = e.clientX - containerRect.left;
      const containerWidth = containerRect.width;
      const minutes = pixelToMinutes({ x, containerWidth, timeRange });

      // 消しゴムモード時はドラッグ操作なし（クリック削除はindex.tsxで処理）
      if (isEraserMode) {
        return;
      }

      // 1. ポジションバー端 → ポジションリサイズモード（連結リサイズ対応）
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
        // 連結リサイズか単独リサイズかを判定
        const isLinked = linkedTarget.prevPosition && linkedTarget.nextPosition;
        // 単独リサイズの場合、どちらの端かを判定
        const edge = linkedTarget.nextPosition && !linkedTarget.prevPosition ? "start" : "end";
        const targetPositionId = linkedTarget.prevPosition?.positionId ?? linkedTarget.nextPosition?.positionId ?? null;
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
        return;
      }

      // 3. ポジション選択中 → 塗りモード
      if (selectedPosition) {
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
            requestedTime: null, // 未提出者なのでnull
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
        return;
      }

      // 希望シフトバーは編集不可のため、それ以外の操作（create, resize）は削除
    },
    [shifts, setShifts, selectedPosition, isEraserMode, selectedDate, timeRange, generateId, getStaffName],
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
        // 連結リサイズを使用
        const resizedShift = resizeLinkedPositions({
          shift: targetShift,
          linkedTarget,
          newMinutes: currentMinutes,
          minDuration: MIN_SHIFT_DURATION_MINUTES,
        });

        const updatedShifts = shifts.map((s) => (s.id === targetShiftId ? resizedShift : s));
        setShifts(updatedShifts);
      } else if (targetShift && targetPositionId && resizeEdge) {
        // 従来の単独リサイズ（フォールバック）
        const resizedShift = resizePosition({
          shift: targetShift,
          positionId: targetPositionId,
          edge: resizeEdge,
          newMinutes: currentMinutes,
          minDuration: MIN_SHIFT_DURATION_MINUTES,
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

    // 消しゴムモードはクリック削除に変更（index.tsxで処理）

    setDragState(initialDragState);
  }, [dragState, shifts, setShifts, selectedPosition, timeRange, generateId]);

  // === カーソル判定 ===
  const getCursor = useCallback(
    (staffId: string, x: number, containerWidth: number): string => {
      if (isDragging) {
        if (dragState.mode === "position-resize-start" || dragState.mode === "position-resize-end") {
          return "ew-resize";
        }
        if (dragState.mode === "erase") {
          return "crosshair";
        }
        return "crosshair";
      }

      // 消しゴムモード → crosshair（ポジションバー上）
      if (isEraserMode) {
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

      // ポジションバー端
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

      // ポジション選択中 → crosshair
      if (selectedPosition) {
        return "crosshair";
      }

      return "default";
    },
    [isDragging, dragState.mode, shifts, selectedDate, timeRange, selectedPosition, isEraserMode],
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
