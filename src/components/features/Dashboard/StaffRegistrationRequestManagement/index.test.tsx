// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionInboxItem } from "@/src/components/features/ActionInbox";
import { ChakraProvider } from "@/src/providers/ChakraProvider";
import type { StaffRegistrationRequest } from "../types";

const mocks = vi.hoisted(() => ({
  approveRequest: vi.fn(),
  rejectRequest: vi.fn(),
  showSuccessToast: vi.fn(),
  shopMutationCallCount: 0,
  latestViewProps: null as null | {
    items: readonly ActionInboxItem[];
    completedItemIds?: readonly string[];
  },
}));

vi.mock("@/src/hooks/useShopQuery", () => ({
  useShopQuery: () => [],
}));

vi.mock("@/src/hooks/useShopMutation", () => ({
  useShopMutation: () => {
    const mutations = [mocks.approveRequest, mocks.rejectRequest];
    const mutation = mutations[mocks.shopMutationCallCount % mutations.length];
    mocks.shopMutationCallCount += 1;
    return mutation;
  },
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showSuccessToast: mocks.showSuccessToast,
}));

vi.mock("@/src/components/shared/PeopleCapacityResolutionAlert", () => ({
  PeopleCapacityResolutionAlert: ({ resolution }: { resolution: { current: number; max: number } }) => (
    <div role="alert">
      利用人数 {resolution.current}/{resolution.max}
    </div>
  ),
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
            却下を確定
          </button>
        </div>
      ) : null,
  };
});

import { StaffRegistrationRequestManagement } from ".";

const request = {
  _id: "request-1" as Id<"staffRegistrationRequests">,
  name: "田中 花子",
  email: "hanako@example.com",
  createdAt: 1,
  canApprove: true,
  approveDisabledReason: null,
} satisfies StaffRegistrationRequest;

function managementTree(isReadOnly = false) {
  return (
    <ChakraProvider>
      <StaffRegistrationRequestManagement shopName="渋谷店" requests={[request]} isReadOnly={isReadOnly}>
        {(state) => state.content}
      </StaffRegistrationRequestManagement>
    </ChakraProvider>
  );
}

function renderManagement() {
  return render(managementTree());
}

function getAction(label: string) {
  const item = mocks.latestViewProps?.items[0];
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
  mocks.approveRequest.mockReset();
  mocks.rejectRequest.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.shopMutationCallCount = 0;
  mocks.latestViewProps = null;
  mocks.approveRequest.mockResolvedValue({ approved: true });
  mocks.rejectRequest.mockResolvedValue({ rejected: true });
});

afterEach(() => vi.unstubAllGlobals());

describe("StaffRegistrationRequestManagement", () => {
  it("承認失敗を呼出元へ返して項目を残す", async () => {
    mocks.approveRequest.mockRejectedValue(new Error("temporary failure"));
    renderManagement();

    await expect(getAction("承認する").onClick()).rejects.toThrow("temporary failure");

    expect(mocks.latestViewProps?.items).toHaveLength(1);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("利用人数上限を表示した場合も成功扱いにしない", async () => {
    mocks.approveRequest.mockRejectedValue(new Error("利用人数が現在のプラン上限を超えます。\n現在5名、上限5名です。"));
    renderManagement();

    let approvalError: unknown;
    await act(async () => {
      try {
        await getAction("承認する").onClick();
      } catch (error) {
        approvalError = error;
      }
    });

    expect(approvalError).toBeInstanceOf(Error);
    expect((approvalError as Error).message).toContain("利用人数が現在のプラン上限");
    expect((await screen.findByRole("alert")).textContent).toContain("利用人数 5/5");
    expect(mocks.latestViewProps?.items).toHaveLength(1);
  });

  it("承認成功時だけ申請を一覧から外す", async () => {
    renderManagement();

    await act(async () => getAction("承認する").onClick());

    await waitFor(() => expect(mocks.latestViewProps?.items).toHaveLength(0));
    expect(mocks.approveRequest).toHaveBeenCalledWith({ requestId: request._id });
  });

  it("却下失敗時は確認を保持し、成功時だけ完了IDを渡す", async () => {
    mocks.rejectRequest.mockRejectedValueOnce(new Error("private failure"));
    renderManagement();

    act(() => {
      void getAction("却下する").onClick();
    });
    fireEvent.click(screen.getByRole("button", { name: "却下を確定" }));

    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("申請の状態を確認して");
    expect(screen.queryByText(/private failure/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "却下を確定" }));

    await waitFor(() => expect(mocks.latestViewProps?.items).toHaveLength(0));
    expect(mocks.latestViewProps?.completedItemIds).toContain("staffRegistration:request-1");
  });

  it("閲覧専用へ切り替わると確認・エラー・利用人数案内を破棄し、編集可能へ戻しても復元しない", async () => {
    mocks.approveRequest.mockRejectedValue(new Error("利用人数が現在のプラン上限を超えます。\n現在5名、上限5名です。"));
    mocks.rejectRequest.mockRejectedValue(new Error("private failure"));
    const view = renderManagement();

    await act(async () => {
      await expect(getAction("承認する").onClick()).rejects.toThrow("利用人数が現在のプラン上限");
    });
    await screen.findByText("利用人数 5/5");

    act(() => {
      void getAction("却下する").onClick();
    });
    fireEvent.click(screen.getByRole("button", { name: "却下を確定" }));
    await screen.findByText(/申請の状態を確認して/);

    view.rerender(managementTree(true));
    await waitFor(() => expect(screen.queryByRole("button", { name: "却下を確定" })).toBeNull());
    expect(screen.queryByText("利用人数 5/5")).toBeNull();
    expect(screen.queryByText(/申請の状態を確認して/)).toBeNull();

    view.rerender(managementTree(false));
    expect(screen.queryByRole("button", { name: "却下を確定" })).toBeNull();
    expect(screen.queryByText("利用人数 5/5")).toBeNull();
    expect(screen.queryByText(/申請の状態を確認して/)).toBeNull();
  });
});
