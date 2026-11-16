// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type StaffingBarDrag, type StaffingBarDragSource, useStaffingBarDrag } from "./useStaffingBarDrag";

const POINTER_ID = 7;
// 1pxを1分として、時間の軸の左端からの距離を時刻にする。
const toMinutes = (clientX: number, trackRect: DOMRect) => clientX - trackRect.left;

const createDrag: StaffingBarDrag = {
  kind: "create",
  positionId: "hall",
  rowIndex: 2,
  anchorMinutes: 600,
  currentMinutes: 600,
};

/** ドラッグを始めた要素の代わり。時間の軸の左端の位置を動かせ、ポインタを捕まえた状態を持つ。 */
const createSource = (pointerId = POINTER_ID) => {
  const state = { left: 100, captured: false };
  const setPointerCapture = vi.fn(() => {
    state.captured = true;
  });
  const releasePointerCapture = vi.fn(() => {
    state.captured = false;
  });
  const source: StaffingBarDragSource = {
    pointerId,
    track: { getBoundingClientRect: () => ({ left: state.left }) as DOMRect },
    captureTarget: { setPointerCapture, releasePointerCapture, hasPointerCapture: () => state.captured },
  };
  return { source, state, setPointerCapture, releasePointerCapture };
};

const DRAG_EVENTS = ["pointermove", "pointerup", "pointercancel"];

/** documentへ登録したドラッグ用のlistenerを、種類ごとに数える。 */
const countListenerCalls = (spy: { mock: { calls: unknown[][] } }) =>
  DRAG_EVENTS.map((type) => spy.mock.calls.filter(([eventType]) => eventType === type).length);

const dispatchPointer = (type: string, init: { clientX?: number; pointerId?: number } = {}) => {
  act(() => {
    document.dispatchEvent(
      new PointerEvent(type, { bubbles: true, pointerId: init.pointerId ?? POINTER_ID, clientX: init.clientX ?? 0 }),
    );
  });
};

const moveTo = (clientX: number, pointerId?: number) => dispatchPointer("pointermove", { clientX, pointerId });
const release = (pointerId?: number) => dispatchPointer("pointerup", { pointerId });
const cancel = (pointerId?: number) => dispatchPointer("pointercancel", { pointerId });

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

    expect(countListenerCalls(addSpy)).toEqual([0, 0, 0]);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("ドラッグを始めると、ポインタを捕まえ、pointermoveとpointerupとpointercancelを1つずつ登録する", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const { source, setPointerCapture } = createSource();
    const { result } = renderHook(() => useStaffingBarDrag({ toMinutes, onCommit: vi.fn() }));

    act(() => result.current.startDrag(createDrag, source));

    expect(countListenerCalls(addSpy)).toEqual([1, 1, 1]);
    expect(setPointerCapture.mock.calls).toEqual([[POINTER_ID]]);
    expect(result.current.drag).toEqual(createDrag);
  });

  it("ドラッグ中は、ポインタの位置でプレビューの時刻だけを動かし、確定はしない", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const onCommit = vi.fn();
    const { source } = createSource();
    const { result } = renderHook(() => useStaffingBarDrag({ toMinutes, onCommit }));

    act(() => result.current.startDrag(createDrag, source));
    moveTo(880);
    moveTo(940);

    expect(result.current.drag).toEqual({ ...createDrag, currentMinutes: 840 });
    expect(onCommit).not.toHaveBeenCalled();
    // 動かすたびにlistenerを登録し直さない。
    expect(countListenerCalls(addSpy)).toEqual([1, 1, 1]);
  });

  it("ドラッグの途中で表の位置が動いても、動いたあとの位置から時刻を決める", () => {
    const { source, state } = createSource();
    const { result } = renderHook(() => useStaffingBarDrag({ toMinutes, onCommit: vi.fn() }));

    act(() => result.current.startDrag(createDrag, source));
    // 画面がスクロールして、表が左へ60px動いた。
    state.left = 40;
    moveTo(940);

    expect(result.current.drag).toEqual({ ...createDrag, currentMinutes: 900 });
  });

  it("pointerupで、最後の位置を持つドラッグを1回だけ確定し、listenerを外してポインタを放す", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const onCommit = vi.fn();
    const { source, releasePointerCapture } = createSource();
    const { result } = renderHook(() => useStaffingBarDrag({ toMinutes, onCommit }));

    act(() => result.current.startDrag(createDrag, source));
    moveTo(940);
    release();

    expect(onCommit.mock.calls).toEqual([[{ ...createDrag, currentMinutes: 840 }]]);
    expect(result.current.drag).toBeNull();
    expect(countListenerCalls(removeSpy)).toEqual([1, 1, 1]);
    expect(releasePointerCapture.mock.calls).toEqual([[POINTER_ID]]);

    // 外したあとは、ポインタを動かしても離しても何も起きない。
    moveTo(1000);
    release();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(result.current.drag).toBeNull();
  });

  it("pointercancelでは、確定せずにドラッグを捨て、listenerを外してポインタを放す", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const onCommit = vi.fn();
    const { source, releasePointerCapture } = createSource();
    const { result } = renderHook(() => useStaffingBarDrag({ toMinutes, onCommit }));

    act(() => result.current.startDrag(createDrag, source));
    moveTo(940);
    cancel();

    expect(result.current.drag).toBeNull();
    expect(countListenerCalls(removeSpy)).toEqual([1, 1, 1]);
    expect(releasePointerCapture.mock.calls).toEqual([[POINTER_ID]]);
    // 捨てたあとにpointerupが来ても、確定しない。
    release();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("ドラッグを始めたポインタ以外の動きと終了は、追わない", () => {
    const onCommit = vi.fn();
    const { source } = createSource();
    const { result } = renderHook(() => useStaffingBarDrag({ toMinutes, onCommit }));

    act(() => result.current.startDrag(createDrag, source));
    moveTo(940, POINTER_ID + 1);
    release(POINTER_ID + 1);
    cancel(POINTER_ID + 1);

    expect(result.current.drag).toEqual(createDrag);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("終わりを受け取れずに残ったドラッグは、次のドラッグを始めたときに確定せずに捨て、ポインタを放す", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const onCommit = vi.fn();
    const first = createSource();
    const second = createSource(POINTER_ID + 1);
    const { result } = renderHook(() => useStaffingBarDrag({ toMinutes, onCommit }));
    const nextDrag: StaffingBarDrag = { ...createDrag, positionId: "kitchen" };

    act(() => result.current.startDrag(createDrag, first.source));
    moveTo(940);
    act(() => result.current.startDrag(nextDrag, second.source));

    expect(result.current.drag).toEqual(nextDrag);
    expect(first.releasePointerCapture.mock.calls).toEqual([[POINTER_ID]]);
    expect(second.setPointerCapture.mock.calls).toEqual([[POINTER_ID + 1]]);
    // listenerは登録したまま使い回す。
    expect(countListenerCalls(addSpy)).toEqual([1, 1, 1]);
    // 古いポインタの終了では確定せず、新しいポインタの終了で確定する。
    release(POINTER_ID);
    expect(onCommit).not.toHaveBeenCalled();
    release(POINTER_ID + 1);
    expect(onCommit.mock.calls).toEqual([[nextDrag]]);
  });

  it("ポインタを捕まえられなくても、documentのlistenerでドラッグを続けて確定する", () => {
    const onCommit = vi.fn();
    const { source, setPointerCapture } = createSource();
    setPointerCapture.mockImplementation(() => {
      throw new DOMException("No active pointer", "NotFoundError");
    });
    const { result } = renderHook(() => useStaffingBarDrag({ toMinutes, onCommit }));

    act(() => result.current.startDrag(createDrag, source));
    moveTo(940);
    release();

    expect(onCommit.mock.calls).toEqual([[{ ...createDrag, currentMinutes: 840 }]]);
  });

  it("端を動かすドラッグも、同じ流れで確定する", () => {
    const onCommit = vi.fn();
    const { source } = createSource();
    const { result } = renderHook(() => useStaffingBarDrag({ toMinutes, onCommit }));
    const resizeDrag: StaffingBarDrag = {
      kind: "resize",
      positionId: "hall",
      barId: "bar-1",
      edge: "end",
      currentMinutes: 840,
    };

    act(() => result.current.startDrag(resizeDrag, source));
    moveTo(1060);
    release();

    expect(onCommit.mock.calls).toEqual([[{ ...resizeDrag, currentMinutes: 960 }]]);
  });

  it("ドラッグの途中で部品が外れたら、確定せずにlistenerを外してポインタを放す", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const onCommit = vi.fn();
    const { source, releasePointerCapture } = createSource();
    const { result, unmount } = renderHook(() => useStaffingBarDrag({ toMinutes, onCommit }));

    act(() => result.current.startDrag(createDrag, source));
    unmount();
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: POINTER_ID }));

    expect(countListenerCalls(removeSpy)).toEqual([1, 1, 1]);
    expect(releasePointerCapture.mock.calls).toEqual([[POINTER_ID]]);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("ドラッグ中に確定処理が差し替わっても、listenerを登録し直さず、新しい処理で確定する", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const first = vi.fn();
    const second = vi.fn();
    const { source } = createSource();
    const { result, rerender } = renderHook(
      ({ onCommit }: { onCommit: (drag: StaffingBarDrag) => void }) => useStaffingBarDrag({ toMinutes, onCommit }),
      { initialProps: { onCommit: first } },
    );

    act(() => result.current.startDrag(createDrag, source));
    rerender({ onCommit: second });
    release();

    expect(countListenerCalls(addSpy)).toEqual([1, 1, 1]);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
