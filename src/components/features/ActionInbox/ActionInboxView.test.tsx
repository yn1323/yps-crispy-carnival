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
      const item = createItem();
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
    fireEvent.click(screen.getByRole("button", { name: "確認して完了" }));

    expect(screen.getByRole("article")).not.toBeNull();
    act(() => vi.advanceTimersByTime(EXIT_DURATION_MS - 1));
    expect(screen.getByRole("article")).not.toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("article")).toBeNull();
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
