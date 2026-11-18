import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { SHIFT_ASSIGNMENT_BREAK_LIMIT } from "@/convex/constants";
import {
  isWithinEditableRange,
  pixelToEditableMinutes,
  pixelToRawMinutes,
} from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import { toaster } from "@/src/components/ui/toaster";
import { applyBreakRange, BREAK_TIME_UNIT_MINUTES, removeBreakAt } from "@/src/domains/shift/breaks";
import {
  mergeAdjacentPositions,
  paintPosition,
  resizeLinkedPositions,
  resizePosition,
  resolveDefaultPosition,
} from "@/src/domains/shift/operations";
import { isCanonicalWorkPosition } from "@/src/domains/shift/positions";
import { minutesToTime, timeToMinutes } from "@/src/domains/shift/time";
import type { DragMode, LinkedResizeTarget, ShiftData } from "@/src/domains/shift/types";
import { RESIZE_EDGE_THRESHOLD } from "../../../constants";
import { detectLinkedResizeEdge } from "../../../hitTesting";
import {
  breakEditorTargetAtom,
  hourWidthAtom,
  isBreakToolActiveAtom,
  selectedDateAtom,
  selectedPositionAtom,
  setShiftBreaksAtom,
  shiftByStaffIdForSelectedDateAtom,
  shiftConfigAtom,
  updateShiftDraftsAtom,
} from "../../../stores";

type DragState = {
  mode: DragMode;
  staffId: string | null;
  startMinutes: number;
  currentMinutes: number;
  // 押した位置の時刻（刻みにそろえる前）。休憩を選んでいる間に、押した休憩を見つけるために使う。
  pressMinutes: number;
  targetShiftId: string | null;
  targetPositionId: string | null;
  positionColor: string | null;
  resizeEdge: "start" | "end" | null;
  linkedTarget: LinkedResizeTarget | null;
};

const BREAK_LIMIT_MESSAGE = `休憩は${SHIFT_ASSIGNMENT_BREAK_LIMIT}件まで入れられます`;

const isInsideWork = (shift: ShiftData, minutes: number): boolean =>
  shift.positions
    .filter(isCanonicalWorkPosition)
    .some((position) => timeToMinutes(position.start) <= minutes && minutes < timeToMinutes(position.end));

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
  pressMinutes: 0,
  targetShiftId: null,
  targetPositionId: null,
  positionColor: null,
  resizeEdge: null,
  linkedTarget: null,
};

export const useDrag = (): UseDragReturn => {
  const setShifts = useSetAtom(updateShiftDraftsAtom);
  const setShiftBreaks = useSetAtom(setShiftBreaksAtom);
  const setBreakEditorTarget = useSetAtom(breakEditorTargetAtom);
  const isBreakToolActive = useAtomValue(isBreakToolActiveAtom);
  const shiftByStaffId = useAtomValue(shiftByStaffIdForSelectedDateAtom);
  const selectedPosition = useAtomValue(selectedPositionAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const config = useAtomValue(shiftConfigAtom);
  const hourWidth = useAtomValue(hourWidthAtom);
  const timeRange = config.timeRange;
  const getStaffName = useCallback(
    (staffId: string) => config.staffs.find((s) => s.id === staffId)?.name ?? "",
    [config.staffs],
  );

  const [dragState, setDragState] = useState<DragState>(initialDragState);
  const dragStateRef = useRef<DragState>(initialDragState);
  const shiftByStaffIdRef = useRef(shiftByStaffId);
  const idCounterRef = useRef(0);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    shiftByStaffIdRef.current = shiftByStaffId;
  }, [shiftByStaffId]);

  const commitDragState = useCallback((nextState: DragState) => {
    dragStateRef.current = nextState;
    setDragState(nextState);
  }, []);

  const generateId = useCallback(() => {
    idCounterRef.current += 1;
    return `segment-${Date.now()}-${idCounterRef.current}`;
  }, []);

  const isDragging = dragState.mode !== null;

  // === リサイズ検出ヘルパー（重複排除用） ===
  const tryDetectResize = useCallback(
    (staffId: string, x: number, minutes: number): boolean => {
      const targetShift = shiftByStaffIdRef.current.get(staffId);
      const linkedResizeInfo = detectLinkedResizeEdge({
        shifts: targetShift ? [targetShift] : [],
        staffId,
        date: selectedDate,
        x,
        timeRange,
        threshold: RESIZE_EDGE_THRESHOLD,
        hourWidth,
      });

      if (linkedResizeInfo) {
        const { linkedTarget } = linkedResizeInfo;
        const isLinked = linkedTarget.prevPosition && linkedTarget.nextPosition;
        const edge = linkedTarget.nextPosition && !linkedTarget.prevPosition ? "start" : "end";
        const targetPositionId = linkedTarget.prevPosition?.positionId ?? linkedTarget.nextPosition?.positionId ?? null;
        const positionColor =
          linkedTarget.prevPosition?.positionColor ?? linkedTarget.nextPosition?.positionColor ?? null;

        commitDragState({
          mode: isLinked ? "position-resize-end" : edge === "start" ? "position-resize-start" : "position-resize-end",
          staffId,
          startMinutes: minutes,
          currentMinutes: minutes,
          pressMinutes: minutes,
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
    [selectedDate, timeRange, hourWidth, commitDragState],
  );

  // === ドラッグ開始（戻り値: ドラッグ開始したか） ===
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, staffId: string, containerRect: DOMRect): boolean => {
      const x = e.clientX - containerRect.left;
      const rawMinutes = pixelToRawMinutes({ x, timeRange, hourWidth });
      const minutes = pixelToEditableMinutes({ x, timeRange, hourWidth });

      // 休憩を選んでいる間は、勤務の上をなぞって休憩を入れる。勤務の外を押しても何も始めない。
      if (isBreakToolActive) {
        const shift = shiftByStaffIdRef.current.get(staffId);
        if (!shift || !isInsideWork(shift, rawMinutes)) return false;
        const breakMinutes = pixelToEditableMinutes({ x, timeRange, hourWidth, unit: BREAK_TIME_UNIT_MINUTES });
        commitDragState({
          ...initialDragState,
          mode: "break",
          staffId,
          startMinutes: breakMinutes,
          currentMinutes: breakMinutes,
          pressMinutes: rawMinutes,
          targetShiftId: shift.id,
        });
        return true;
      }

      // まずリサイズエッジを判定（既存バーの端をドラッグした場合）
      if (tryDetectResize(staffId, x, minutes)) return true;

      if (!isWithinEditableRange(rawMinutes, timeRange)) return false;

      // リサイズエッジでなければ塗りモード
      const position = selectedPosition ?? resolveDefaultPosition(config.positions);

      let targetShift = shiftByStaffIdRef.current.get(staffId) ?? null;

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
        setShifts((current) => [...current, newShift]);
        targetShift = newShift;
      }

      commitDragState({
        mode: "paint",
        staffId,
        startMinutes: minutes,
        currentMinutes: minutes,
        pressMinutes: rawMinutes,
        targetShiftId: targetShift.id,
        targetPositionId: null,
        positionColor: position.color,
        resizeEdge: null,
        linkedTarget: null,
      });
      return true;
    },
    [
      setShifts,
      selectedPosition,
      config.positions,
      selectedDate,
      timeRange,
      hourWidth,
      generateId,
      getStaffName,
      tryDetectResize,
      commitDragState,
      isBreakToolActive,
    ],
  );

  // === ドラッグ中 ===
  const handleMouseMove = useCallback(
    (e: React.MouseEvent, containerRect: DOMRect) => {
      if (!dragStateRef.current.mode) return;

      const x = e.clientX - containerRect.left;
      const unit = dragStateRef.current.mode === "break" ? BREAK_TIME_UNIT_MINUTES : undefined;
      const minutes = pixelToEditableMinutes({ x, timeRange, hourWidth, unit });

      setDragState((prev) => {
        if (prev.currentMinutes === minutes) return prev;
        const nextState = { ...prev, currentMinutes: minutes };
        dragStateRef.current = nextState;
        return nextState;
      });
    },
    [timeRange, hourWidth],
  );

  // === ドラッグ終了 ===
  const handleMouseUp = useCallback(() => {
    const currentDragState = dragStateRef.current;
    if (!currentDragState.mode || !currentDragState.staffId) {
      commitDragState(initialDragState);
      return;
    }

    const { mode, startMinutes, currentMinutes, targetShiftId, targetPositionId, resizeEdge, linkedTarget } =
      currentDragState;

    // 0. 休憩。なぞった範囲を休憩にする。動かさずに押した場合は、押した休憩を外し、休憩のない場所なら休憩の編集を開く。
    if (mode === "break") {
      const staffId = currentDragState.staffId;
      const shift = shiftByStaffIdRef.current.get(staffId);
      if (shift) {
        const isClick = Math.abs(currentMinutes - startMinutes) < BREAK_TIME_UNIT_MINUTES;
        if (isClick) {
          const remaining = removeBreakAt(shift, currentDragState.pressMinutes);
          if (remaining) setShiftBreaks({ staffId, date: selectedDate, breaks: remaining });
          else setBreakEditorTarget({ staffId, date: selectedDate });
        } else {
          // 勤務の頭かお尻をなぞった場合は、休憩を残さず勤務が短くなる。
          const applied = applyBreakRange(shift, {
            start: minutesToTime(Math.min(startMinutes, currentMinutes)),
            end: minutesToTime(Math.max(startMinutes, currentMinutes)),
          });
          if (applied && applied.breaks.length > SHIFT_ASSIGNMENT_BREAK_LIMIT) {
            toaster.create({ title: BREAK_LIMIT_MESSAGE, type: "info" });
          } else if (applied) {
            setShiftBreaks({ staffId, date: selectedDate, ...applied });
          }
        }
      }
      commitDragState(initialDragState);
      return;
    }

    // 1. ポジションリサイズモード（連結リサイズ対応）
    if ((mode === "position-resize-start" || mode === "position-resize-end") && targetShiftId) {
      setShifts((current) => {
        const targetShift = current.find((s) => s.id === targetShiftId);
        if (!targetShift) return current;

        if (linkedTarget) {
          const resizedShift = resizeLinkedPositions({
            shift: targetShift,
            linkedTarget,
            newMinutes: currentMinutes,
            minDuration: timeRange.unit,
          });
          const mergedShift = { ...resizedShift, positions: mergeAdjacentPositions(resizedShift.positions) };
          return current.map((s) => (s.id === targetShiftId ? mergedShift : s));
        }

        if (targetPositionId && resizeEdge) {
          const resizedShift = resizePosition({
            shift: targetShift,
            positionId: targetPositionId,
            edge: resizeEdge,
            newMinutes: currentMinutes,
            minDuration: timeRange.unit,
          });
          const mergedShift = { ...resizedShift, positions: mergeAdjacentPositions(resizedShift.positions) };
          return current.map((s) => (s.id === targetShiftId ? mergedShift : s));
        }

        return current;
      });
    }

    // 2. 塗りモード
    if (mode === "paint" && targetShiftId) {
      const position = selectedPosition ?? resolveDefaultPosition(config.positions);
      if (Math.abs(currentMinutes - startMinutes) >= timeRange.unit) {
        setShifts((current) => {
          const targetShift = current.find((s) => s.id === targetShiftId);
          if (!targetShift) return current;

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
          return current.map((s) => (s.id === targetShiftId ? mergedShift : s));
        });
      }
    }

    commitDragState(initialDragState);
  }, [
    setShifts,
    setShiftBreaks,
    setBreakEditorTarget,
    selectedDate,
    selectedPosition,
    config.positions,
    timeRange,
    generateId,
    commitDragState,
  ]);

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

      // 休憩を選んでいる間は、勤務の端をつかんでも長さを変えない。
      if (isBreakToolActive) return "default";

      // リサイズ端の検出
      const targetShift = shiftByStaffIdRef.current.get(staffId);
      const linkedResizeInfo = detectLinkedResizeEdge({
        shifts: targetShift ? [targetShift] : [],
        staffId,
        date: selectedDate,
        x,
        timeRange,
        threshold: RESIZE_EDGE_THRESHOLD,
        hourWidth,
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
    [isDragging, dragState.mode, selectedDate, timeRange, hourWidth, selectedPosition, isBreakToolActive],
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
