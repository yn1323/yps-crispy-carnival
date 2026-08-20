// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@/src/providers/ChakraProvider";
import { ActionInboxView } from "./ActionInboxView";
import type { ActionInboxItem } from "./types";

const EXIT_DURATION_MS = 240;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: false,
    media,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ActionInboxView", () => {
  it("操作成功直後にserver itemが消えてもexit完了まではcard snapshotを保持する", async () => {
    const onAction = vi.fn();

    function Harness() {
      const [isPresent, setIsPresent] = useState(true);
      const item: ActionInboxItem = {
        ...createItem(),
        actions: [
          {
            label: "承認する",
            emphasis: "primary",
            removesItemOnSuccess: true,
            successMessage: "承認しました。",
            onClick: async () => {
              onAction();
              setIsPresent(false);
            },
          },
        ],
      };
      return <ActionInboxView items={isPresent ? [item] : []} />;
    }

    render(
      <ChakraProvider>
        <Harness />
      </ChakraProvider>,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "承認する" })));

    expect(onAction).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByRole("article")).not.toBeNull();

    act(() => vi.advanceTimersByTime(EXIT_DURATION_MS - 1));
    expect(screen.getByRole("article")).not.toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.getByText("要対応の項目はありません")).not.toBeNull();
  });

  it("確認Dialogの完了通知と同時にserver itemが消えても同じexitを通す", () => {
    function Harness() {
      const [isPresent, setIsPresent] = useState(true);
      const [completedItemId, setCompletedItemId] = useState<string | null>(null);
      const item: ActionInboxItem = {
        ...createItem(),
        actions: [
          {
            label: "却下する",
            emphasis: "danger",
            removesItemOnSuccess: false,
            onClick: () => undefined,
          },
          createItem().actions[0],
        ],
      };
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setCompletedItemId(item.id);
              setIsPresent(false);
            }}
          >
            確認して完了
          </button>
          <ActionInboxView items={isPresent ? [item] : []} completedItemId={completedItemId} />
        </>
      );
    }

    render(
      <ChakraProvider>
        <Harness />
      </ChakraProvider>,
    );
    const originalCard = screen.getByRole("article");
    const originalTrigger = screen.getByRole("button", { name: /その他の操作$/ });
    act(() => originalTrigger.focus());
    fireEvent.click(screen.getByRole("button", { name: "確認して完了" }));

    expect(screen.getByRole("article")).toBe(originalCard);
    expect(screen.getByRole("button", { name: /その他の操作$/ })).toBe(originalTrigger);
    expect(originalTrigger.isConnected).toBe(true);
    expect(document.activeElement).toBe(originalTrigger);
    expect(originalTrigger.hasAttribute("disabled")).toBe(false);
    expect(originalTrigger.getAttribute("aria-disabled")).toBe("true");
    expect(originalCard.getAttribute("data-state")).toBe("exiting");
    act(() => vi.advanceTimersByTime(EXIT_DURATION_MS - 1));
    expect(screen.getByRole("article")).not.toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("複数の完了項目を同時に受け取り、各cardをexit完了まで保持する", () => {
    const onVisibleItemCountChange = vi.fn();

    function Harness() {
      const initialItems = [createItem(), { ...createItem(), id: "staff:registration-2" }];
      const [items, setItems] = useState<readonly ActionInboxItem[]>(initialItems);
      const [completedItemIds, setCompletedItemIds] = useState<readonly string[]>([]);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setCompletedItemIds(initialItems.map((item) => item.id));
              setItems([]);
            }}
          >
            すべて完了
          </button>
          <ActionInboxView
            items={items}
            completedItemIds={completedItemIds}
            onVisibleItemCountChange={onVisibleItemCountChange}
          />
        </>
      );
    }

    render(
      <ChakraProvider>
        <Harness />
      </ChakraProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "すべて完了" }));

    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(onVisibleItemCountChange.mock.calls).toEqual([[2]]);
    act(() => vi.advanceTimersByTime(EXIT_DURATION_MS - 1));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(onVisibleItemCountChange.mock.calls).toEqual([[2]]);

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(onVisibleItemCountChange.mock.calls).toEqual([[2], [0]]);
  });

  it("同じIDの項目が再発しても完了配列への追記を新しいexitとして扱う", () => {
    function Harness() {
      const item = createItem();
      const [isPresent, setIsPresent] = useState(true);
      const [completedItemIds, setCompletedItemIds] = useState<readonly string[]>([]);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setCompletedItemIds((current) => [...current, item.id]);
              setIsPresent(false);
            }}
          >
            完了
          </button>
          <button type="button" onClick={() => setIsPresent(true)}>
            再発
          </button>
          <ActionInboxView items={isPresent ? [item] : []} completedItemIds={completedItemIds} />
        </>
      );
    }

    render(
      <ChakraProvider>
        <Harness />
      </ChakraProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    act(() => vi.advanceTimersByTime(EXIT_DURATION_MS));
    expect(screen.queryByRole("article")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "再発" }));
    expect(screen.getByRole("article")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    expect(screen.getByRole("article")).not.toBeNull();

    act(() => vi.advanceTimersByTime(EXIT_DURATION_MS));
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("retained itemを含む表示件数をexit完了後に通知する", async () => {
    const onVisibleItemCountChange = vi.fn();

    function Harness() {
      const [isPresent, setIsPresent] = useState(true);
      const item: ActionInboxItem = {
        ...createItem(),
        actions: [
          {
            label: "承認する",
            emphasis: "primary",
            removesItemOnSuccess: true,
            successMessage: "承認しました。",
            onClick: () => setIsPresent(false),
          },
        ],
      };
      return <ActionInboxView items={isPresent ? [item] : []} onVisibleItemCountChange={onVisibleItemCountChange} />;
    }

    render(
      <ChakraProvider>
        <Harness />
      </ChakraProvider>,
    );
    expect(onVisibleItemCountChange.mock.calls).toEqual([[1]]);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "承認する" })));
    expect(onVisibleItemCountChange.mock.calls).toEqual([[1]]);
    act(() => vi.advanceTimersByTime(EXIT_DURATION_MS - 1));
    expect(onVisibleItemCountChange.mock.calls).toEqual([[1]]);

    act(() => vi.advanceTimersByTime(1));
    expect(onVisibleItemCountChange.mock.calls).toEqual([[1], [0]]);
  });

  it("埋め込み先では空表示を隠し、一覧のaria labelを変更できる", () => {
    const { rerender } = render(
      <ChakraProvider>
        <ActionInboxView items={[]} hideEmpty ariaLabel="ダッシュボードの要対応" />
      </ChakraProvider>,
    );

    expect(screen.queryByText("要対応の項目はありません")).toBeNull();
    expect(screen.queryByRole("region", { name: "ダッシュボードの要対応" })).toBeNull();

    rerender(
      <ChakraProvider>
        <ActionInboxView items={[createItem()]} hideEmpty ariaLabel="ダッシュボードの要対応" />
      </ChakraProvider>,
    );
    expect(screen.getByRole("region", { name: "ダッシュボードの要対応" })).not.toBeNull();
  });
});

function createItem(): ActionInboxItem {
  return {
    id: "staff:registration-1",
    category: "staff",
    statusLabel: "承認待ち",
    title: "山田花子さんからスタッフ登録申請があります",
    metadata: [{ label: "yn1323店舗", icon: "shop" }],
    actions: [
      {
        label: "承認する",
        emphasis: "primary",
        removesItemOnSuccess: true,
        successMessage: "承認しました。",
        onClick: () => undefined,
      },
    ],
  };
}
