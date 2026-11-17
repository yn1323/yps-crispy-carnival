import { useCallback, useEffect, useRef, useState } from "react";

// 帯の上を横になぞる操作の進行を持つ。マウス、指、ペンをPointer Eventsで同じように扱う。
// なぞっている間だけdocumentへlistenerを登録し、帯の外へポインタが出ても続きを受け取る。
// 確定はpointerupのときで、それまでは currentMinutes を動かして、選んでいる範囲の表示に使う。
// 動かさずに離した操作は確定しない。区間を押す操作として、ボタンのclickが受け取る。
// pointercancel（指の縦の動きが画面のスクロールになった場合など）では、確定せずに捨てる。

export type BandSwipe = {
  positionId: string;
  /** なぞり始めたマスの開始（分） */
  anchorMinutes: number;
  /** いまポインタがあるマスの開始（分） */
  currentMinutes: number;
  /** 押した場所から横へ動いたか。動くまでは、押しただけの操作として扱う。 */
  hasMoved: boolean;
};

/** なぞり始めたポインタと要素。 */
export type BandSwipeSource = {
  pointerId: number;
  /** 時間の軸の要素。なぞっている途中で帯が動いてもずれないよう、位置は動かすたびに読み直す。 */
  track: Pick<HTMLElement, "getBoundingClientRect">;
  /** 押した場所の横位置（clientX） */
  startClientX: number;
};

type UseBandSwipeParams = {
  /** ポインタの横位置（clientX）と、時間の軸のいまの矩形から、その位置のマスの開始（分）を返す。 */
  toCellMinutes: (clientX: number, trackRect: DOMRect) => number;
  /** 横へ動かしてから離したときに呼ぶ。最後の位置を持つ操作を渡す。 */
  onCommit: (swipe: BandSwipe) => void;
};

const SWIPE_EVENTS = ["pointermove", "pointerup", "pointercancel"] as const;

// 押しただけの操作と、なぞる操作を分ける横の動き（px）。
const SWIPE_SLOP_PX = 4;

export const useBandSwipe = ({ toCellMinutes, onCommit }: UseBandSwipeParams) => {
  const [swipe, setSwipe] = useState<BandSwipe | null>(null);
  const swipeRef = useRef<BandSwipe | null>(null);
  const sourceRef = useRef<BandSwipeSource | null>(null);
  const toCellMinutesRef = useRef(toCellMinutes);
  const onCommitRef = useRef(onCommit);

  // listenerを登録し直さずに、最新の座標計算と確定処理を使う。
  useEffect(() => {
    toCellMinutesRef.current = toCellMinutes;
    onCommitRef.current = onCommit;
  }, [toCellMinutes, onCommit]);

  const updateSwipe = useCallback((next: BandSwipe | null) => {
    swipeRef.current = next;
    setSwipe(next);
  }, []);

  /** なぞり始める。終わりを受け取れずに残った操作があれば、確定せずに置き換える。 */
  const startSwipe = useCallback(
    (next: BandSwipe, source: BandSwipeSource) => {
      sourceRef.current = source;
      updateSwipe(next);
    },
    [updateSwipe],
  );

  const isSwiping = swipe !== null;

  useEffect(() => {
    if (!isSwiping) return;

    const handleEvent = (event: PointerEvent) => {
      const source = sourceRef.current;
      const current = swipeRef.current;
      // なぞり始めたポインタだけを追う。
      if (!source || !current || event.pointerId !== source.pointerId) return;

      // ボタンを離したことを受け取れなかった操作は、確定せずに捨てる。
      if (event.type === "pointermove" && event.buttons === 0) {
        sourceRef.current = null;
        updateSwipe(null);
        return;
      }
      if (event.type === "pointermove") {
        const currentMinutes = toCellMinutesRef.current(event.clientX, source.track.getBoundingClientRect());
        const hasMoved = current.hasMoved || Math.abs(event.clientX - source.startClientX) >= SWIPE_SLOP_PX;
        if (currentMinutes !== current.currentMinutes || hasMoved !== current.hasMoved) {
          updateSwipe({ ...current, currentMinutes, hasMoved });
        }
        return;
      }
      sourceRef.current = null;
      updateSwipe(null);
      if (event.type === "pointerup" && current.hasMoved) onCommitRef.current(current);
    };

    for (const type of SWIPE_EVENTS) document.addEventListener(type, handleEvent);
    return () => {
      for (const type of SWIPE_EVENTS) document.removeEventListener(type, handleEvent);
    };
  }, [isSwiping, updateSwipe]);

  // 部品が外れたら、進んでいた操作を捨てる。
  useEffect(
    () => () => {
      sourceRef.current = null;
      swipeRef.current = null;
    },
    [],
  );

  return { swipe, startSwipe };
};
