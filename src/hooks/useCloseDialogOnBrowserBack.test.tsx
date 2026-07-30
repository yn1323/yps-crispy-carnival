// @vitest-environment jsdom

import type { BlockerFn, HistoryLocation, RouterHistory } from "@tanstack/react-router";
import { cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDialogBackNavigation, useCloseDialogOnBrowserBack } from "./useCloseDialogOnBrowserBack";

type BlockerFnArgs = Parameters<BlockerFn>[0];
type NavigationBlocker = Parameters<RouterHistory["block"]>[0];

const initialLocation = {
  href: "/shift-board",
  pathname: "/shift-board",
  search: "",
  hash: "",
  state: { __TSR_index: 0, __TSR_key: "initial" },
} satisfies HistoryLocation;

const mockState = vi.hoisted(() => ({
  router: undefined as unknown,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal()),
  useRouter: () => mockState.router,
}));

const createHistoryMock = () => {
  const blockers: NavigationBlocker[] = [];
  const history: RouterHistory = {
    location: initialLocation,
    length: 1,
    subscribers: new Set(),
    subscribe: vi.fn(() => vi.fn()),
    push: vi.fn((path: string, state?: Record<string, unknown>) => {
      history.location = {
        href: path,
        pathname: path,
        search: "",
        hash: "",
        state: {
          ...state,
          __TSR_index: history.location.state.__TSR_index + 1,
          __TSR_key: "guard",
        },
      };
      history.length += 1;
    }),
    replace: vi.fn(),
    go: vi.fn(),
    back: vi.fn((options?: { ignoreBlocker?: boolean }) => {
      const { ignoreBlocker } = options ?? {};
      if (ignoreBlocker) history.location = initialLocation;
    }),
    forward: vi.fn(),
    canGoBack: vi.fn(() => history.location.state.__TSR_index !== 0),
    createHref: vi.fn((href: string) => href),
    block: vi.fn((blocker: NavigationBlocker) => {
      blockers.push(blocker);
      return () => {
        const index = blockers.indexOf(blocker);
        if (index !== -1) blockers.splice(index, 1);
      };
    }),
    flush: vi.fn(),
    destroy: vi.fn(),
    notify: vi.fn(),
  } satisfies RouterHistory;

  return { blockers, history };
};

const simulate = async (blockers: NavigationBlocker[], action: BlockerFnArgs["action"]) => {
  for (const blocker of [...blockers]) {
    if (
      await blocker.blockerFn({
        action,
        currentLocation: initialLocation,
        nextLocation: initialLocation,
      })
    ) {
      return "blocked";
    }
  }
  return "navigated";
};

let history: RouterHistory;
let blockers: NavigationBlocker[];

beforeEach(() => {
  vi.useFakeTimers();
  ({ blockers, history } = createHistoryMock());
  mockState.router = { history };
  // main.tsxと同じく、画面固有のblockerがmountする前に登録する。
  registerDialogBackNavigation(history);
});

afterEach(() => {
  cleanup();
  vi.runAllTimers();
  vi.useRealTimers();
});

describe("useCloseDialogOnBrowserBack", () => {
  it("閉じている間は履歴entryを追加しない", () => {
    renderHook(() => useCloseDialogOnBrowserBack(false, vi.fn()));

    expect(history.push).not.toHaveBeenCalled();
  });

  it("表示時に同一document内の戻り先を用意する", () => {
    renderHook(() => useCloseDialogOnBrowserBack(true, vi.fn()));

    expect(history.push).toHaveBeenCalledOnce();
    expect(history.push).toHaveBeenCalledWith(
      initialLocation.href,
      expect.objectContaining({ __shiftoriDialogBackGuard: expect.any(String) }),
      { ignoreBlocker: true },
    );
    expect(history.flush).toHaveBeenCalledOnce();
  });

  it("既存blockerより先にDialogを閉じ、ページ遷移を止める", async () => {
    const existingBlocker = vi.fn(() => true);
    history.block({ blockerFn: existingBlocker });
    const onClose = vi.fn();
    renderHook(() => useCloseDialogOnBrowserBack(true, onClose));

    await expect(simulate(blockers, "BACK")).resolves.toBe("blocked");
    expect(onClose).toHaveBeenCalledOnce();
    expect(existingBlocker).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(history.back).toHaveBeenCalledWith({ ignoreBlocker: true });
  });

  it("guard削除後にURL同期Dialogの検索条件をもう一度閉じられる", async () => {
    const onClose = vi.fn();
    const onBackGuardRemoved = vi.fn();
    renderHook(() => useCloseDialogOnBrowserBack(true, onClose, onBackGuardRemoved));

    await expect(simulate(blockers, "BACK")).resolves.toBe("blocked");
    expect(onClose).toHaveBeenCalledOnce();
    expect(onBackGuardRemoved).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(history.back).toHaveBeenCalledWith({ ignoreBlocker: true });
    expect(onBackGuardRemoved).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onBackGuardRemoved).toHaveBeenCalledOnce();
  });

  it("戻る以外の遷移は妨げず、Dialogも閉じない", async () => {
    const onClose = vi.fn();
    renderHook(() => useCloseDialogOnBrowserBack(true, onClose));

    await expect(simulate(blockers, "PUSH")).resolves.toBe("navigated");
    await expect(simulate(blockers, "FORWARD")).resolves.toBe("navigated");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("閉じる操作では追加した履歴entryを取り除き、URL同期状態を再度閉じる", () => {
    const onBackGuardRemoved = vi.fn();
    const { rerender } = renderHook(({ isOpen }) => useCloseDialogOnBrowserBack(isOpen, vi.fn(), onBackGuardRemoved), {
      initialProps: { isOpen: true },
    });

    rerender({ isOpen: false });
    vi.runAllTimers();

    expect(history.back).toHaveBeenCalledOnce();
    expect(history.back).toHaveBeenCalledWith({ ignoreBlocker: true });
    expect(onBackGuardRemoved).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onBackGuardRemoved).toHaveBeenCalledOnce();
  });

  it("Dialogが重なっている場合は戻る一回につき最前面だけを閉じる", async () => {
    const onCloseFirst = vi.fn();
    const onCloseSecond = vi.fn();
    renderHook(() => useCloseDialogOnBrowserBack(true, onCloseFirst));
    renderHook(() => useCloseDialogOnBrowserBack(true, onCloseSecond));

    expect(history.push).toHaveBeenCalledOnce();
    await expect(simulate(blockers, "BACK")).resolves.toBe("blocked");
    expect(onCloseFirst).not.toHaveBeenCalled();
    expect(onCloseSecond).toHaveBeenCalledOnce();
    expect(history.back).not.toHaveBeenCalled();

    await expect(simulate(blockers, "BACK")).resolves.toBe("blocked");
    expect(onCloseFirst).toHaveBeenCalledOnce();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(history.back).toHaveBeenCalledWith({ ignoreBlocker: true });
  });

  it("最新のonCloseを呼ぶ", async () => {
    const staleOnClose = vi.fn();
    const latestOnClose = vi.fn();
    const { rerender } = renderHook(({ onClose }) => useCloseDialogOnBrowserBack(true, onClose), {
      initialProps: { onClose: staleOnClose },
    });

    rerender({ onClose: latestOnClose });

    await expect(simulate(blockers, "BACK")).resolves.toBe("blocked");
    expect(staleOnClose).not.toHaveBeenCalled();
    expect(latestOnClose).toHaveBeenCalledOnce();
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  it("StrictModeのeffect再実行では履歴entryを重複追加・削除しない", () => {
    renderHook(() => useCloseDialogOnBrowserBack(true, vi.fn()), { wrapper: StrictMode });
    vi.runAllTimers();

    expect(history.push).toHaveBeenCalledOnce();
    expect(history.back).not.toHaveBeenCalled();
  });

  it("Router外の描画では何もしない", () => {
    mockState.router = undefined;

    expect(() => renderHook(() => useCloseDialogOnBrowserBack(true, vi.fn()))).not.toThrow();
    expect(history.push).not.toHaveBeenCalled();
  });
});
