// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionInboxItem } from "@/src/components/features/ActionInbox";
import { ChakraProvider } from "@/src/providers/ChakraProvider";
import type { DashboardNotificationFailure } from "./types";

const mocks = vi.hoisted(() => ({
  resendFailure: vi.fn(),
  resendOpenFailures: vi.fn(),
  resolveFailure: vi.fn(),
  showErrorToast: vi.fn(),
  toasterCreate: vi.fn(),
  shopMutationCallCount: 0,
  latestViewProps: null as null | {
    items: readonly ActionInboxItem[];
    completedItemIds?: readonly string[];
  },
}));

vi.mock("@/src/hooks/useShopCustomPaginatedQuery", () => ({
  useShopCustomPaginatedQuery: () => ({ results: [], status: "Exhausted" }),
}));

vi.mock("@/src/hooks/useShopMutation", () => ({
  useShopMutation: () => {
    const mutations = [mocks.resendFailure, mocks.resendOpenFailures, mocks.resolveFailure];
    const mutation = mutations[mocks.shopMutationCallCount % mutations.length];
    mocks.shopMutationCallCount += 1;
    return mutation;
  },
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
}));

vi.mock("@/src/components/ui/toaster", () => ({
  toaster: { create: mocks.toasterCreate },
}));

vi.mock("@/src/components/features/ActionInbox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/components/features/ActionInbox")>();
  return {
    ...actual,
    ActionInboxView: (props: { items: readonly ActionInboxItem[]; completedItemIds?: readonly string[] }) => {
      mocks.latestViewProps = props;
      return <div data-testid="action-inbox">{props.items.map((item) => item.title).join("|")}</div>;
    },
    ActionInboxConfirmationDialog: ({
      confirmation,
      errorMessage,
      onConfirm,
    }: {
      confirmation: { kind: string } | null;
      errorMessage: string | null;
      onConfirm: () => void;
    }) =>
      confirmation ? (
        <div>
          {errorMessage && <p role="alert">{errorMessage}</p>}
          <button type="button" onClick={onConfirm}>
            破棄を確定
          </button>
        </div>
      ) : null,
  };
});

import { NotificationFailureRecovery } from ".";

const id = (value: string) => value as Id<"notificationFailureInbox">;
const failures: DashboardNotificationFailure[] = [
  {
    _id: id("failure-1"),
    staffName: "佐藤 真由美",
    notificationKind: "recruitment",
    notificationKindLabel: "シフト募集通知",
    periodLabel: "7/1〜7/15",
    channel: "email",
    lastFailedAt: 1,
    canRetry: true,
  },
  {
    _id: id("failure-2"),
    staffName: "高橋 健太",
    notificationKind: "reminder",
    notificationKindLabel: "催促用リンク",
    periodLabel: "7/1〜7/15",
    channel: "line",
    lastFailedAt: 2,
    canRetry: true,
  },
];

function recoveryTree(isReadOnly = false) {
  return (
    <ChakraProvider>
      <NotificationFailureRecovery shopName="渋谷店" failures={failures} isReadOnly={isReadOnly}>
        {(state) => state.content}
      </NotificationFailureRecovery>
    </ChakraProvider>
  );
}

function renderRecovery() {
  return render(recoveryTree());
}

function getAction(itemIndex: number, label: string) {
  const item = mocks.latestViewProps?.items[itemIndex];
  if (!item) throw new Error("action item is not rendered");
  const action = item.actions.find((candidate) => candidate.label === label);
  if (!action || action.disabled) throw new Error(`${label} is not enabled`);
  return action;
}

beforeEach(() => {
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
  mocks.resendFailure.mockReset();
  mocks.resendOpenFailures.mockReset();
  mocks.resolveFailure.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.toasterCreate.mockReset();
  mocks.shopMutationCallCount = 0;
  mocks.latestViewProps = null;
  mocks.resendFailure.mockResolvedValue({ scheduled: true, reason: null });
  mocks.resendOpenFailures.mockResolvedValue({
    scheduled: true,
    scheduledCount: failures.length,
    scheduledFailureIds: failures.map((failure) => failure._id),
    skippedCount: 0,
    hasMore: false,
  });
  mocks.resolveFailure.mockResolvedValue({ resolved: true });
});

afterEach(() => vi.unstubAllGlobals());

describe("NotificationFailureRecovery", () => {
  it("個別再送が受付されなければ失敗を返して項目を残す", async () => {
    mocks.resendFailure.mockResolvedValue({ scheduled: false, reason: "rateLimited" });
    renderRecovery();

    await expect(getAction(0, "再送する").onClick()).rejects.toThrow("少し時間をおいて");

    expect(mocks.latestViewProps?.items).toHaveLength(2);
  });

  it("「すべて再送する」は受付済みIDだけを完了扱いにする", async () => {
    mocks.resendOpenFailures
      .mockResolvedValueOnce({
        scheduled: true,
        scheduledCount: 1,
        scheduledFailureIds: [failures[0]._id],
        skippedCount: 0,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        scheduled: false,
        scheduledCount: 0,
        scheduledFailureIds: [],
        skippedCount: 1,
        hasMore: true,
      });
    renderRecovery();

    fireEvent.click(screen.getByRole("button", { name: "すべて再送する" }));

    await waitFor(() => expect(mocks.latestViewProps?.completedItemIds).toContain("notificationFailure:failure-1"));
    expect(mocks.latestViewProps?.completedItemIds).not.toContain("notificationFailure:failure-2");
    expect(mocks.latestViewProps?.items.map((item) => item.id)).toEqual(["notificationFailure:failure-2"]);
  });

  it("破棄失敗時は確認を保持し、成功時だけ項目を完了させる", async () => {
    mocks.resolveFailure.mockRejectedValueOnce(new Error("private provider detail"));
    renderRecovery();

    act(() => getAction(0, "再送せず破棄する").onClick());
    fireEvent.click(screen.getByRole("button", { name: "破棄を確定" }));

    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("通知の状態を確認して");
    expect(screen.queryByText(/private provider detail/)).toBeNull();
    expect(screen.getByRole("button", { name: "破棄を確定" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "破棄を確定" }));

    await waitFor(() => expect(mocks.latestViewProps?.items).toHaveLength(1));
    expect(mocks.latestViewProps?.completedItemIds).toContain("notificationFailure:failure-1");
  });

  it("閲覧専用へ切り替わると確認とエラーを破棄し、編集可能へ戻しても復元しない", async () => {
    mocks.resolveFailure.mockRejectedValue(new Error("private provider detail"));
    const view = renderRecovery();

    act(() => {
      void getAction(0, "再送せず破棄する").onClick();
    });
    fireEvent.click(screen.getByRole("button", { name: "破棄を確定" }));
    await screen.findByText(/通知の状態を確認して/);

    view.rerender(recoveryTree(true));
    await waitFor(() => expect(screen.queryByRole("button", { name: "破棄を確定" })).toBeNull());
    expect(screen.queryByText(/通知の状態を確認して/)).toBeNull();

    view.rerender(recoveryTree(false));
    expect(screen.queryByRole("button", { name: "破棄を確定" })).toBeNull();
    expect(screen.queryByText(/通知の状態を確認して/)).toBeNull();
  });
});
