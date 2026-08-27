// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockEmailAddress = {
  emailAddress: string;
  verification: { status: "unverified" | "verified" };
  prepareVerification: ReturnType<typeof vi.fn>;
  attemptVerification: ReturnType<typeof vi.fn>;
};

type CapturedState = {
  kind: string;
  step?: string;
  errorMessage?: string | null;
  infoMessage?: string | null;
  hasDestination?: boolean;
  isRetrying?: boolean;
};

type CapturedActions = {
  onAccept: () => void | Promise<void>;
  onStartVerification: (email: string) => void | Promise<void>;
  onVerifyCode: (values: { code: string }) => void | Promise<void>;
  onResendCode: () => void | Promise<void>;
  onGoToDashboard: () => void | Promise<void>;
};

const mocks = vi.hoisted(() => ({
  acceptAction: Symbol("acceptInvitation"),
  previewQuery: Symbol("getPreview"),
  shopsQuery: Symbol("getMyShops"),
  acceptInvitation: vi.fn(),
  navigate: vi.fn(),
  useAction: vi.fn(),
  useQuery: vi.fn(),
  runWithReverification: vi.fn(),
  isReverificationCancelledError: vi.fn(),
  preview: {
    status: "ready",
    organizationName: "さくらダイニング",
    expiresAt: Date.UTC(2026, 6, 23, 9),
  },
  shops: [] as Array<Record<string, unknown>>,
  user: {
    emailAddresses: [] as MockEmailAddress[],
    reload: vi.fn(),
    createEmailAddress: vi.fn(),
  },
  latestState: null as CapturedState | null,
  latestActions: null as CapturedActions | null,
}));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  useUser: () => ({ isLoaded: true, user: mocks.user }),
  useReverification:
    (operation: (...args: unknown[]) => Promise<unknown>) =>
    (...args: unknown[]) =>
      mocks.runWithReverification(operation, args),
}));

vi.mock("@clerk/react/errors", () => ({
  isReverificationCancelledError: mocks.isReverificationCancelledError,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("convex/react", () => ({
  useAction: mocks.useAction,
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: mocks.useQuery,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    dashboard: { queries: { getMyShops: mocks.shopsQuery } },
    organizationInvitation: {
      acceptanceActions: { accept: mocks.acceptAction },
      queries: { getPreview: mocks.previewQuery },
    },
  },
}));

vi.mock("./ManagerInvitationAcceptanceView", () => ({
  ManagerInvitationAcceptanceView: ({ state, actions }: { state: CapturedState; actions: CapturedActions }) => {
    mocks.latestState = state;
    mocks.latestActions = actions;
    return (
      <div>
        <output data-testid="state-kind">{state.kind}</output>
        <output data-testid="state-step">{state.step ?? ""}</output>
        <output data-testid="state-error">{state.errorMessage ?? ""}</output>
        <output data-testid="state-info">{state.infoMessage ?? ""}</output>
        <button type="button" onClick={() => void actions.onAccept()}>
          招待を再確認
        </button>
        <button type="button" onClick={() => void actions.onStartVerification("invite@example.com")}>
          招待先メールを確認
        </button>
        <button type="button" onClick={() => void actions.onVerifyCode({ code: "123456" })}>
          コードを確認
        </button>
        <button type="button" onClick={() => void actions.onResendCode()}>
          コードを再送
        </button>
        <button type="button" onClick={() => void actions.onGoToDashboard()}>
          ダッシュボードへ
        </button>
      </div>
    );
  },
}));

import { ManagerInvitationAcceptance } from ".";

function createEmailAddress(emailAddress: string, status: "unverified" | "verified" = "unverified") {
  const resource: MockEmailAddress = {
    emailAddress,
    verification: { status },
    prepareVerification: vi.fn(),
    attemptVerification: vi.fn(),
  };
  resource.prepareVerification.mockResolvedValue(resource);
  resource.attemptVerification.mockResolvedValue(resource);
  return resource;
}

beforeEach(() => {
  mocks.acceptInvitation.mockReset();
  mocks.navigate.mockReset();
  mocks.useAction.mockReset();
  mocks.useQuery.mockReset();
  mocks.runWithReverification.mockReset();
  mocks.isReverificationCancelledError.mockReset();
  mocks.user.reload.mockReset();
  mocks.user.createEmailAddress.mockReset();
  mocks.user.emailAddresses = [];
  mocks.shops = [];
  mocks.latestState = null;
  mocks.latestActions = null;

  mocks.useAction.mockReturnValue(mocks.acceptInvitation);
  mocks.useQuery.mockImplementation((query) => {
    if (query === mocks.previewQuery) return mocks.preview;
    if (query === mocks.shopsQuery) return mocks.shops;
    throw new Error("Unexpected query");
  });
  mocks.runWithReverification.mockImplementation(
    async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => operation(...args),
  );
  mocks.isReverificationCancelledError.mockReturnValue(false);
  mocks.user.reload.mockResolvedValue(mocks.user);
});

describe("ManagerInvitationAcceptance controller", () => {
  it("招待tokenだけをNode actionへ渡し、確認が必要ならメール入力へ進む", async () => {
    mocks.acceptInvitation.mockResolvedValue({ status: "verificationRequired" });

    render(<ManagerInvitationAcceptance token="invitation-token" />);

    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("verificationRequired"));
    expect(screen.getByTestId("state-step").textContent).toBe("input");
    expect(mocks.useAction).toHaveBeenCalledWith(mocks.acceptAction);
    expect(mocks.acceptInvitation).toHaveBeenCalledOnce();
    expect(mocks.acceptInvitation).toHaveBeenCalledWith({ token: "invitation-token" });
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.shopsQuery, { planIdVersion: 2 });
  });

  it("同じ未確認メールがClerk Userにあれば再作成せず、確認コード送信を再開する", async () => {
    const emailAddress = createEmailAddress("Invite@Example.com");
    mocks.user.emailAddresses = [emailAddress];
    mocks.acceptInvitation.mockResolvedValue({ status: "verificationRequired" });

    render(<ManagerInvitationAcceptance token="invitation-token" />);
    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("verificationRequired"));

    fireEvent.click(screen.getByRole("button", { name: "招待先メールを確認" }));
    await waitFor(() => expect(screen.getByTestId("state-step").textContent).toBe("code"));
    expect(mocks.user.createEmailAddress).not.toHaveBeenCalled();
    expect(emailAddress.prepareVerification).toHaveBeenCalledWith({ strategy: "email_code" });

    fireEvent.click(screen.getByRole("button", { name: "コードを再送" }));
    await waitFor(() => expect(screen.getByTestId("state-info").textContent).toBe("確認コードを再送しました。"));
    expect(emailAddress.prepareVerification).toHaveBeenCalledTimes(2);
  });

  it("新しいメールを再認証付きで追加し、コード確認後にUserをreloadしてactionを再実行する", async () => {
    const unverifiedEmail = createEmailAddress("invite@example.com");
    const verifiedEmail = createEmailAddress("invite@example.com", "verified");
    unverifiedEmail.attemptVerification.mockResolvedValue(verifiedEmail);
    mocks.user.createEmailAddress.mockResolvedValue(unverifiedEmail);
    mocks.acceptInvitation
      .mockResolvedValueOnce({ status: "verificationRequired" })
      .mockResolvedValueOnce({ status: "linked", organizationId: "organization-id" });

    render(<ManagerInvitationAcceptance token="invitation-token" />);
    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("verificationRequired"));

    fireEvent.click(screen.getByRole("button", { name: "招待先メールを確認" }));
    await waitFor(() => expect(screen.getByTestId("state-step").textContent).toBe("code"));
    expect(mocks.runWithReverification).toHaveBeenCalledOnce();
    expect(mocks.user.createEmailAddress).toHaveBeenCalledWith({ email: "invite@example.com" });

    fireEvent.click(screen.getByRole("button", { name: "コードを確認" }));
    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("accepted"));
    expect(unverifiedEmail.attemptVerification).toHaveBeenCalledWith({ code: "123456" });
    expect(mocks.user.reload).toHaveBeenCalledTimes(2);
    expect(mocks.acceptInvitation).toHaveBeenCalledTimes(2);
    expect(mocks.acceptInvitation).toHaveBeenNthCalledWith(2, { token: "invitation-token" });
  });

  it("入力した確認済みメールが招待先と異なる場合も、actionの拒否を維持して再入力を案内する", async () => {
    mocks.user.emailAddresses = [createEmailAddress("invite@example.com", "verified")];
    mocks.acceptInvitation.mockResolvedValue({ status: "verificationRequired" });

    render(<ManagerInvitationAcceptance token="invitation-token" />);
    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("verificationRequired"));

    fireEvent.click(screen.getByRole("button", { name: "招待先メールを確認" }));
    await waitFor(() => expect(mocks.acceptInvitation).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("state-kind").textContent).toBe("verificationRequired");
    expect(screen.getByTestId("state-step").textContent).toBe("input");
    expect(screen.getByTestId("state-error").textContent).toContain(
      "入力したメールアドレスを招待先として確認できませんでした",
    );
  });

  it.each([
    {
      failure: "transport例外",
      arrangeFailure: () => mocks.acceptInvitation.mockRejectedValueOnce(new Error("temporary failure")),
    },
    {
      failure: "再試行可能なunavailable応答",
      arrangeFailure: () => mocks.acceptInvitation.mockResolvedValueOnce({ status: "unavailable", retryable: true }),
    },
  ])("$failureでは自動再試行せず、利用者の再試行で受諾できる", async ({ arrangeFailure }) => {
    arrangeFailure();
    mocks.acceptInvitation.mockResolvedValueOnce({
      status: "linked",
      organizationId: "organization-invited",
      shopId: "shop-invited",
    });

    render(<ManagerInvitationAcceptance token="invitation-token" />);

    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("retryableError"));
    expect(mocks.latestState).toMatchObject({ kind: "retryableError", isRetrying: false });
    expect(mocks.acceptInvitation).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "招待を再確認" }));

    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("accepted"));
    expect(mocks.acceptInvitation).toHaveBeenCalledTimes(2);
    expect(mocks.acceptInvitation.mock.calls).toEqual([
      [{ token: "invitation-token" }],
      [{ token: "invitation-token" }],
    ]);
  });

  it("受諾した店舗が所属一覧へ現れたら、その店舗を選択してDashboardへ遷移する", async () => {
    mocks.acceptInvitation.mockResolvedValue({
      status: "linked",
      organizationId: "organization-invited",
      shopId: "shop-invited",
    });

    const { rerender } = render(<ManagerInvitationAcceptance token="invitation-token" />);

    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("accepted"));
    expect(mocks.navigate).not.toHaveBeenCalled();

    mocks.shops = [
      {
        shopId: "shop-invited",
        shopName: "招待先店舗",
        shopStatus: "active",
        organizationId: "organization-invited",
        organizationName: "招待先組織",
        organizationPlan: "pro",
      },
    ];
    rerender(<ManagerInvitationAcceptance token="invitation-token" />);

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
        to: "/dashboard",
        search: { org: "organization-invited", shop: "shop-invited" },
        replace: true,
      }),
    );
  });

  it("受諾後に対象店舗をまだ取得できなくても完了状態を保ち、手動でDashboardへ戻れる", async () => {
    mocks.acceptInvitation.mockResolvedValue({
      status: "linked",
      organizationId: "organization-invited",
      shopId: "shop-invited",
    });

    render(<ManagerInvitationAcceptance token="invitation-token" />);

    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("accepted"));
    expect(mocks.latestState).toMatchObject({
      kind: "accepted",
      isPreparingDestination: false,
      hasDestination: false,
    });
    expect(mocks.navigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "ダッシュボードへ" }));

    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/dashboard",
      search: { org: "organization-invited", shop: "shop-invited" },
    });
  });
});
