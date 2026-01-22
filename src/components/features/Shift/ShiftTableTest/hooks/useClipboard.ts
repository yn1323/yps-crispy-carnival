import { useCallback, useState } from "react";
import type { ShiftData } from "../types";

type UseClipboardReturn = {
  clipboard: ShiftData | null;
  copy: (shift: ShiftData) => void;
  paste: (staffId: string, date: string) => ShiftData | null;
  clear: () => void;
  hasClipboard: boolean;
};

// IDを生成（簡易版）
const generateId = () => Math.random().toString(36).substring(2, 9);

export const useClipboard = (): UseClipboardReturn => {
  const [clipboard, setClipboard] = useState<ShiftData | null>(null);

  // シフトをコピー（IDは除外してテンプレートとして保存）
  const copy = useCallback((shift: ShiftData) => {
    setClipboard({
      ...shift,
      id: "", // ペースト時に新しいIDを付与
      positions: shift.positions.map((pos) => ({
        ...pos,
        id: "", // ペースト時に新しいIDを付与
      })),
    });
  }, []);

  // ペースト（新しいスタッフ・日付で新規シフト生成）
  const paste = useCallback(
    (staffId: string, date: string): ShiftData | null => {
      if (!clipboard) return null;

      return {
        ...clipboard,
        id: generateId(),
        staffId,
        date,
        positions: clipboard.positions.map((pos) => ({
          ...pos,
          id: generateId(),
        })),
      };
    },
    [clipboard],
  );

  // クリア
  const clear = useCallback(() => {
    setClipboard(null);
  }, []);

  return {
    clipboard,
    copy,
    paste,
    clear,
    hasClipboard: clipboard !== null,
  };
};
