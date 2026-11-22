// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BandSwipe, useBandSwipe } from "./useBandSwipe";

// 時間の軸は左端が9:00で、1pxを1分として扱う。マスは30分単位。
const TRACK_START_MINUTES = 540;
const toCellMinutes = (clientX: number, rect: DOMRect) =>
  TRACK_START_MINUTES + Math.floor((clientX - rect.left) / 30) * 30;
const track = { getBoundingClientRect: () => ({ left: 0 }) as DOMRect };

const POINTER_ID = 1;
const START: BandSwipe = { positionId: "hall", anchorMinutes: 600, currentMinutes: 600, hasMoved: false };

/** jsdomにPointerEventがないため、pointerIdとbuttonsを持つMouseEventで代える。 */
function dispatchPointer(
  type: "pointermove" | "pointerup" | "pointercancel",
  {
    clientX = 60,
    pointerId = POINTER_ID,
    buttons = 1,
  }: { clientX?: number; pointerId?: number; buttons?: number } = {},
) {
  const event = new MouseEvent(type, { clientX, buttons, bubbles: true });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  act(() => {
    document.dispatchEvent(event);
  });
}

function setup() {
  const onCommit = vi.fn();
  const hook = renderHook(() => useBandSwipe({ toCellMinutes, onCommit }));
  act(() => hook.result.current.startSwipe(START, { pointerId: POINTER_ID, track, startClientX: 60 }));
  return { hook, onCommit };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useBandSwipe", () => {
  it("横へ動かすとなぞっている範囲が進み、離すと最後の位置で確定する", () => {
    const { hook, onCommit } = setup();

    dispatchPointer("pointermove", { clientX: 150 });
    expect(hook.result.current.swipe).toEqual({ ...START, currentMinutes: 690, hasMoved: true });

    dispatchPointer("pointerup", { clientX: 150 });
    expect(onCommit.mock.calls).toEqual([[{ ...START, currentMinutes: 690, hasMoved: true }]]);
    expect(hook.result.current.swipe).toBeNull();
  });

  it("押した場所から4px未満しか動かさずに離した操作は、区間を押す操作として確定しない", () => {
    const { hook, onCommit } = setup();

    dispatchPointer("pointermove", { clientX: 63 });
    expect(hook.result.current.swipe).toEqual(START);
    dispatchPointer("pointerup", { clientX: 63 });

    expect(onCommit).not.toHaveBeenCalled();
    expect(hook.result.current.swipe).toBeNull();
  });

  it("なぞり始めたのと別のポインタの動きは受け取らない", () => {
    const { hook, onCommit } = setup();

    dispatchPointer("pointermove", { clientX: 200, pointerId: 2 });
    dispatchPointer("pointerup", { clientX: 200, pointerId: 2 });

    expect(hook.result.current.swipe).toEqual(START);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("縦の動きがスクロールになって取り消された操作は、動かしたあとでも確定しない", () => {
    const { hook, onCommit } = setup();
    dispatchPointer("pointermove", { clientX: 150 });

    dispatchPointer("pointercancel", { clientX: 150 });

    expect(onCommit).not.toHaveBeenCalled();
    expect(hook.result.current.swipe).toBeNull();
  });

  it("ボタンを離したことを受け取れなかった操作は、次の動きで確定せずに捨てる", () => {
    const { hook, onCommit } = setup();
    dispatchPointer("pointermove", { clientX: 150 });

    dispatchPointer("pointermove", { clientX: 210, buttons: 0 });
    expect(hook.result.current.swipe).toBeNull();
    // 捨てたあとに届いたpointerupでも確定しない。
    dispatchPointer("pointerup", { clientX: 210 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("なぞっている間だけdocumentのlistenerを持ち、終わると外す", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const types = (spy: typeof addSpy) =>
      spy.mock.calls.map(([type]) => type).filter((type) => type.startsWith("pointer"));

    const { hook } = setup();
    expect(types(addSpy)).toEqual(["pointermove", "pointerup", "pointercancel"]);

    dispatchPointer("pointerup");
    expect(types(removeSpy)).toEqual(["pointermove", "pointerup", "pointercancel"]);

    hook.unmount();
    expect(types(addSpy)).toHaveLength(3);
  });
});
