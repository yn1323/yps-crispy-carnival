// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionInboxAction } from "@/src/components/features/ActionInbox";
import type { ActionInboxSourceItem } from "./useActionInboxData";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useMutation: vi.fn(),
  approveRef: Symbol("approveRequest"),
  rejectRef: Symbol("rejectRequest"),
  resendFailureRef: Symbol("resendFailure"),
  resolveFailureRef: Symbol("resolveFailure"),
  resendInvitationRef: Symbol("resendForOrganization"),
  revokeInvitationRef: Symbol("revokeForOrganization"),
  approve: vi.fn(),
  reject: vi.fn(),
  resendFailure: vi.fn(),
  resolveFailure: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("convex/react", () => ({ useMutation: mocks.useMutation }));
vi.mock("@/convex/_generated/api", () => ({
  api: {
    staffRegistration: {
      mutations: { approveRequest: mocks.approveRef, rejectRequest: mocks.rejectRef },
    },
    notificationOutbox: {
      mutations: { resendFailure: mocks.resendFailureRef, resolveFailure: mocks.resolveFailureRef },
    },
    organizationInvitation: {
      mutations: {
        resendForOrganization: mocks.resendInvitationRef,
        revokeForOrganization: mocks.revokeInvitationRef,
      },
    },
  },
}));

import { useActionInboxController } from "./useActionInboxController";

const organizationId = "organization-1" as Id<"organizations">;
const shopId = "shop-1" as Id<"shops">;
const sourceItems = createSourceItems();

beforeEach(() => {
  for (const mock of [
    mocks.navigate,
    mocks.useMutation,
    mocks.approve,
    mocks.reject,
    mocks.resendFailure,
    mocks.resolveFailure,
    mocks.resendInvitation,
    mocks.revokeInvitation,
    mocks.refresh,
  ]) {
    mock.mockReset();
  }
  mocks.useMutation.mockImplementation((reference: unknown) => {
    if (reference === mocks.approveRef) return mocks.approve;
    if (reference === mocks.rejectRef) return mocks.reject;
    if (reference === mocks.resendFailureRef) return mocks.resendFailure;
    if (reference === mocks.resolveFailureRef) return mocks.resolveFailure;
    if (reference === mocks.resendInvitationRef) return mocks.resendInvitation;
    if (reference === mocks.revokeInvitationRef) return mocks.revokeInvitation;
    throw new Error("Unexpected mutation reference");
  });
  mocks.approve.mockResolvedValue({});
  mocks.reject.mockResolvedValue({});
  mocks.resendFailure.mockResolvedValue({ scheduled: true });
  mocks.resolveFailure.mockResolvedValue({});
  mocks.resendInvitation.mockResolvedValue({});
  mocks.revokeInvitation.mockResolvedValue({});
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000001"),
  });
});

describe("useActionInboxController", () => {
  it("4種類のDTOを画面項目へ変換し、DTO由来のorg・shop・target IDを各操作へ渡す", async () => {
    const { result } = renderHook(() =>
      useActionInboxController({ organizationId, sourceItems, onRefresh: mocks.refresh }),
    );

    const shift = findItem(result.current.items, "shift");
    await runEnabledAction(getAction(shift.actions, "シフトを組む"));
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/shifts/$recruitmentId/board",
      params: { recruitmentId: "recruitment-1" },
      search: { org: organizationId },
    });

    const staff = findItem(result.current.items, "staff");
    await act(async () => runEnabledAction(getAction(staff.actions, "承認する")));
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({
      shopId,
      expectedOrganizationId: organizationId,
      requestId: "registration-1",
    });

    const notification = findItem(result.current.items, "notification");
    await act(async () => runEnabledAction(getAction(notification.actions, "再送する")));
    expect(mocks.resendFailure).toHaveBeenCalledExactlyOnceWith({
      shopId,
      expectedOrganizationId: organizationId,
      failureId: "failure-1",
    });

    const management = findItem(result.current.items, "management");
    expect(management.title).toBe("鈴木さんへの管理者招待が送れませんでした");
    await act(async () => runEnabledAction(getAction(management.actions, "再送する")));
    expect(mocks.resendInvitation).toHaveBeenCalledExactlyOnceWith({
      organizationId,
      invitationId: "invitation-1",
      requestId: "00000000-0000-4000-8000-000000000001",
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(3);
    expect(staff.actions.map((action) => action.label)).toEqual(["却下する", "承認する"]);
    expect(notification.actions.map((action) => action.label)).toEqual(["再送せず破棄する", "再送する"]);
  });

  it("確認が必要な操作は単一実行し、同じDTOのIDとscopeでmutationする", async () => {
    const { result } = renderHook(() =>
      useActionInboxController({ organizationId, sourceItems, onRefresh: mocks.refresh }),
    );
    const staff = findItem(result.current.items, "staff");

    act(() => {
      void runEnabledAction(getAction(staff.actions, "却下する"));
    });
    expect(result.current.confirmation).toEqual({
      kind: "rejectRegistration",
      itemId: "staffRegistration:registration-1",
      applicantName: "山田花子",
    });

    const confirm = result.current.confirm;
    await act(async () => Promise.all([confirm(), confirm()]));

    expect(mocks.reject).toHaveBeenCalledExactlyOnceWith({
      shopId,
      expectedOrganizationId: organizationId,
      requestId: "registration-1",
    });
    expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith();
    expect(result.current.completedItemId).toBe("staffRegistration:registration-1");
    expect(result.current.confirmation).toBeNull();
  });

  it("操作失敗時は確認対象を保持し、再取得で対象が消えたらDialogを閉じる", async () => {
    mocks.resolveFailure.mockRejectedValueOnce(new Error("failure remained open"));
    const { result, rerender } = renderHook(
      ({ items }) => useActionInboxController({ organizationId, sourceItems: items, onRefresh: mocks.refresh }),
      { initialProps: { items: sourceItems } },
    );
    const notification = findItem(result.current.items, "notification");

    act(() => {
      void runEnabledAction(getAction(notification.actions, "再送せず破棄する"));
    });
    await act(async () => result.current.confirm());

    expect(result.current.confirmation).toEqual({
      kind: "resolveNotification",
      itemId: "notificationFailure:failure-1",
      staffName: "田中",
      notificationKindLabel: "シフト募集通知",
    });
    expect(result.current.confirmationError).toBe("failure remained open");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(result.current.completedItemId).toBeNull();

    rerender({ items: sourceItems.filter((item) => item.kind !== "notificationFailure") });
    expect(result.current.confirmation).toBeNull();
    expect(result.current.confirmationError).toBeNull();
  });

  it("対象人数が安全な取得上限を超えた場合は確定した分母に見せない", () => {
    const overflowItems = sourceItems.map((item) =>
      item.kind === "shift"
        ? { ...item, responseCount: 999, totalStaffCount: 1000, totalStaffCountHasOverflow: true }
        : item,
    );
    const { result } = renderHook(() =>
      useActionInboxController({ organizationId, sourceItems: overflowItems, onRefresh: mocks.refresh }),
    );

    const shift = findItem(result.current.items, "shift");
    expect(shift.metadata.map((metadata) => metadata.label)).toContain("提出 999人 / 対象 1000人以上");
  });

  it("再送できない管理者招待でも、残存招待の取消は維持する", () => {
    const closedItems = sourceItems.map((item) =>
      item.kind === "managerInvitation" ? { ...item, canResend: false } : item,
    );
    const { result } = renderHook(() =>
      useActionInboxController({ organizationId, sourceItems: closedItems, onRefresh: mocks.refresh }),
    );

    const management = findItem(result.current.items, "management");
    expect(getAction(management.actions, "再送する")).toEqual({
      label: "再送する",
      emphasis: "primary",
      disabled: true,
      disabledReason: "管理者数、招待先、または契約状態を確認してください。",
    });
    expect(getAction(management.actions, "取り消す")).toMatchObject({
      label: "取り消す",
      emphasis: "danger",
    });
    expect(getAction(management.actions, "取り消す")).not.toHaveProperty("disabled");
  });

  it("スタッフ登録申請を承認できない理由を一覧の操作へ引き継ぐ", () => {
    const unavailableItems = sourceItems.map((item) =>
      item.kind === "staffRegistration"
        ? {
            ...item,
            canApprove: false,
            approveDisabledReason: "この申請は現在承認できません。不要な申請は却下できます。",
          }
        : item,
    );
    const { result } = renderHook(() =>
      useActionInboxController({ organizationId, sourceItems: unavailableItems, onRefresh: mocks.refresh }),
    );

    const staff = findItem(result.current.items, "staff");
    expect(getAction(staff.actions, "承認する")).toEqual({
      label: "承認する",
      emphasis: "primary",
      disabled: true,
      disabledReason: "この申請は現在承認できません。不要な申請は却下できます。",
    });
  });

  it("追加pageの操作は成功時だけ再取得し、失敗時は表示対象を保持する", async () => {
    const registration = sourceItems.find((item) => item.kind === "staffRegistration");
    if (!registration) throw new Error("Missing staff registration");
    const { result, rerender } = renderHook(
      ({ items }) => useActionInboxController({ organizationId, sourceItems: items, onRefresh: mocks.refresh }),
      { initialProps: { items: [registration] as readonly ActionInboxSourceItem[] } },
    );

    mocks.approve.mockRejectedValueOnce(new Error("approval failed"));
    const failedAction = getAction(findItem(result.current.items, "staff").actions, "承認する");
    await expect(act(async () => runEnabledAction(failedAction))).rejects.toThrow("approval failed");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(findItem(result.current.items, "staff").id).toBe(registration.id);

    await act(async () => runEnabledAction(getAction(findItem(result.current.items, "staff").actions, "承認する")));
    expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith();

    rerender({ items: [] });
    expect(result.current.items).toEqual([]);
  });
});

function findItem(
  items: ReturnType<typeof useActionInboxController>["items"],
  category: "shift" | "staff" | "notification" | "management",
) {
  const item = items.find((candidate) => candidate.category === category);
  if (!item) throw new Error(`Missing ${category} item`);
  return item;
}

async function runEnabledAction(action: ActionInboxAction) {
  if (action.disabled) throw new Error(`${action.label} is disabled`);
  await action.onClick();
}

function getAction(actions: readonly ActionInboxAction[], label: string) {
  const action = actions.find((candidate) => candidate.label === label);
  if (!action) throw new Error(`Missing ${label} action`);
  return action;
}

function createSourceItems(): readonly ActionInboxSourceItem[] {
  const scope = { kind: "shop" as const, organizationId, shopId };
  return [
    {
      id: "shift:recruitment-1",
      kind: "shift",
      scope,
      recruitmentId: "recruitment-1" as Id<"recruitments">,
      shopName: "yn1323店舗",
      periodStart: "2026-08-17",
      periodEnd: "2026-08-24",
      deadline: "2026-08-12",
      responseCount: 2,
      totalStaffCount: 3,
      occurredAt: 1,
    },
    {
      id: "staffRegistration:registration-1",
      kind: "staffRegistration",
      scope,
      requestId: "registration-1" as Id<"staffRegistrationRequests">,
      shopName: "yn1323店舗",
      applicantName: "山田花子",
      createdAt: 2,
      canApprove: true,
      approveDisabledReason: null,
      canReject: true,
      occurredAt: 2,
    },
    {
      id: "notificationFailure:failure-1",
      kind: "notificationFailure",
      scope,
      failureId: "failure-1" as Id<"notificationFailureInbox">,
      shopName: "yn1323店舗",
      staffName: "田中",
      notificationKindLabel: "シフト募集通知",
      channel: "email",
      lastFailedAt: 3,
      canRetry: true,
      canResolve: true,
      occurredAt: 3,
    },
    {
      id: "managerInvitation:invitation-1",
      kind: "managerInvitation",
      scope: { kind: "organization", organizationId },
      invitationId: "invitation-1" as Id<"organizationInvitations">,
      inviteeName: "鈴木",
      invitedEmail: "suzuki@example.com",
      status: "sendFailed",
      expiresAt: 4,
      canResend: true,
      canRevoke: true,
      occurredAt: 4,
    },
  ];
}
