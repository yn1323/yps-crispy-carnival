// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type CapturedState = {
  kind: string;
  organizationName?: string | null;
  isSignedIn?: boolean;
  isPreparingDestination?: boolean;
  hasDestination?: boolean;
  isRetrying?: boolean;
};

type CapturedAccount = {
  email: string;
  errorMessage: string | null;
  isLoggingOut: boolean;
} | null;

type CapturedActions = {
  onAccept: () => void | Promise<void>;
  onLogin: () => void | Promise<void>;
  onSignup: () => void | Promise<void>;
  onLogout: () => void | Promise<void>;
  onGoToDashboard: () => void | Promise<void>;
};

const mocks = vi.hoisted(() => ({
  acceptAction: Symbol("acceptInvitation"),
  previewQuery: Symbol("getPreview"),
  shopsQuery: Symbol("getMyShops"),
  acceptInvitation: vi.fn(),
  navigate: vi.fn(),
  signOut: vi.fn(),
  useAction: vi.fn(),
  useQuery: vi.fn(),
  preview: {
    status: "ready",
    organizationName: "さくらダイニング",
    expiresAt: Date.UTC(2026, 6, 23, 9),
  } as { status: string; organizationName?: string; expiresAt?: number },
  isSignedIn: true,
  shops: [] as Array<Record<string, unknown>>,
  user: {
    primaryEmailAddress: { emailAddress: "login@example.com" },
  },
  latestState: null as CapturedState | null,
  latestAccount: null as CapturedAccount,
}));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: mocks.isSignedIn }),
  useClerk: () => ({ signOut: mocks.signOut }),
  useUser: () => ({ isLoaded: true, user: mocks.isSignedIn ? mocks.user : null }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("convex/react", () => ({
  useAction: mocks.useAction,
  useConvexAuth: () => ({ isAuthenticated: mocks.isSignedIn, isLoading: false }),
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
  ManagerInvitationAcceptanceView: ({
    state,
    account,
    actions,
  }: {
    state: CapturedState;
    account: CapturedAccount;
    actions: CapturedActions;
  }) => {
    mocks.latestState = state;
    mocks.latestAccount = account;
    return (
      <div>
        <output data-testid="state-kind">{state.kind}</output>
        <output data-testid="logout-error">{account?.errorMessage ?? ""}</output>
        <button type="button" onClick={() => void actions.onAccept()}>
          参加する
        </button>
        <button type="button" onClick={() => void actions.onLogin()}>
          ログイン
        </button>
        <button type="button" onClick={() => void actions.onSignup()}>
          新規登録
        </button>
        <button type="button" onClick={() => void actions.onLogout()}>
          ログアウト
        </button>
        <button type="button" onClick={() => void actions.onGoToDashboard()}>
          シフトリを確認する
        </button>
      </div>
    );
  },
}));

import { ManagerInvitationAcceptance } from ".";

beforeEach(() => {
  mocks.acceptInvitation.mockReset();
  mocks.navigate.mockReset();
  mocks.signOut.mockReset();
  mocks.useAction.mockReset();
  mocks.useQuery.mockReset();
  mocks.shops = [];
  mocks.preview = { status: "ready", organizationName: "さくらダイニング", expiresAt: Date.UTC(2026, 6, 23, 9) };
  mocks.isSignedIn = true;
  mocks.latestState = null;
  mocks.latestAccount = null;

  mocks.useAction.mockReturnValue(mocks.acceptInvitation);
  mocks.useQuery.mockImplementation((query) => {
    if (query === mocks.previewQuery) return mocks.preview;
    if (query === mocks.shopsQuery) return mocks.shops;
    throw new Error("Unexpected query");
  });
  mocks.signOut.mockResolvedValue(undefined);
});

describe("ManagerInvitationAcceptance controller", () => {
  it("ログイン済みで開いても自動では参加せず、ログイン中のアカウントを渡して操作を待つ", async () => {
    render(<ManagerInvitationAcceptance token="invitation-token" />);

    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("ready"));
    expect(mocks.latestState).toMatchObject({ kind: "ready", isSignedIn: true });
    expect(mocks.latestAccount).toEqual({ email: "login@example.com", errorMessage: null, isLoggingOut: false });
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
  });

  it("「参加する」を押したときだけ、招待tokenだけを受諾の入口へ渡す", async () => {
    mocks.acceptInvitation.mockResolvedValue({ status: "linked", organizationId: "organization-invited" });
    render(<ManagerInvitationAcceptance token="invitation-token" />);

    fireEvent.click(screen.getByRole("button", { name: "参加する" }));

    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("accepted"));
    expect(mocks.acceptInvitation.mock.calls).toEqual([[{ token: "invitation-token" }]]);
  });

  it("「参加する」を続けて押しても、受諾を1回だけ呼ぶ", async () => {
    let finish: ((result: { status: "linked"; organizationId: string }) => void) | undefined;
    mocks.acceptInvitation.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<ManagerInvitationAcceptance token="invitation-token" />);

    fireEvent.click(screen.getByRole("button", { name: "参加する" }));
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));

    expect(mocks.acceptInvitation).toHaveBeenCalledTimes(1);
    await act(async () => finish?.({ status: "linked", organizationId: "organization-invited" }));
    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("accepted"));
    expect(mocks.acceptInvitation).toHaveBeenCalledTimes(1);
  });

  it("ログインしていないときはアカウントを渡さず、ログインと新規登録の戻り先に同じ招待URLを指定する", async () => {
    mocks.isSignedIn = false;
    render(<ManagerInvitationAcceptance token="invitation token" />);

    await waitFor(() => expect(mocks.latestState).toMatchObject({ kind: "ready", isSignedIn: false }));
    expect(mocks.latestAccount).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));
    fireEvent.click(screen.getByRole("button", { name: "新規登録" }));
    // ログインする前に「参加する」が押されても、受諾は呼ばない。
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));

    expect(mocks.navigate.mock.calls).toEqual([
      [{ to: "/login", search: { redirect: "/manager-invite?token=invitation%20token" } }],
      [{ to: "/signup", search: { redirect: "/manager-invite?token=invitation%20token" } }],
    ]);
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
  });

  it.each(["expired", "revoked", "used", "unavailable", "invalid"])(
    "招待が%sなら、その状態を画面へ渡し、受諾を呼ばない",
    async (status) => {
      mocks.preview = { status };
      render(<ManagerInvitationAcceptance token="invitation-token" />);

      await waitFor(() => expect(mocks.latestState).toEqual({ kind: status }));
      expect(mocks.acceptInvitation).not.toHaveBeenCalled();
    },
  );

  it("tokenのないURLは無効な招待として扱い、招待の内容を問い合わせない", async () => {
    render(<ManagerInvitationAcceptance token={undefined} />);

    await waitFor(() => expect(mocks.latestState).toEqual({ kind: "invalid" }));
    const previewArgs = mocks.useQuery.mock.calls
      .filter(([query]) => query === mocks.previewQuery)
      .map(([, args]) => args);
    expect(previewArgs.length).toBeGreaterThan(0);
    expect(new Set(previewArgs)).toEqual(new Set(["skip"]));
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "conflict", accountAlreadyRegistered: true }, "accountAlreadyRegistered"],
    [{ status: "conflict", accountAlreadyRegistered: false }, "conflict"],
    [{ status: "unavailable" }, "unavailable"],
    [{ status: "revoked" }, "revoked"],
  ] as const)("受諾の結果%jを画面の状態%sへ対応付ける", async (result, expectedKind) => {
    mocks.acceptInvitation.mockResolvedValue(result);
    render(<ManagerInvitationAcceptance token="invitation-token" />);

    fireEvent.click(screen.getByRole("button", { name: "参加する" }));

    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe(expectedKind));
  });

  it("登録済みのアカウントで拒否されたときは、どの組織に登録済みかを画面へ渡す", async () => {
    mocks.acceptInvitation.mockResolvedValue({ status: "conflict", accountAlreadyRegistered: true });
    render(<ManagerInvitationAcceptance token="invitation-token" />);

    fireEvent.click(screen.getByRole("button", { name: "参加する" }));

    await waitFor(() =>
      expect(mocks.latestState).toEqual({ kind: "accountAlreadyRegistered", organizationName: "さくらダイニング" }),
    );
  });

  it("受諾の呼び出しが失敗したら再実行できる状態にし、再実行で同じtokenを送る", async () => {
    mocks.acceptInvitation.mockRejectedValueOnce(new Error("network"));
    mocks.acceptInvitation.mockResolvedValueOnce({ status: "linked", organizationId: "organization-invited" });
    render(<ManagerInvitationAcceptance token="invitation-token" />);

    fireEvent.click(screen.getByRole("button", { name: "参加する" }));
    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("retryableError"));

    fireEvent.click(screen.getByRole("button", { name: "参加する" }));
    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("accepted"));
    expect(mocks.acceptInvitation.mock.calls).toEqual([
      [{ token: "invitation-token" }],
      [{ token: "invitation-token" }],
    ]);
  });

  it("ログアウトは同じ招待URLを戻り先に指定し、拒否された結果を画面に残さない", async () => {
    mocks.acceptInvitation.mockResolvedValue({ status: "conflict", accountAlreadyRegistered: true });
    render(<ManagerInvitationAcceptance token="invitation token" />);
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));
    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("accountAlreadyRegistered"));

    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));

    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("ready"));
    expect(mocks.signOut.mock.calls).toEqual([[{ redirectUrl: "/manager-invite?token=invitation%20token" }]]);
  });

  it("ログアウトに失敗したら、結果を保ったまま再試行できるエラーを表示する", async () => {
    mocks.acceptInvitation.mockResolvedValue({ status: "conflict", accountAlreadyRegistered: false });
    mocks.signOut.mockRejectedValueOnce(new Error("network"));
    render(<ManagerInvitationAcceptance token="invitation-token" />);
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));
    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("conflict"));

    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));

    await waitFor(() =>
      expect(screen.getByTestId("logout-error").textContent).toBe(
        "ログアウトできませんでした。もう一度お試しください。",
      ),
    );
    expect(screen.getByTestId("state-kind").textContent).toBe("conflict");
  });

  it("受諾した店舗が所属一覧へ現れたら、その店舗を選択してDashboardへ遷移する", async () => {
    mocks.acceptInvitation.mockResolvedValue({
      status: "linked",
      organizationId: "organization-invited",
      shopId: "shop-invited",
    });

    const { rerender } = render(<ManagerInvitationAcceptance token="invitation-token" />);
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));

    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("accepted"));
    expect(mocks.navigate).not.toHaveBeenCalled();

    mocks.shops = [
      {
        shopId: "shop-invited",
        shopName: "招待先店舗",
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
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));

    await waitFor(() => expect(screen.getByTestId("state-kind").textContent).toBe("accepted"));
    expect(mocks.latestState).toMatchObject({
      kind: "accepted",
      isPreparingDestination: false,
      hasDestination: false,
    });
    expect(mocks.navigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "シフトリを確認する" }));

    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/dashboard",
      search: { org: "organization-invited", shop: "shop-invited" },
    });
  });
});
