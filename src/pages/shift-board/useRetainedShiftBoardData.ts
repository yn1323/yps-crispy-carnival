import { useRef } from "react";

/** 日付再評価の再購読中だけ直前データを保ち、入力途中のシフト表をunmountさせない。 */
export function useRetainedShiftBoardData<T>(scopeKey: string, data: T | undefined): T | undefined {
  const settled = useRef<{ scopeKey: string; data: T } | null>(null);

  if (data !== undefined) {
    settled.current = { scopeKey, data };
    return data;
  }

  return settled.current?.scopeKey === scopeKey ? settled.current.data : undefined;
}
