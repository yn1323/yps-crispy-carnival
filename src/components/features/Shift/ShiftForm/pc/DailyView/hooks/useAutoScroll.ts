import { useEffect, useRef } from "react";
import { AUTO_SCROLL_EDGE_PX, AUTO_SCROLL_MAX_SPEED, AUTO_SCROLL_MIN_SPEED } from "../../../constants";

type UseAutoScrollParams = {
  isDragging: boolean;
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  rowContainerRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  dragRowRectRef: React.MutableRefObject<DOMRect | null>;
  mouseClientXRef: React.MutableRefObject<number>;
  dragStaffId: string | null;
  handleMouseMove: (e: React.MouseEvent<HTMLDivElement>, containerRect: DOMRect) => void;
};

export const useAutoScroll = ({
  isDragging,
  tableContainerRef,
  rowContainerRefs,
  dragRowRectRef,
  mouseClientXRef,
  dragStaffId,
  handleMouseMove,
}: UseAutoScrollParams) => {
  const STAFF_COLUMN_WIDTH = 120;
  const autoScrollRAFRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isDragging || !tableContainerRef.current) {
      // ドラッグ終了時にRAFをキャンセル
      if (autoScrollRAFRef.current) {
        cancelAnimationFrame(autoScrollRAFRef.current);
        autoScrollRAFRef.current = null;
      }
      return;
    }

    const autoScroll = () => {
      const container = tableContainerRef.current;
      if (!container || !isDragging) return;

      const containerRect = container.getBoundingClientRect();
      const mouseX = mouseClientXRef.current;

      // 時間軸エリアの左端を基準に計算（スタッフ名列の幅を考慮）
      const timeAxisLeft = containerRect.left + STAFF_COLUMN_WIDTH;
      const timeAxisRight = containerRect.right;

      let scrollDelta = 0;

      // 左端に近い場合（時間軸エリア基準で判定）
      const distanceFromLeft = mouseX - timeAxisLeft;
      if (distanceFromLeft < AUTO_SCROLL_EDGE_PX && distanceFromLeft >= -STAFF_COLUMN_WIDTH) {
        // マウスがスタッフ名列内にある場合も含めて左スクロール発動
        const effectiveDistance = Math.max(0, distanceFromLeft);
        const ratio = (AUTO_SCROLL_EDGE_PX - effectiveDistance) / AUTO_SCROLL_EDGE_PX;
        scrollDelta = -(AUTO_SCROLL_MIN_SPEED + (AUTO_SCROLL_MAX_SPEED - AUTO_SCROLL_MIN_SPEED) * ratio);
      }
      // 右端に近い場合
      else {
        const distanceFromRight = timeAxisRight - mouseX;
        if (distanceFromRight < AUTO_SCROLL_EDGE_PX && distanceFromRight >= 0) {
          const ratio = (AUTO_SCROLL_EDGE_PX - distanceFromRight) / AUTO_SCROLL_EDGE_PX;
          scrollDelta = AUTO_SCROLL_MIN_SPEED + (AUTO_SCROLL_MAX_SPEED - AUTO_SCROLL_MIN_SPEED) * ratio;
        }
      }

      if (scrollDelta !== 0) {
        container.scrollLeft += scrollDelta;

        // スクロール後、rectを再取得してドラッグ座標を再計算
        if (dragStaffId) {
          const currentRow = rowContainerRefs.current[dragStaffId];
          if (currentRow) {
            dragRowRectRef.current = currentRow.getBoundingClientRect();
          }
        }

        if (dragRowRectRef.current) {
          const syntheticEvent = {
            clientX: mouseClientXRef.current,
            clientY: 0, // Y座標は使わないのでダミー
          } as unknown as React.MouseEvent<HTMLDivElement>;
          handleMouseMove(syntheticEvent, dragRowRectRef.current);
        }
      }

      // 次フレームをスケジュール
      autoScrollRAFRef.current = requestAnimationFrame(autoScroll);
    };

    // 自動スクロール開始
    autoScrollRAFRef.current = requestAnimationFrame(autoScroll);

    return () => {
      if (autoScrollRAFRef.current) {
        cancelAnimationFrame(autoScrollRAFRef.current);
        autoScrollRAFRef.current = null;
      }
    };
  }, [isDragging, handleMouseMove, dragStaffId, dragRowRectRef, mouseClientXRef, tableContainerRef, rowContainerRefs]);
};
