// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { DashboardNotificationFailure } from "../NotificationFailureDialog";

const mocks = vi.hoisted(() => ({
  resendFailure: vi.fn(),
  resendOpenFailures: vi.fn(),
  resolveFailure: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  shopMutationCallCount: 0,
}));

vi.mock("@/src/hooks/useShopCustomPaginatedQuery", () => ({
  useShopCustomPaginatedQuery: () => ({ results: [] }),
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
  showSuccessToast: mocks.showSuccessToast,
}));

vi.mock("@/src/components/ui/toaster", () => ({
  toaster: { create: vi.fn() },
}));

vi.mock("./NotificationFailureRecoveryView", () => ({
  NotificationFailureRecoveryView: ({
    isOpen,
    failures,
    dismissTarget,
    onResend,
    onResendAll,
    onDismiss,
    onConfirmDismiss,
  }: {
    isOpen: boolean;
    failures: DashboardNotificationFailure[];
    dismissTarget: DashboardNotificationFailure | null;
    onResend: (failureId: Id<"notificationFailureInbox">) => void;
    onResendAll: () => void;
    onDismiss: (failure: DashboardNotificationFailure) => void;
    onConfirmDismiss: () => void;
  }) => (
    <div>
      <output data-testid="dialog-state">{isOpen ? "open" : "closed"}</output>
      <button type="button" onClick={onResendAll}>
        すべて再送
      </button>
      {failures.map((failure) => (
        <div key={failure._id}>
          <button type="button" onClick={() => onResend(failure._id)}>
            {failure.staffName}を再送
          </button>
          <button type="button" onClick={() => onDismiss(failure)}>
            {failure.staffName}を無視
          </button>
        </div>
      ))}
      {dismissTarget && (
        <button type="button" onClick={onConfirmDismiss}>
          無視を確定
        </button>
      )}
    </div>
  ),
}));

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

function renderRecovery() {
  return render(
    <NotificationFailureRecovery failures={failures}>
      {(state) => (
        <>
          <button type="button" onClick={state.openNotificationFailures}>
            通知を確認する
          </button>
          {state.content}
        </>
      )}
    </NotificationFailureRecovery>,
  );
}

beforeEach(() => {
  mocks.resendFailure.mockReset();
  mocks.resendOpenFailures.mockReset();
  mocks.resolveFailure.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.shopMutationCallCount = 0;
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

describe("NotificationFailureRecovery", () => {
  it("一部の通知が残っている場合は通知モーダルを閉じない", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "通知を確認する" }));
    fireEvent.click(screen.getByRole("button", { name: "すべて再送" }));

    await waitFor(() => expect(screen.getByTestId("dialog-state").textContent).toBe("open"));
  });

  it("すべて再送できたら通知モーダルを閉じる", async () => {
    renderRecovery();

    fireEvent.click(screen.getByRole("button", { name: "通知を確認する" }));
    expect(screen.getByTestId("dialog-state").textContent).toBe("open");

    fireEvent.click(screen.getByRole("button", { name: "すべて再送" }));

    await waitFor(() => expect(screen.getByTestId("dialog-state").textContent).toBe("closed"));
  });

  it("すべて無視できたら通知モーダルを閉じる", async () => {
    renderRecovery();

    fireEvent.click(screen.getByRole("button", { name: "通知を確認する" }));
    fireEvent.click(screen.getByRole("button", { name: "佐藤 真由美を無視" }));
    fireEvent.click(screen.getByRole("button", { name: "無視を確定" }));
    await waitFor(() => expect(screen.getByTestId("dialog-state").textContent).toBe("open"));

    fireEvent.click(screen.getByRole("button", { name: "高橋 健太を無視" }));
    fireEvent.click(screen.getByRole("button", { name: "無視を確定" }));

    await waitFor(() => expect(screen.getByTestId("dialog-state").textContent).toBe("closed"));
  });
});
