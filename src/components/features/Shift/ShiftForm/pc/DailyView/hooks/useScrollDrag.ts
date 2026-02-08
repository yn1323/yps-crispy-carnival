import { useCallback, useRef, useState } from "react";

export const useScrollDrag = () => {
  const scrollDragRef = useRef({ isScrolling: false, startX: 0, startScrollLeft: 0 });
  const [isScrollDragging, setIsScrollDragging] = useState(false);

  const startScrollDrag = useCallback((e: React.MouseEvent, tableContainer: HTMLDivElement) => {
    scrollDragRef.current = {
      isScrolling: true,
      startX: e.clientX,
      startScrollLeft: tableContainer.scrollLeft,
    };
    setIsScrollDragging(true);
  }, []);

  const handleScrollDragMove = useCallback((e: MouseEvent, tableContainer: HTMLDivElement) => {
    if (!scrollDragRef.current.isScrolling) return;
    const dx = e.clientX - scrollDragRef.current.startX;
    tableContainer.scrollLeft = scrollDragRef.current.startScrollLeft - dx;
  }, []);

  const stopScrollDrag = useCallback(() => {
    scrollDragRef.current.isScrolling = false;
    setIsScrollDragging(false);
  }, []);

  return {
    isScrollDragging,
    startScrollDrag,
    handleScrollDragMove,
    stopScrollDrag,
    isScrolling: () => scrollDragRef.current.isScrolling,
  };
};
