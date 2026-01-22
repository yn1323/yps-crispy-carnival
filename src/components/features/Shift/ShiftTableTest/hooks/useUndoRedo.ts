import { useCallback, useState } from "react";
import type { ShiftData } from "../types";

const MAX_HISTORY = 50;

type HistoryState = {
  past: ShiftData[][];
  present: ShiftData[];
  future: ShiftData[][];
};

type UseUndoRedoReturn = {
  state: ShiftData[];
  set: (newState: ShiftData[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (initialState: ShiftData[]) => void;
};

export const useUndoRedo = (initialState: ShiftData[]): UseUndoRedoReturn => {
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: initialState,
    future: [],
  });

  // 新しい状態をセット（履歴に追加）
  const set = useCallback((newState: ShiftData[]) => {
    setHistory((prev) => {
      const newPast = [...prev.past, prev.present];
      if (newPast.length > MAX_HISTORY) {
        newPast.shift();
      }
      return {
        past: newPast,
        present: newState,
        future: [],
      };
    });
  }, []);

  // Undo実行
  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const newPast = prev.past.slice(0, -1);
      const newPresent = prev.past[prev.past.length - 1];
      return {
        past: newPast,
        present: newPresent,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  // Redo実行
  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const newPresent = prev.future[0];
      const newFuture = prev.future.slice(1);
      return {
        past: [...prev.past, prev.present],
        present: newPresent,
        future: newFuture,
      };
    });
  }, []);

  // リセット
  const reset = useCallback((initialState: ShiftData[]) => {
    setHistory({
      past: [],
      present: initialState,
      future: [],
    });
  }, []);

  return {
    state: history.present,
    set,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    reset,
  };
};
