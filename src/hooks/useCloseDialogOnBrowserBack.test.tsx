// @vitest-environment jsdom

import type { BlockerFn, RouterHistory } from "@tanstack/react-router";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCloseDialogOnBrowserBack } from "./useCloseDialogOnBrowserBack";

type NavigationBlocker = Parameters<RouterHistory["block"]>[0];
type BlockerFnArgs = Parameters<BlockerFn>[0];

const mockState = vi.hoisted(() => ({
  blockers: [] as NavigationBlocker[],
  router: undefined as unknown,
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => mockState.router,
}));

const createRouterMock = () => ({
  history: {
    block: (blocker: NavigationBlocker) => {
      mockState.blockers.push(blocker);
      return () => {
        const index = mockState.blockers.indexOf(blocker);
        if (index !== -1) mockState.blockers.splice(index, 1);
      };
    },
  },
});

// @tanstack/historyはブラウザ戻る時に登録順でblockerFnを評価し、
// trueが返った時点で遷移を取り消す。その評価順を再現する。
const simulate = async (action: BlockerFnArgs["action"]) => {
  for (const blocker of [...mockState.blockers]) {
    if (await blocker.blockerFn({ action } as BlockerFnArgs)) return "blocked";
  }
  return "navigated";
};

beforeEach(() => {
  mockState.blockers = [];
  mockState.router = createRouterMock();
});

describe("useCloseDialogOnBrowserBack", () => {
  it("閉じている間はblockerを登録しない", () => {
    renderHook(() => useCloseDialogOnBrowserBack(false, vi.fn()));

    expect(mockState.blockers).toHaveLength(0);
  });

  it("表示中のブラウザ戻るでDialogを閉じ、ページ遷移を止める", async () => {
    const onClose = vi.fn();
    renderHook(() => useCloseDialogOnBrowserBack(true, onClose));

    expect(mockState.blockers).toHaveLength(1);
    expect(mockState.blockers[0]?.enableBeforeUnload).toBe(false);

    await expect(simulate("BACK")).resolves.toBe("blocked");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("戻る以外の遷移は妨げず、Dialogも閉じない", async () => {
    const onClose = vi.fn();
    renderHook(() => useCloseDialogOnBrowserBack(true, onClose));

    await expect(simulate("PUSH")).resolves.toBe("navigated");
    await expect(simulate("FORWARD")).resolves.toBe("navigated");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Dialogを閉じるとblockerを解除し、次の戻るは遷移になる", async () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(({ isOpen }) => useCloseDialogOnBrowserBack(isOpen, onClose), {
      initialProps: { isOpen: true },
    });

    rerender({ isOpen: false });

    expect(mockState.blockers).toHaveLength(0);
    await expect(simulate("BACK")).resolves.toBe("navigated");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Dialogが重なっている場合は最前面だけを閉じる", async () => {
    const onCloseFirst = vi.fn();
    const onCloseSecond = vi.fn();
    renderHook(() => useCloseDialogOnBrowserBack(true, onCloseFirst));
    renderHook(() => useCloseDialogOnBrowserBack(true, onCloseSecond));

    await expect(simulate("BACK")).resolves.toBe("blocked");
    expect(onCloseFirst).not.toHaveBeenCalled();
    expect(onCloseSecond).toHaveBeenCalledTimes(1);
  });

  it("最新のonCloseを呼ぶ", async () => {
    const staleOnClose = vi.fn();
    const latestOnClose = vi.fn();
    const { rerender } = renderHook(({ onClose }) => useCloseDialogOnBrowserBack(true, onClose), {
      initialProps: { onClose: staleOnClose },
    });

    rerender({ onClose: latestOnClose });

    await expect(simulate("BACK")).resolves.toBe("blocked");
    expect(staleOnClose).not.toHaveBeenCalled();
    expect(latestOnClose).toHaveBeenCalledTimes(1);
  });

  it("Router外の描画では何もしない", () => {
    mockState.router = undefined;

    expect(() => renderHook(() => useCloseDialogOnBrowserBack(true, vi.fn()))).not.toThrow();
    expect(mockState.blockers).toHaveLength(0);
  });
});
