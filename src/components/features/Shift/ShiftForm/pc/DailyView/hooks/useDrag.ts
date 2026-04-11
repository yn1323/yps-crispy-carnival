import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef, useState } from "react";
import { DEFAULT_POSITION, RESIZE_EDGE_THRESHOLD } from "../../../constants";
import { selectedDateAtom, selectedPositionAtom, shiftConfigAtom, shiftsAtom } from "../../../stores";
import type { DragMode, LinkedResizeTarget, ShiftData } from "../../../types";
import {
  detectLinkedResizeEdge,
  findShiftAtPosition,
  mergeAdjacentPositions,
  paintPosition,
  resizeLinkedPositions,
  resizePosition,
} from "../../../utils/shiftOperations";
import { pixelToMinutes } from "../../../utils/timeConversion";

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

type UseDragReturn = {
  dragState: DragState;
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent, staffId: string, containerRect: DOMRect) => boolean;
  handleMouseMove: (e: React.MouseEvent, containerRect: DOMRect) => void;
  handleMouseUp: () => void;
  getCursor: (staffId: string, x: number) => string;
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

export const useDrag = (): UseDragReturn => {
  const shifts = useAtomValue(shiftsAtom);
  const setShifts = useSetAtom(shiftsAtom);
  const selectedPosition = useAtomValue(selectedPositionAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const config = useAtomValue(shiftConfigAtom);
  const timeRange = config.timeRange;
  const getStaffName = useCallback(
    (staffId: string) => config.staffs.find((s) => s.id === staffId)?.name ?? "",
    [config.staffs],
  );

  const [dragState, setDragState] = useState<DragState>(initialDragState);
  const idCounterRef = useRef(0);

  const generateId = useCallback(() => {
    idCounterRef.current += 1;
    return `segment-${Date.now()}-${idCounterRef.current}`;
  }, []);

  const isDragging = dragState.mode !== null;

  // === リサイズ検出ヘルパー（重複排除用） ===
  const tryDetectResize = useCallback(
    (staffId: string, x: number, minutes: number): boolean => {
      const linkedResizeInfo = detectLinkedResizeEdge({
        shifts,
        staffId,
        date: selectedDate,
        x,
        timeRange,
        threshold: RESIZE_EDGE_THRESHOLD,
      });

      if (linkedResizeInfo) {
        const { linkedTarget } = linkedResizeInfo;
        const isLinked = linkedTarget.prevPosition && linkedTarget.nextPosition;
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
        return true;
      }
      return false;
    },
    [shifts, selectedDate, timeRange],
  );

  // === ドラッグ開始（戻り値: ドラッグ開始したか） ===
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, staffId: string, containerRect: DOMRect): boolean => {
      const x = e.clientX - containerRect.left;
      const minutes = pixelToMinutes({ x, timeRange });

      // まずリサイズエッジを判定（既存バーの端をドラッグした場合）
      if (tryDetectResize(staffId, x, minutes)) return true;

      // リサイズエッジでなければ塗りモード
      const position = selectedPosition ?? DEFAULT_POSITION;

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
        positionColor: position.color,
        resizeEdge: null,
        linkedTarget: null,
      });
      return true;
    },
    [shifts, setShifts, selectedPosition, selectedDate, timeRange, generateId, getStaffName, tryDetectResize],
  );

  // === ドラッグ中 ===
  const handleMouseMove = useCallback(
    (e: React.MouseEvent, containerRect: DOMRect) => {
      if (!dragState.mode) return;

      const x = e.clientX - containerRect.left;
      const minutes = pixelToMinutes({ x, timeRange });

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
        const mergedShift = { ...resizedShift, positions: mergeAdjacentPositions(resizedShift.positions) };
        const updatedShifts = shifts.map((s) => (s.id === targetShiftId ? mergedShift : s));
        setShifts(updatedShifts);
      } else if (targetShift && targetPositionId && resizeEdge) {
        const resizedShift = resizePosition({
          shift: targetShift,
          positionId: targetPositionId,
          edge: resizeEdge,
          newMinutes: currentMinutes,
          minDuration: timeRange.unit,
        });
        const mergedShift = { ...resizedShift, positions: mergeAdjacentPositions(resizedShift.positions) };
        const updatedShifts = shifts.map((s) => (s.id === targetShiftId ? mergedShift : s));
        setShifts(updatedShifts);
      }
    }

    // 2. 塗りモード
    if (mode === "paint" && targetShiftId) {
      const position = selectedPosition ?? DEFAULT_POSITION;
      const targetShift = shifts.find((s) => s.id === targetShiftId);
      if (targetShift && Math.abs(currentMinutes - startMinutes) >= timeRange.unit) {
        const paintedShift = paintPosition({
          shift: targetShift,
          positionId: position.id,
          positionName: position.name,
          positionColor: position.color,
          startMinutes,
          endMinutes: currentMinutes,
          segmentId: generateId(),
        });
        const mergedShift = { ...paintedShift, positions: mergeAdjacentPositions(paintedShift.positions) };
        const updatedShifts = shifts.map((s) => (s.id === targetShiftId ? mergedShift : s));
        setShifts(updatedShifts);
      }
    }

    setDragState(initialDragState);
  }, [dragState, shifts, setShifts, selectedPosition, timeRange, generateId]);

  // === カーソル判定 ===
  const getCursor = useCallback(
    (staffId: string, x: number): string => {
      // ドラッグ中
      if (isDragging) {
        if (dragState.mode === "position-resize-start" || dragState.mode === "position-resize-end") {
          return "ew-resize";
        }
        if (dragState.mode === "paint") {
          return "default";
        }
        return "default";
      }

      // リサイズ端の検出
      const linkedResizeInfo = detectLinkedResizeEdge({
        shifts,
        staffId,
        date: selectedDate,
        x,
        timeRange,
        threshold: RESIZE_EDGE_THRESHOLD,
      });
      if (linkedResizeInfo) {
        return "ew-resize";
      }

      // ポジション選択中
      if (selectedPosition) {
        return "default";
      }

      return "default";
    },
    [isDragging, dragState.mode, shifts, selectedDate, timeRange, selectedPosition],
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
