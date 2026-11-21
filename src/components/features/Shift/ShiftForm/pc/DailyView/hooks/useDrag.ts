import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isWithinEditableRange,
  pixelToEditableMinutes,
  pixelToRawMinutes,
} from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import { BREAK_TIME_UNIT_MINUTES, type MinuteRange, moveBreakEdge } from "@/src/domains/shift/breaks";
import {
  mergeAdjacentPositions,
  paintPosition,
  resizeLinkedPositions,
  resizePosition,
} from "@/src/domains/shift/operations";
import { closeGapsWithBreaks, findSelectionBoundsAt, findWorkSectionAt } from "@/src/domains/shift/rangeAssignment";
import type { DragMode, LinkedResizeTarget, ShiftData } from "@/src/domains/shift/types";
import { RESIZE_EDGE_THRESHOLD } from "../../../constants";
import { detectBreakResizeEdge, detectLinkedResizeEdge } from "../../../hitTesting";
import {
  assignShiftRangeAtom,
  hourWidthAtom,
  isBreakToolActiveAtom,
  nextWorkPositionAtom,
  selectedDateAtom,
  setShiftBreaksAtom,
  shiftByStaffIdForSelectedDateAtom,
  shiftConfigAtom,
  updateShiftDraftsAtom,
  usesPositionColorsAtom,
} from "../../../stores";

/** 勤務のバーの上で選んだ範囲。メニューでポジションか休憩を選ぶまで持つ。 */
export type RangeSelection = {
  staffId: string;
  shiftId: string;
  range: MinuteRange;
};

type DragState = {
  mode: DragMode;
  staffId: string | null;
  startMinutes: number;
  currentMinutes: number;
  // 押した位置の時刻（刻みにそろえる前）。動かさずに押したときに、押した区間を見つけるために使う。
  pressMinutes: number;
  // 範囲を選んでいる間と、休憩の端を動かしている間の、動かせる範囲。
  bounds: MinuteRange | null;
  // 端をつまんで動かしている休憩（動かす前の時刻）。
  targetBreak: MinuteRange | null;
  targetShiftId: string | null;
  targetPositionId: string | null;
  positionColor: string | null;
  resizeEdge: "start" | "end" | null;
  linkedTarget: LinkedResizeTarget | null;
};

type UseDragReturn = {
  dragState: DragState;
  isDragging: boolean;
  /** 選び終えた範囲。メニューを閉じるか、別の操作を始めるとnullに戻る。 */
  selection: RangeSelection | null;
  clearSelection: () => void;
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
  bounds: null,
  targetBreak: null,
  targetShiftId: null,
  targetPositionId: null,
  positionColor: null,
  resizeEdge: null,
  linkedTarget: null,
};

export const useDrag = (): UseDragReturn => {
  const setShifts = useSetAtom(updateShiftDraftsAtom);
  // 編集できる表示では、シンプルでもくわしくでも、勤務のバーの上で範囲を選び、その場のメニューでポジションか休憩を入れる。
  const isRangeSelectEnabled = !useAtomValue(shiftConfigAtom).isReadOnly;
  // 日付の見出しで「休憩」を選んでいる間は、勤務のバーの上をなぞった範囲が、メニューを開かずに休憩になる。
  const isBreakToolActive = useAtomValue(isBreakToolActiveAtom);
  const assignShiftRange = useSetAtom(assignShiftRangeAtom);
  const setShiftBreaks = useSetAtom(setShiftBreaksAtom);
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  const shiftByStaffId = useAtomValue(shiftByStaffIdForSelectedDateAtom);
  // 次に新しく入れる勤務のポジション。メニューで最後に選んだもので、選んでいなければ一覧の先頭。
  const nextWorkPosition = useAtomValue(nextWorkPositionAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const config = useAtomValue(shiftConfigAtom);
  const hourWidth = useAtomValue(hourWidthAtom);
  const timeRange = config.timeRange;
  const getStaffName = useCallback(
    (staffId: string) => config.staffs.find((s) => s.id === staffId)?.name ?? "",
    [config.staffs],
  );

  const [dragState, setDragState] = useState<DragState>(initialDragState);
  const [selection, setSelection] = useState<RangeSelection | null>(null);
  const clearSelection = useCallback(() => setSelection(null), []);
  const dragStateRef = useRef<DragState>(initialDragState);
  const shiftByStaffIdRef = useRef(shiftByStaffId);
  const idCounterRef = useRef(0);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    shiftByStaffIdRef.current = shiftByStaffId;
  }, [shiftByStaffId]);

  // 日付か表示を切り替えたら、選んだ範囲を持ち越さない。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 切り替えた時点で選択を外すため、値の変化だけを見る。
  useEffect(() => {
    setSelection(null);
  }, [selectedDate, isRangeSelectEnabled]);

  const commitDragState = useCallback((nextState: DragState) => {
    dragStateRef.current = nextState;
    setDragState(nextState);
  }, []);

  const generateId = useCallback(() => {
    idCounterRef.current += 1;
    return `segment-${Date.now()}-${idCounterRef.current}`;
  }, []);

  // 勤務を離して入れたり、長さを変えたりしてできた空きは、バーに休憩として出す。持ち方もそれに合わせ、時刻で入れた休憩に置き換える。
  const closeGaps = useCallback((shift: ShiftData) => closeGapsWithBreaks(shift, generateId()), [generateId]);

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
          bounds: null,
          targetBreak: null,
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

  // === 休憩の端の検出。休憩の開始か終了の近くを押したら、その端を動かす操作を始める ===
  const tryDetectBreakResize = useCallback(
    (staffId: string, x: number, rawMinutes: number): boolean => {
      const shift = shiftByStaffIdRef.current.get(staffId);
      if (!isRangeSelectEnabled || !shift) return false;
      const hit = detectBreakResizeEdge({ shift, x, timeRange, threshold: RESIZE_EDGE_THRESHOLD, hourWidth });
      const block = hit ? findSelectionBoundsAt(shift, hit.range.start) : null;
      if (!hit || !block) return false;

      // 動かす端は、ひと続きの勤務の開始より後、終了より前に収める。反対の端まで動かすと、休憩を削除する。
      const bounds =
        hit.edge === "start"
          ? { start: block.start + BREAK_TIME_UNIT_MINUTES, end: hit.range.end }
          : { start: hit.range.start, end: block.end - BREAK_TIME_UNIT_MINUTES };
      const edgeMinutes = hit.edge === "start" ? hit.range.start : hit.range.end;
      commitDragState({
        ...initialDragState,
        mode: hit.edge === "start" ? "break-resize-start" : "break-resize-end",
        staffId,
        startMinutes: edgeMinutes,
        currentMinutes: edgeMinutes,
        pressMinutes: rawMinutes,
        bounds,
        targetBreak: hit.range,
        targetShiftId: shift.id,
      });
      return true;
    },
    [isRangeSelectEnabled, timeRange, hourWidth, commitDragState],
  );

  // === ドラッグ開始（戻り値: ドラッグ開始したか） ===
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, staffId: string, containerRect: DOMRect): boolean => {
      const x = e.clientX - containerRect.left;
      const rawMinutes = pixelToRawMinutes({ x, timeRange, hourWidth });
      const minutes = pixelToEditableMinutes({ x, timeRange, hourWidth });

      // 別の操作を始めたら、選んでいた範囲は何も変えずに外す。
      setSelection(null);

      // 休憩はバーの上に重ねて出すため、休憩の端を先に判定する。
      if (tryDetectBreakResize(staffId, x, rawMinutes)) return true;

      // 次にリサイズエッジを判定（既存バーの端をドラッグした場合）。範囲選択より先に判定する。
      if (tryDetectResize(staffId, x, minutes)) return true;

      // 勤務のバーの内側を押したら、範囲選択を始める。休憩を選んでいる間は、休憩を入れる操作を始める。
      // 勤務の間の空きは休憩として見せているため、空きを押した場合も範囲選択を始める。
      const existingShift = shiftByStaffIdRef.current.get(staffId);
      const bounds = isRangeSelectEnabled && existingShift ? findSelectionBoundsAt(existingShift, rawMinutes) : null;
      if (existingShift && bounds) {
        const drawsBreak = isBreakToolActive && bounds.kind === "work";
        // 休憩は、勤務より細かい15分単位にそろえる。
        const snapped = drawsBreak
          ? pixelToEditableMinutes({ x, timeRange, hourWidth, unit: BREAK_TIME_UNIT_MINUTES })
          : minutes;
        const startMinutes = Math.max(bounds.start, Math.min(bounds.end, snapped));
        commitDragState({
          ...initialDragState,
          mode: drawsBreak ? "break" : "select",
          staffId,
          startMinutes,
          currentMinutes: startMinutes,
          pressMinutes: rawMinutes,
          bounds: { start: bounds.start, end: bounds.end },
          targetShiftId: existingShift.id,
        });
        return true;
      }

      // 休憩を選んでいる間は、勤務の外をなぞっても何も入れない。
      if (isBreakToolActive) return false;

      if (!isWithinEditableRange(rawMinutes, timeRange)) return false;

      // 空いている場所は塗りモード。新しい勤務は、次に入れるポジション（メニューで最後に選んだもの）で入れる。
      const position = nextWorkPosition;

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
        bounds: null,
        targetBreak: null,
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
      nextWorkPosition,
      selectedDate,
      timeRange,
      hourWidth,
      generateId,
      getStaffName,
      tryDetectResize,
      tryDetectBreakResize,
      commitDragState,
      isRangeSelectEnabled,
      isBreakToolActive,
    ],
  );

  // === ドラッグ中 ===
  const handleMouseMove = useCallback(
    (e: React.MouseEvent, containerRect: DOMRect) => {
      if (!dragStateRef.current.mode) return;

      const x = e.clientX - containerRect.left;
      const { bounds, mode } = dragStateRef.current;
      // 休憩を入れる操作と、休憩の端を動かす操作は、15分単位にそろえる。
      const unit =
        mode === "break" || mode === "break-resize-start" || mode === "break-resize-end"
          ? BREAK_TIME_UNIT_MINUTES
          : undefined;
      const editableMinutes = pixelToEditableMinutes({ x, timeRange, hourWidth, unit });
      const minutes = bounds ? Math.max(bounds.start, Math.min(bounds.end, editableMinutes)) : editableMinutes;

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

    // 休憩の端。動かした場合は、その休憩の開始か終了を変える。反対の端まで動かした場合は、休憩を削除する。
    // 動かさずに押した場合は、下の範囲選択と同じく休憩を選ぶ。
    const isBreakResize = mode === "break-resize-start" || mode === "break-resize-end";
    if (isBreakResize && currentMinutes !== startMinutes) {
      const staffId = currentDragState.staffId;
      const shift = shiftByStaffIdRef.current.get(staffId);
      const breaks =
        shift && currentDragState.targetBreak
          ? moveBreakEdge(
              shift,
              currentDragState.targetBreak,
              mode === "break-resize-start" ? "start" : "end",
              currentMinutes,
            )
          : null;
      if (breaks) setShiftBreaks({ staffId, date: selectedDate, breaks });
      commitDragState(initialDragState);
      return;
    }

    // 0. 範囲選択と休憩。動かさずに押した場合は、どちらも押した区間の全体を選び、メニューを開く。
    //    なぞった場合は、範囲選択ならその範囲を選び、休憩を選んでいる間はその範囲を休憩にする。
    if (mode === "select" || mode === "break" || isBreakResize) {
      const staffId = currentDragState.staffId;
      const shift = shiftByStaffIdRef.current.get(staffId);
      const unit = mode === "break" ? BREAK_TIME_UNIT_MINUTES : timeRange.unit;
      const isClick = Math.abs(currentMinutes - startMinutes) < unit;
      const dragged = { start: Math.min(startMinutes, currentMinutes), end: Math.max(startMinutes, currentMinutes) };
      if (shift && mode === "break" && !isClick) {
        assignShiftRange({
          shiftId: shift.id,
          range: dragged,
          assignment: { kind: "break" },
          segmentId: generateId(),
        });
      } else {
        // ポジションを塗り分けない表示では、ポジションの境目で区切らず、休憩までの勤務をまとめて選ぶ。
        const range =
          shift && isClick
            ? findWorkSectionAt(shift, currentDragState.pressMinutes, { mergesAcrossPositions: !usesPositionColors })
            : dragged;
        setSelection(
          shift && range ? { staffId, shiftId: shift.id, range: { start: range.start, end: range.end } } : null,
        );
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
          const mergedShift = closeGaps({ ...resizedShift, positions: mergeAdjacentPositions(resizedShift.positions) });
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
          const mergedShift = closeGaps({ ...resizedShift, positions: mergeAdjacentPositions(resizedShift.positions) });
          return current.map((s) => (s.id === targetShiftId ? mergedShift : s));
        }

        return current;
      });
    }

    // 2. 塗りモード
    if (mode === "paint" && targetShiftId) {
      const position = nextWorkPosition;
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
          const mergedShift = closeGaps({ ...paintedShift, positions: mergeAdjacentPositions(paintedShift.positions) });
          return current.map((s) => (s.id === targetShiftId ? mergedShift : s));
        });
      }
    }

    commitDragState(initialDragState);
  }, [
    setShifts,
    assignShiftRange,
    setShiftBreaks,
    selectedDate,
    nextWorkPosition,
    usesPositionColors,
    timeRange,
    generateId,
    closeGaps,
    commitDragState,
  ]);

  // === カーソル判定 ===
  const getCursor = useCallback(
    (staffId: string, x: number): string => {
      if (isDragging) {
        return dragState.mode === "position-resize-start" ||
          dragState.mode === "position-resize-end" ||
          dragState.mode === "break-resize-start" ||
          dragState.mode === "break-resize-end"
          ? "ew-resize"
          : "default";
      }

      // 休憩の端の検出
      const targetShift = shiftByStaffIdRef.current.get(staffId);
      if (
        isRangeSelectEnabled &&
        targetShift &&
        detectBreakResizeEdge({ shift: targetShift, x, timeRange, threshold: RESIZE_EDGE_THRESHOLD, hourWidth })
      ) {
        return "ew-resize";
      }

      // リサイズ端の検出
      const linkedResizeInfo = detectLinkedResizeEdge({
        shifts: targetShift ? [targetShift] : [],
        staffId,
        date: selectedDate,
        x,
        timeRange,
        threshold: RESIZE_EDGE_THRESHOLD,
        hourWidth,
      });
      if (linkedResizeInfo) return "ew-resize";

      // 範囲を選べる勤務の上では、押せることを示す。
      if (isRangeSelectEnabled && targetShift) {
        const rawMinutes = pixelToRawMinutes({ x, timeRange, hourWidth });
        if (findSelectionBoundsAt(targetShift, rawMinutes)) return "pointer";
      }
      return "default";
    },
    [isDragging, dragState.mode, selectedDate, timeRange, hourWidth, isRangeSelectEnabled],
  );

  return {
    dragState,
    isDragging,
    selection,
    clearSelection,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    getCursor,
  };
};
