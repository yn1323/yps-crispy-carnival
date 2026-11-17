import { useLayoutEffect, useState } from "react";

/**
 * 要素の幅（px）を測る。返した measureRef を、幅が中身に左右されない要素へ渡す。
 * 最初の描画の前に一度測り、そのあとは幅が変わったときだけ描き直す。
 */
export const useContainerWidth = () => {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    if (!element) return;
    const update = () => setWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return { measureRef: setElement, width };
};
