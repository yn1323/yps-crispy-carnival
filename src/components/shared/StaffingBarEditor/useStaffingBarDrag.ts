import { useCallback, useEffect, useRef, useState } from "react";

// 必要人数のバーの表で、バーを引くドラッグと、端を動かすドラッグの進行を持つ。
// ドラッグしている間だけdocumentへlistenerを登録し、表の外へポインタが出ても続きを受け取る。
// 確定はmouseupのときで、それまでは currentMinutes を動かしてプレビューに使う。

export type StaffingBarDrag =
  | {
      kind: "create";
      positionId: string;
      /** ドラッグを始めた行。プレビューはこの行に出す。 */
      rowIndex: number;
      /** ドラッグを始めた時刻（分） */
      anchorMinutes: number;
      currentMinutes: number;
    }
  | {
      kind: "resize";
      positionId: string;
      barId: string;
      edge: "start" | "end";
      currentMinutes: number;
    };

type UseStaffingBarDragParams = {
  /** ポインタの横位置（clientX）と、ドラッグを始めた時間の軸の矩形から、刻みへ寄せた時刻（分）を返す。 */
  toMinutes: (clientX: number, trackRect: DOMRect) => number;
  /** mouseupで呼ぶ。最後の位置を持つドラッグを渡す。 */
  onCommit: (drag: StaffingBarDrag) => void;
};

export const useStaffingBarDrag = ({ toMinutes, onCommit }: UseStaffingBarDragParams) => {
  const [drag, setDrag] = useState<StaffingBarDrag | null>(null);
  const dragRef = useRef<StaffingBarDrag | null>(null);
  const trackRectRef = useRef<DOMRect | null>(null);
  const toMinutesRef = useRef(toMinutes);
  const onCommitRef = useRef(onCommit);

  // listenerを登録し直さずに、最新の座標計算と確定処理を使う。
  useEffect(() => {
    toMinutesRef.current = toMinutes;
    onCommitRef.current = onCommit;
  }, [toMinutes, onCommit]);

  const commitDrag = useCallback((next: StaffingBarDrag | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const startDrag = useCallback(
    (next: StaffingBarDrag, trackRect: DOMRect) => {
      trackRectRef.current = trackRect;
      commitDrag(next);
    },
    [commitDrag],
  );

  const isDragging = drag !== null;

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      const current = dragRef.current;
      const trackRect = trackRectRef.current;
      if (!current || !trackRect) return;
      const minutes = toMinutesRef.current(event.clientX, trackRect);
      if (minutes === current.currentMinutes) return;
      commitDrag({ ...current, currentMinutes: minutes });
    };
    const handleMouseUp = () => {
      const current = dragRef.current;
      commitDrag(null);
      trackRectRef.current = null;
      if (current) onCommitRef.current(current);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, commitDrag]);

  return { drag, startDrag };
};
