// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ReadyManagerSettingsOverview } from "./types";

const mocks = vi.hoisted(() => ({
  issueForOrganizationRef: Symbol("issueForOrganization"),
  resendForOrganizationRef: Symbol("resendForOrganization"),
  revokeForOrganizationRef: Symbol("revokeForOrganization"),
  removeManagerRoleForOrganizationRef: Symbol("removeManagerRoleForOrganization"),
  issue: vi.fn(),
  resend: vi.fn(),
  revoke: vi.fn(),
  removeManagerRole: vi.fn(),
  navigate: vi.fn(),
  historyBack: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  randomUUID: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    organizationInvitation: {
      mutations: {
        issueForOrganization: mocks.issueForOrganizationRef,
        resendForOrganization: mocks.resendForOrganizationRef,
        revokeForOrganization: mocks.revokeForOrganizationRef,
      },
    },
    organization: {
      mutations: {
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

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { back: mocks.historyBack } }),
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

import { useManagerIssueController } from "./useManagerIssueController";
import { useManagerSettingsController } from "./useManagerSettingsController";

const organizationId = "organization-app" as Id<"organizations">;
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
  usage: {
    activeManagers: 2,
    activeInvitationCount: 1,
    pendingAdditions: 1,
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
    mocks.historyBack,
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

  it("管理者設定のタイトル戻るは固定の組織設定へ遷移せず履歴へ戻る", () => {
    const { result } = renderHook(() => useManagerSettingsController({ overview, organizationId }));

    act(() => result.current.onBack());

    expect(mocks.historyBack).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("通信失敗後の再送は同じrequestIdを保ち、別の操作意図では更新する", async () => {
    const error = new ConvexError("操作結果を確認できませんでした。");
    mocks.randomUUID.mockReturnValueOnce(requestIds[0]).mockReturnValueOnce(requestIds[1]);
    mocks.resend.mockRejectedValueOnce(error).mockResolvedValueOnce({ status: "issued", invitationId });
    const { result } = renderHook(() => useManagerSettingsController({ overview, organizationId }));

    act(() => result.current.onRequestResend(overview.invitations[0]));
    expect(result.current.confirmation).toMatchObject({ kind: "resend", requestId: requestIds[0] });

    act(() => result.current.onConfirm());
    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error));
    expect(result.current.confirmation).toMatchObject({ kind: "resend", requestId: requestIds[0] });

    act(() => result.current.onConfirm());
    await waitFor(() => expect(mocks.resend).toHaveBeenCalledTimes(2));
    expect(mocks.resend.mock.calls).toEqual([
      [{ organizationId, invitationId, requestId: requestIds[0] }],
      [{ organizationId, invitationId, requestId: requestIds[0] }],
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
    const { result } = renderHook(() => useManagerSettingsController({ overview, organizationId }));

    act(() => result.current.onRequestRevoke(overview.invitations[0]));
    act(() => {
      result.current.onConfirm();
      result.current.onConfirm();
    });

    await waitFor(() =>
      expect(mocks.revoke).toHaveBeenCalledExactlyOnceWith({ organizationId, invitationId, requestId: requestIds[0] }),
    );
    await act(async () => resolveMutation?.());
    await waitFor(() => expect(result.current.confirmation).toBeNull());
  });

  it("自己の管理者権限を外した後は店舗指定を消してDashboardへ戻る", async () => {
    const selfOverview: ReadyManagerSettingsOverview = {
      ...overview,
      managers: [{ ...overview.managers[0], isSelf: true }],
    };
    const { result } = renderHook(() => useManagerSettingsController({ overview: selfOverview, organizationId }));

    act(() => result.current.onRequestRemoveRole(selfOverview.managers[0]));
    act(() => result.current.onConfirm());

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
        to: "/dashboard",
        search: {},
        replace: true,
      }),
    );
    expect(mocks.removeManagerRole).toHaveBeenCalledExactlyOnceWith({
      personId: managerPersonId,
      organizationId,
      requestId: requestIds[0],
    });
  });

  it("確認後にcapabilityを失った古いcallbackではmutationを呼ばない", async () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: ReadyManagerSettingsOverview }) =>
        useManagerSettingsController({ overview: value, organizationId }),
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
  it("既存スタッフの管理者招待はSubmit直後に明示organizationIdを送り、成功後もorgを保持する", async () => {
    const { result } = renderHook(() => useManagerIssueController({ overview, organizationId }));

    act(() => result.current.onRequestExistingStaff(candidate));

    await waitFor(() =>
      expect(mocks.issue).toHaveBeenCalledExactlyOnceWith({
        organizationId,
        recipient: { kind: "existingStaff", personId: candidatePersonId },
        requestId: requestIds[0],
      }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manage/managers",
      search: { org: organizationId },
      replace: true,
    });
  });

  it("既存スタッフ招待の成功では完了callbackを呼び、ページ遷移しない", async () => {
    const onCompleted = vi.fn();
    const { result } = renderHook(() => useManagerIssueController({ overview, organizationId, onCompleted }));

    act(() => result.current.onRequestExistingStaff(candidate));

    await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("外部管理者招待は確認画面を挟まずSubmit直後にmutationを呼ぶ", async () => {
    const onCompleted = vi.fn();
    const { result } = renderHook(() => useManagerIssueController({ overview, organizationId, onCompleted }));

    act(() => result.current.onRequestExternal("本部 担当", "office@example.com"));

    await waitFor(() =>
      expect(mocks.issue).toHaveBeenCalledExactlyOnceWith({
        organizationId,
        recipient: { kind: "external", invitedName: "本部 担当", email: "office@example.com" },
        requestId: requestIds[0],
      }),
    );
    await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
  });

  it("既存スタッフ招待は通信失敗後も同じrequestIdで再試行する", async () => {
    const error = new ConvexError("操作結果を確認できませんでした。");
    mocks.randomUUID.mockReturnValueOnce(requestIds[0]);
    mocks.issue.mockRejectedValueOnce(error).mockResolvedValueOnce({ status: "issued", invitationId });
    const { result } = renderHook(() => useManagerIssueController({ overview, organizationId }));

    act(() => result.current.onRequestExistingStaff(candidate));
    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error));

    act(() => result.current.onRequestExistingStaff(candidate));
    await waitFor(() => expect(mocks.issue).toHaveBeenCalledTimes(2));
    expect(mocks.issue.mock.calls).toEqual([
      [
        {
          organizationId,
          recipient: { kind: "existingStaff", personId: candidatePersonId },
          requestId: requestIds[0],
        },
      ],
      [
        {
          organizationId,
          recipient: { kind: "existingStaff", personId: candidatePersonId },
          requestId: requestIds[0],
        },
      ],
    ]);
  });

  it("外部管理者招待は通信失敗後も同じ内容なら同じrequestIdで再試行する", async () => {
    const error = new ConvexError("操作結果を確認できませんでした。");
    mocks.issue.mockRejectedValueOnce(error).mockResolvedValueOnce({ status: "issued", invitationId });
    const { result } = renderHook(() => useManagerIssueController({ overview, organizationId }));

    act(() => result.current.onRequestExternal("本部 担当", "office@example.com"));
    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error));

    act(() => result.current.onRequestExternal("本部 担当", "office@example.com"));
    await waitFor(() => expect(mocks.issue).toHaveBeenCalledTimes(2));
    expect(mocks.issue.mock.calls).toEqual([
      [
        {
          organizationId,
          recipient: { kind: "external", invitedName: "本部 担当", email: "office@example.com" },
          requestId: requestIds[0],
        },
      ],
      [
        {
          organizationId,
          recipient: { kind: "external", invitedName: "本部 担当", email: "office@example.com" },
          requestId: requestIds[0],
        },
      ],
    ]);
  });

  it("既存スタッフ招待の連打ではmutationを一度だけ開始する", async () => {
    let resolveMutation: (() => void) | undefined;
    mocks.issue.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutation = () => resolve({ status: "issued", invitationId });
        }),
    );
    const { result } = renderHook(() => useManagerIssueController({ overview, organizationId }));

    act(() => {
      result.current.onRequestExistingStaff(candidate);
      result.current.onRequestExistingStaff(candidate);
    });

    await waitFor(() =>
      expect(mocks.issue).toHaveBeenCalledExactlyOnceWith({
        organizationId,
        recipient: { kind: "existingStaff", personId: candidatePersonId },
        requestId: requestIds[0],
      }),
    );
    await act(async () => resolveMutation?.());
  });

  it("既存スタッフ招待は権限を失ったSubmitでmutationを呼ばない", async () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: ReadyManagerSettingsOverview }) =>
        useManagerIssueController({ overview: value, organizationId }),
      { initialProps: { value: overview } },
    );
    const submit = result.current.onRequestExistingStaff;

    rerender({
      value: {
        ...overview,
        actions: { ...overview.actions, canInviteExistingStaff: false },
      },
    });
    act(() => submit(candidate));

    await waitFor(() => expect(mocks.issue).not.toHaveBeenCalled());
  });

  it("外部管理者招待は権限を失ったSubmitでmutationを呼ばない", async () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: ReadyManagerSettingsOverview }) =>
        useManagerIssueController({ overview: value, organizationId }),
      { initialProps: { value: overview } },
    );

    rerender({
      value: {
        ...overview,
        actions: { ...overview.actions, canInviteExternal: false },
      },
    });
    act(() => result.current.onRequestExternal("本部 担当", "office@example.com"));

    await waitFor(() => expect(mocks.issue).not.toHaveBeenCalled());
  });
});
