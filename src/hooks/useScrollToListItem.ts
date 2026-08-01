import { useEffect, useRef } from "react";

export function useScrollToListItem(itemId: string | undefined, isItemRendered: boolean) {
  const scrolledItemId = useRef<string | null>(null);

  useEffect(() => {
    if (!itemId) {
      scrolledItemId.current = null;
      return;
    }
    if (!isItemRendered || scrolledItemId.current === itemId) return;

    const item = document.getElementById(itemId);
    if (!item) return;
    item.scrollIntoView({ block: "center" });
    scrolledItemId.current = itemId;
  }, [isItemRendered, itemId]);
}
