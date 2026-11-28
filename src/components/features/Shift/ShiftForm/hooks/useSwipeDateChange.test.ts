// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import type { TouchEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { useSwipeDateChange } from "./useSwipeDateChange";

const DATES = ["2026-12-01", "2026-12-02", "2026-12-03"];

const touchAt = (clientX: number) =>
  ({ touches: [{ clientX }], changedTouches: [{ clientX }] }) as unknown as TouchEvent;

const swipe = (selectedDate: string, fromX: number, toX: number) => {
  const onSelect = vi.fn();
  const { result } = renderHook(() => useSwipeDateChange({ dates: DATES, selectedDate, onSelect }));
  result.current.onTouchStart(touchAt(fromX));
  result.current.onTouchEnd(touchAt(toX));
  return onSelect;
};

describe("useSwipeDateChange", () => {
  it("左へフリックすると次の日、右へフリックすると前の日を選ぶ", () => {
    expect(swipe("2026-12-02", 300, 250).mock.calls).toEqual([["2026-12-03"]]);
    expect(swipe("2026-12-02", 250, 300).mock.calls).toEqual([["2026-12-01"]]);
  });

  it("横の移動が50pxに届かない場合は、日を変えない", () => {
    expect(swipe("2026-12-02", 300, 251).mock.calls).toEqual([]);
    expect(swipe("2026-12-02", 251, 300).mock.calls).toEqual([]);
  });

  it("募集期間の端では、その先へ移らない", () => {
    expect(swipe("2026-12-01", 250, 300).mock.calls).toEqual([]);
    expect(swipe("2026-12-03", 300, 250).mock.calls).toEqual([]);
  });
});
