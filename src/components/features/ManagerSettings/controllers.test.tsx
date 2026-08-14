// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ReadyManagerSettingsOverview } from "./types";

const mocks = vi.hoisted(() => ({
  issueRef: Symbol("issue"),
  resendRef: Symbol("resend"),
  revokeRef: Symbol("revoke"),
  removeManagerRoleRef: Symbol("removeManagerRole"),
  issueForOrganizationRef: Symbol("issueForOrganization"),
  resendForOrganizationRef: Symbol("resendForOrganization"),
  revokeForOrganizationRef: Symbol("revokeForOrganization"),
  removeManagerRoleForOrganizationRef: Symbol("removeManagerRoleForOrganization"),
  issue: vi.fn(),
  resend: vi.fn(),
  revoke: vi.fn(),
  removeManagerRole: vi.fn(),
  navigate: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  randomUUID: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    organizationInvitation: {
      mutations: {
        issue: mocks.issueRef,
        resend: mocks.resendRef,
        revoke: mocks.revokeRef,
        issueForOrganization: mocks.issueForOrganizationRef,
        resendForOrganization: mocks.resendForOrganizationRef,
        revokeForOrganization: mocks.revokeForOrganizationRef,
      },
    },
    organization: {
      mutations: {
        removeManagerRole: mocks.removeManagerRoleRef,
        removeManagerRoleForOrganization: mocks.removeManagerRoleForOrganizationRef,
      },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: symbol) => {
    if (reference === mocks.issueForOrganizationRef) return mocks.issue;
    if (reference === mocks.resendForOrganizationRef) return mocks.resend;
    if (reference === mocks.revokeForOrganizationRef) return mocks.revoke;
    if (reference === mocks.removeManagerRoleForOrganizationRef) return mocks.removeManagerRole;
    throw new Error("Unexpected organization mutation reference");
  },
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));

vi.mock("@/src/hooks/useShopMutation", () => ({
  useShopMutation: (reference: symbol) => {
    if (reference === mocks.issueRef) return mocks.issue;
    if (reference === mocks.resendRef) return mocks.resend;
    if (reference === mocks.revokeRef) return mocks.revoke;
    if (reference === mocks.removeManagerRoleRef) return mocks.removeManagerRole;
    throw new Error("Unexpected mutation reference");
  },
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

import { useManagerIssueController } from "./useManagerIssueController";
import { useManagerSettingsController } from "./useManagerSettingsController";

const shopId = "shop-current";
const managerPersonId = "person-manager" as Id<"organizationPeople">;
const candidatePersonId = "person-candidate" as Id<"organizationPeople">;
const invitationId = "invitation-current" as Id<"organizationInvitations">;
const requestIds = [
  "2b79a222-176c-44d6-9b39-d090c1f72efb",
  "ec0e5a86-c413-401d-af1f-e2dd654124c4",
  "0ea14611-430f-4870-a96c-41f001d31086",
] as const;

const overview: ReadyManagerSettingsOverview = {
  kind: "ready",
  organizationName: "さくらダイニング",
  mode: "managerAddition",
  usage: {
    activeManagers: 2,
    activeInvitationCount: 1,
    pendingAdditions: 1,
    pendingExchanges: 0,
    projectedManagers: 3,
    maxManagers: 5,
  },
  actions: {
    canInviteExistingStaff: true,
    canInviteExternal: true,
  },
  managers: [
    {
      personId: managerPersonId,
      name: "田中 太郎",
      contactEmail: "tanaka@example.com",
      role: "active",
      isSelf: false,
      canRemoveRole: true,
    },
  ],
  invitations: [
    {
      invitationId,
      name: "山田 美咲",
      invitedEmail: "yamada@example.com",
      purpose: "managerAddition",
      status: "pending",
      expiresAt: Date.UTC(2026, 7, 20),
      canResend: true,
      canRevoke: true,
    },
  ],
};

const candidate = {
  personId: candidatePersonId,
  name: "佐藤 花子",
  contactEmail: "sato@example.com",
  canSelect: true,
};

beforeEach(() => {
  for (const mock of [
    mocks.issue,
    mocks.resend,
    mocks.revoke,
    mocks.removeManagerRole,
    mocks.navigate,
    mocks.showErrorToast,
    mocks.showSuccessToast,
    mocks.randomUUID,
  ]) {
    mock.mockReset();
  }
  mocks.issue.mockResolvedValue({ status: "issued", invitationId });
  mocks.resend.mockResolvedValue({ status: "issued", invitationId });
  mocks.revoke.mockResolvedValue({ changed: true });
  mocks.removeManagerRole.mockResolvedValue({ changed: true });
  mocks.randomUUID.mockImplementation(() => requestIds[0]);
  vi.stubGlobal("crypto", { randomUUID: mocks.randomUUID });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useManagerSettingsController", () => {
  it("app管理者操作は明示organizationIdを送り、selectedShopを認可anchorにしない", async () => {
    const organizationId = "organization-app" as Id<"organizations">;
    const { result } = renderHook(() => useManagerSettingsController({ overview, organizationId }));

    act(() => result.current.onRequestResend(overview.invitations[0]));
    act(() => result.current.onConfirm());

    await waitFor(() =>
      expect(mocks.resend).toHaveBeenCalledExactlyOnceWith({
        organizationId,
        invitationId,
        requestId: requestIds[0],
      }),
    );
  });

  it("旧backendが交代招待を再送可能として返しても再送を開始しない", () => {
    const legacyInvitation = {
      ...overview.invitations[0],
      purpose: "freeManagerExchange" as const,
      canResend: true,
    };
    const legacyOverview: ReadyManagerSettingsOverview = {
      ...overview,
      invitations: [legacyInvitation],
    };
    const { result } = renderHook(() => useManagerSettingsController({ overview: legacyOverview, shopId }));

    act(() => result.current.onRequestResend(legacyInvitation));

    expect(result.current.confirmation).toBeNull();
    expect(mocks.resend).not.toHaveBeenCalled();
  });

  it("通信失敗後の再送は同じrequestIdを保ち、別の操作意図では更新する", async () => {
    const error = new ConvexError("操作結果を確認できませんでした。");
    mocks.randomUUID.mockReturnValueOnce(requestIds[0]).mockReturnValueOnce(requestIds[1]);
    mocks.resend.mockRejectedValueOnce(error).mockResolvedValueOnce({ status: "issued", invitationId });
    const { result } = renderHook(() => useManagerSettingsController({ overview, shopId }));

    act(() => result.current.onRequestResend(overview.invitations[0]));
    expect(result.current.confirmation).toMatchObject({ kind: "resend", requestId: requestIds[0] });

    act(() => result.current.onConfirm());
    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error));
    expect(result.current.confirmation).toMatchObject({ kind: "resend", requestId: requestIds[0] });

    act(() => result.current.onConfirm());
    await waitFor(() => expect(mocks.resend).toHaveBeenCalledTimes(2));
    expect(mocks.resend.mock.calls).toEqual([
      [{ invitationId, requestId: requestIds[0] }],
      [{ invitationId, requestId: requestIds[0] }],
    ]);

    act(() => result.current.onRequestRevoke(overview.invitations[0]));
    expect(result.current.confirmation).toMatchObject({ kind: "revoke", requestId: requestIds[1] });
  });

  it("確定の連打ではmutationを一度だけ開始する", async () => {
    let resolveMutation: (() => void) | undefined;
    mocks.revoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutation = () => resolve({ changed: true });
        }),
    );
    const { result } = renderHook(() => useManagerSettingsController({ overview, shopId }));

    act(() => result.current.onRequestRevoke(overview.invitations[0]));
    act(() => {
      result.current.onConfirm();
      result.current.onConfirm();
    });

    await waitFor(() =>
      expect(mocks.revoke).toHaveBeenCalledExactlyOnceWith({ invitationId, requestId: requestIds[0] }),
    );
    await act(async () => resolveMutation?.());
    await waitFor(() => expect(result.current.confirmation).toBeNull());
  });

  it("自己の管理者権限を外した後は店舗指定を消してDashboardへ戻る", async () => {
    const selfOverview: ReadyManagerSettingsOverview = {
      ...overview,
      managers: [{ ...overview.managers[0], isSelf: true }],
    };
    const { result } = renderHook(() => useManagerSettingsController({ overview: selfOverview, shopId }));

    act(() => result.current.onRequestRemoveRole(selfOverview.managers[0]));
    act(() => result.current.onConfirm());

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
        to: "/dashboard",
        search: { shop: undefined },
        replace: true,
      }),
    );
    expect(mocks.removeManagerRole).toHaveBeenCalledExactlyOnceWith({
      personId: managerPersonId,
      requestId: requestIds[0],
    });
  });

  it("確認後にcapabilityを失った古いcallbackではmutationを呼ばない", async () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: ReadyManagerSettingsOverview }) => useManagerSettingsController({ overview: value, shopId }),
      { initialProps: { value: overview } },
    );
    act(() => result.current.onRequestResend(overview.invitations[0]));
    const staleConfirm = result.current.onConfirm;

    rerender({
      value: {
        ...overview,
        invitations: [{ ...overview.invitations[0], canResend: false }],
      },
    });
    await waitFor(() => expect(result.current.confirmation).toBeNull());
    act(() => staleConfirm());

    await waitFor(() => expect(mocks.resend).not.toHaveBeenCalled());
  });
});

describe("useManagerIssueController", () => {
  it("app管理者招待は明示organizationIdを送り、成功後もorgを保持する", async () => {
    const organizationId = "organization-app" as Id<"organizations">;
    const { result } = renderHook(() => useManagerIssueController({ overview, organizationId }));

    act(() => result.current.onRequestExistingStaff(candidate));
    act(() => result.current.onConfirm());

    await waitFor(() =>
      expect(mocks.issue).toHaveBeenCalledExactlyOnceWith({
        organizationId,
        recipient: { kind: "existingStaff", personId: candidatePersonId },
        requestId: requestIds[0],
      }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/app/manage/managers",
      search: { org: organizationId },
      replace: true,
    });
  });

  it("旧backendのFree交代modeではaction capabilityがtrueでも新しい招待を開始しない", () => {
    const legacyOverview: ReadyManagerSettingsOverview = {
      ...overview,
      mode: "freeManagerExchange",
      actions: { canInviteExistingStaff: true, canInviteExternal: true },
    };
    const { result } = renderHook(() => useManagerIssueController({ overview: legacyOverview, shopId }));

    act(() => result.current.onRequestExistingStaff(candidate));
    expect(result.current.confirmation).toBeNull();
    act(() => result.current.onRequestExternal("旧方式候補", "legacy@example.com"));
    expect(result.current.confirmation).toBeNull();
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("招待は通信失敗後も同じrequestIdで再試行し、別の招待意図では更新する", async () => {
    const error = new ConvexError("操作結果を確認できませんでした。");
    mocks.randomUUID.mockReturnValueOnce(requestIds[0]).mockReturnValueOnce(requestIds[1]);
    mocks.issue.mockRejectedValueOnce(error).mockResolvedValueOnce({ status: "issued", invitationId });
    const { result } = renderHook(() => useManagerIssueController({ overview, shopId }));

    act(() => result.current.onRequestExistingStaff(candidate));
    expect(result.current.confirmation).toMatchObject({ kind: "existingStaff", requestId: requestIds[0] });
    act(() => result.current.onConfirm());
    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error));

    act(() => result.current.onConfirm());
    await waitFor(() => expect(mocks.issue).toHaveBeenCalledTimes(2));
    expect(mocks.issue.mock.calls).toEqual([
      [{ recipient: { kind: "existingStaff", personId: candidatePersonId }, requestId: requestIds[0] }],
      [{ recipient: { kind: "existingStaff", personId: candidatePersonId }, requestId: requestIds[0] }],
    ]);

    act(() => result.current.onRequestExternal("本部 担当", "office@example.com"));
    expect(result.current.confirmation).toMatchObject({
      kind: "external",
      invitedName: "本部 担当",
      email: "office@example.com",
      requestId: requestIds[1],
    });
  });

  it("招待確定の連打ではmutationを一度だけ開始する", async () => {
    let resolveMutation: (() => void) | undefined;
    mocks.issue.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutation = () => resolve({ status: "issued", invitationId });
        }),
    );
    const { result } = renderHook(() => useManagerIssueController({ overview, shopId }));

    act(() => result.current.onRequestExistingStaff(candidate));
    act(() => {
      result.current.onConfirm();
      result.current.onConfirm();
    });

    await waitFor(() =>
      expect(mocks.issue).toHaveBeenCalledExactlyOnceWith({
        recipient: { kind: "existingStaff", personId: candidatePersonId },
        requestId: requestIds[0],
      }),
    );
    await act(async () => resolveMutation?.());
    await waitFor(() => expect(result.current.confirmation).toBeNull());
  });

  it("既存スタッフの確認後に招待権限を失った古いcallbackではmutationを呼ばない", async () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: ReadyManagerSettingsOverview }) => useManagerIssueController({ overview: value, shopId }),
      { initialProps: { value: overview } },
    );
    act(() => result.current.onRequestExistingStaff(candidate));
    const staleConfirm = result.current.onConfirm;

    rerender({
      value: {
        ...overview,
        actions: { ...overview.actions, canInviteExistingStaff: false },
      },
    });
    await waitFor(() => expect(result.current.confirmation).toBeNull());
    act(() => staleConfirm());

    await waitFor(() => expect(mocks.issue).not.toHaveBeenCalled());
  });

  it("既存スタッフの確認後に追加方式が変わった古いcallbackではmutationを呼ばない", async () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: ReadyManagerSettingsOverview }) => useManagerIssueController({ overview: value, shopId }),
      { initialProps: { value: overview } },
    );
    act(() => result.current.onRequestExistingStaff(candidate));
    const staleConfirm = result.current.onConfirm;

    rerender({ value: { ...overview, mode: "freeManagerExchange" } });
    await waitFor(() => expect(result.current.confirmation).toBeNull());
    act(() => staleConfirm());

    await waitFor(() => expect(mocks.issue).not.toHaveBeenCalled());
  });

  it("外部管理者の確認後に招待権限を失った古いcallbackではmutationを呼ばない", async () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: ReadyManagerSettingsOverview }) => useManagerIssueController({ overview: value, shopId }),
      { initialProps: { value: overview } },
    );
    act(() => result.current.onRequestExternal("本部 担当", "office@example.com"));
    const staleConfirm = result.current.onConfirm;

    rerender({
      value: {
        ...overview,
        actions: { ...overview.actions, canInviteExternal: false },
      },
    });
    await waitFor(() => expect(result.current.confirmation).toBeNull());
    act(() => staleConfirm());

    await waitFor(() => expect(mocks.issue).not.toHaveBeenCalled());
  });
});
