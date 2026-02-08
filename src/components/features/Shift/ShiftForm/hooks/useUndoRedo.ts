import { useAtomValue, useSetAtom } from "jotai";
import { canRedoAtom, canUndoAtom, redoAtom, shiftsAtom, undoAtom } from "../stores";
import type { ShiftData } from "../types";

type UseUndoRedoReturn = {
  shifts: ShiftData[];
  setShifts: (newShifts: ShiftData[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

// atom ベースの undo/redo ラッパー
// 既存の useUndoRedo (useState ベース) と同じインターフェースを提供
export const useUndoRedo = (): UseUndoRedoReturn => {
  const shifts = useAtomValue(shiftsAtom);
  const setShifts = useSetAtom(shiftsAtom);
  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const canRedo = useAtomValue(canRedoAtom);

  return {
    shifts,
    setShifts,
    undo,
    redo,
    canUndo,
    canRedo,
  };
};
