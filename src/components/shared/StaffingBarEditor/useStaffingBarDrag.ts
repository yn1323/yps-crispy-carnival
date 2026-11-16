import { useCallback, useEffect, useRef, useState } from "react";

// 必要人数のバーの表で、バーを引くドラッグと、端を動かすドラッグの進行を持つ。
// マウス、指、ペンをPointer Eventsで同じように扱う。
// ドラッグしている間だけdocumentへlistenerを登録し、表の外へポインタが出ても続きを受け取る。
// 確定はpointerupのときで、それまでは currentMinutes を動かしてプレビューに使う。
// pointercancel（指の動きが画面のスクロールになった場合など）では、確定せずに捨てる。

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

/** ドラッグを始めたポインタと要素。 */
export type StaffingBarDragSource = {
  pointerId: number;
  /** 時間の軸の要素。ドラッグの途中で表が動いてもずれないよう、位置は動かすたびに読み直す。 */
  track: Pick<HTMLElement, "getBoundingClientRect">;
  /** ポインタを捕まえる要素。指やマウスが行の外へ出ても、続きを受け取る。 */
  captureTarget: Pick<HTMLElement, "setPointerCapture" | "hasPointerCapture" | "releasePointerCapture">;
};

type UseStaffingBarDragParams = {
  /** ポインタの横位置（clientX）と、時間の軸のいまの矩形から、刻みへ寄せた時刻（分）を返す。 */
  toMinutes: (clientX: number, trackRect: DOMRect) => number;
  /** pointerupで呼ぶ。最後の位置を持つドラッグを渡す。 */
  onCommit: (drag: StaffingBarDrag) => void;
};

const DRAG_EVENTS = ["pointermove", "pointerup", "pointercancel"] as const;

// 捕まえられないポインタ（すでに離れた指など）では例外になる。documentのlistenerで続きを受け取れるため、握りつぶす。
const capturePointer = (source: StaffingBarDragSource) => {
  try {
    source.captureTarget.setPointerCapture(source.pointerId);
  } catch {
    // 何もしない
  }
};

const releasePointer = (source: StaffingBarDragSource) => {
  try {
    if (source.captureTarget.hasPointerCapture(source.pointerId)) {
      source.captureTarget.releasePointerCapture(source.pointerId);
    }
  } catch {
    // 何もしない
  }
};

export const useStaffingBarDrag = ({ toMinutes, onCommit }: UseStaffingBarDragParams) => {
  const [drag, setDrag] = useState<StaffingBarDrag | null>(null);
  const dragRef = useRef<StaffingBarDrag | null>(null);
  const sourceRef = useRef<StaffingBarDragSource | null>(null);
  const toMinutesRef = useRef(toMinutes);
  const onCommitRef = useRef(onCommit);

  // listenerを登録し直さずに、最新の座標計算と確定処理を使う。
  useEffect(() => {
    toMinutesRef.current = toMinutes;
    onCommitRef.current = onCommit;
  }, [toMinutes, onCommit]);

  const updateDrag = useCallback((next: StaffingBarDrag | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const startDrag = useCallback(
    (next: StaffingBarDrag, source: StaffingBarDragSource) => {
      // 終わりを受け取れずに残ったドラッグがあれば、確定せずに捨てる。残したままにすると、次のドラッグを始められなくなる。
      // 2本目の指では呼ばない（呼ぶ側が、1本目の指と左ボタンだけで始める）。
      if (sourceRef.current) releasePointer(sourceRef.current);
      sourceRef.current = source;
      capturePointer(source);
      updateDrag(next);
    },
    [updateDrag],
  );

  const isDragging = drag !== null;

  useEffect(() => {
    if (!isDragging) return;

    /** ドラッグを終える。終える前のドラッグを返す。 */
    const finish = (): StaffingBarDrag | null => {
      const current = dragRef.current;
      const source = sourceRef.current;
      sourceRef.current = null;
      updateDrag(null);
      if (source) releasePointer(source);
      return current;
    };

    const handleEvent = (event: PointerEvent) => {
      const source = sourceRef.current;
      const current = dragRef.current;
      // ドラッグを始めたポインタだけを追う。
      if (!source || !current || event.pointerId !== source.pointerId) return;

      if (event.type === "pointermove") {
        const minutes = toMinutesRef.current(event.clientX, source.track.getBoundingClientRect());
        if (minutes !== current.currentMinutes) updateDrag({ ...current, currentMinutes: minutes });
        return;
      }
      const finished = finish();
      if (event.type === "pointerup" && finished) onCommitRef.current(finished);
    };

    for (const type of DRAG_EVENTS) document.addEventListener(type, handleEvent);
    return () => {
      for (const type of DRAG_EVENTS) document.removeEventListener(type, handleEvent);
      // ドラッグの途中で部品が外れた場合は、捕まえたポインタを放す。
      const source = sourceRef.current;
      sourceRef.current = null;
      dragRef.current = null;
      if (source) releasePointer(source);
    };
  }, [isDragging, updateDrag]);

  return { drag, startDrag };
};
