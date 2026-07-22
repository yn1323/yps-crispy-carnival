// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollToListItem } from "./useScrollToListItem";

describe("一覧の復帰位置", () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockClear();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: originalScrollIntoView,
    });
  });

  it("対象行が描画されてから中央へ一度だけスクロールする", () => {
    const row = document.createElement("button");
    row.id = "user-person-a";
    document.body.append(row);

    const { rerender } = renderHook(({ isItemRendered }) => useScrollToListItem("user-person-a", isItemRendered), {
      initialProps: { isItemRendered: false },
    });

    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender({ isItemRendered: true });
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });

    rerender({ isItemRendered: true });
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it("復帰対象が変わったら新しい行へスクロールする", () => {
    const firstRow = document.createElement("button");
    firstRow.id = "user-person-a";
    const secondRow = document.createElement("button");
    secondRow.id = "user-person-b";
    document.body.append(firstRow, secondRow);

    const { rerender } = renderHook(({ itemId }) => useScrollToListItem(itemId, true), {
      initialProps: { itemId: "user-person-a" },
    });

    rerender({ itemId: "user-person-b" });
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
