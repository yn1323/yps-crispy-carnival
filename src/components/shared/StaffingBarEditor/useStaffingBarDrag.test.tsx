// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type StaffingBarDrag, useStaffingBarDrag } from "./useStaffingBarDrag";

const TRACK_RECT = { left: 100 } as DOMRect;
// 1pxを1分として、時間の軸の左端からの距離を時刻にする。
const toMinutes = (clientX: number, trackRect: DOMRect) => clientX - trackRect.left;

const createDrag: StaffingBarDrag = {
  kind: "create",
  positionId: "hall",
  rowIndex: 2,
  anchorMinutes: 600,
  currentMinutes: 600,
};

const DRAG_EVENTS = ["mousemove", "mouseup"];

/** documentへ登録したドラッグ用のlistenerを、種類ごとに数える。 */
const countListenerCalls = (spy: { mock: { calls: unknown[][] } }) =>
  DRAG_EVENTS.map((type) => spy.mock.calls.filter(([eventType]) => eventType === type).length);

const moveTo = (clientX: number) => {
  act(() => {
    document.dispatchEvent(new MouseEvent("mousemove", { clientX }));
  });
};

const release = () => {
  act(() => {
    document.dispatchEvent(new MouseEvent("mouseup"));
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useStaffingBarDrag", () => {
  it("ドラッグを始めるまでは、documentへlistenerを登録しない", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const onCommit = vi.fn();

    renderHook(() => useStaffingBarDrag({ toMinutes, onCommit }));
    moveTo(900);
    release();

    expect(countListenerCalls(addSpy)).toEqual([0, 0]);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("ドラッグを始めると、mousemoveとmouseupを1つずつ登録する", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const { result } = renderHook(() => useStaffingBarDrag({ toMinutes, onCommit: vi.fn() }));

    act(() => result.current.startDrag(createDrag, TRACK_RECT));

    expect(countListenerCalls(addSpy)).toEqual([1, 1]);
    expect(result.current.drag).toEqual(createDrag);
  });

  it("ドラッグ中は、ポインタの位置でプレビューの時刻だけを動かし、確定はしない", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const onCommit = vi.fn();
    const { result } = renderHook(() => useStaffingBarDrag({ toMinutes, onCommit }));

    act(() => result.current.startDrag(createDrag, TRACK_RECT));
    moveTo(880);
    moveTo(940);

    expect(result.current.drag).toEqual({ ...createDrag, currentMinutes: 840 });
    expect(onCommit).not.toHaveBeenCalled();
    // 動かすたびにlistenerを登録し直さない。
    expect(countListenerCalls(addSpy)).toEqual([1, 1]);
  });

  it("mouseupで、最後の位置を持つドラッグを1回だけ確定し、listenerを外す", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const onCommit = vi.fn();
    const { result } = renderHook(() => useStaffingBarDrag({ toMinutes, onCommit }));

    act(() => result.current.startDrag(createDrag, TRACK_RECT));
    moveTo(940);
    release();

    expect(onCommit.mock.calls).toEqual([[{ ...createDrag, currentMinutes: 840 }]]);
    expect(result.current.drag).toBeNull();
    expect(countListenerCalls(removeSpy)).toEqual([1, 1]);

    // 外したあとは、ポインタを動かしても離しても何も起きない。
    moveTo(1000);
    release();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(result.current.drag).toBeNull();
  });

  it("端を動かすドラッグも、同じ流れで確定する", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useStaffingBarDrag({ toMinutes, onCommit }));
    const resizeDrag: StaffingBarDrag = {
      kind: "resize",
      positionId: "hall",
      barId: "bar-1",
      edge: "end",
      currentMinutes: 840,
    };

    act(() => result.current.startDrag(resizeDrag, TRACK_RECT));
    moveTo(1060);
    release();

    expect(onCommit.mock.calls).toEqual([[{ ...resizeDrag, currentMinutes: 960 }]]);
  });

  it("ドラッグの途中で部品が外れたら、確定せずにlistenerを外す", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const onCommit = vi.fn();
    const { result, unmount } = renderHook(() => useStaffingBarDrag({ toMinutes, onCommit }));

    act(() => result.current.startDrag(createDrag, TRACK_RECT));
    unmount();
    document.dispatchEvent(new MouseEvent("mouseup"));

    expect(countListenerCalls(removeSpy)).toEqual([1, 1]);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("ドラッグ中に確定処理が差し替わっても、listenerを登録し直さず、新しい処理で確定する", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ onCommit }: { onCommit: (drag: StaffingBarDrag) => void }) => useStaffingBarDrag({ toMinutes, onCommit }),
      { initialProps: { onCommit: first } },
    );

    act(() => result.current.startDrag(createDrag, TRACK_RECT));
    rerender({ onCommit: second });
    release();

    expect(countListenerCalls(addSpy)).toEqual([1, 1]);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
