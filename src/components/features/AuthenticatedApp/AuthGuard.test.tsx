// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type CurrentUser =
  | { name: string; email: string }
  | { accountDeleted: true; accountDeletionRequested?: boolean }
  | undefined;

const mocks = vi.hoisted(() => ({
  currentUserQuery: Symbol("getCurrentUser"),
  selectedShopAtom: Symbol("selectedShopAtom"),
  userAtom: Symbol("userAtom"),
  useAuth: vi.fn(),
  useQuery: vi.fn(),
  useRouterState: vi.fn(),
  useAtom: vi.fn(),
  useSetAtom: vi.fn(),
  setSelectedShop: vi.fn(),
  setUser: vi.fn(),
  managerChildRender: vi.fn(),
  emptyUser: {
    authId: "",
    name: "",
    email: "",
  },
  currentUser: {
    name: "管理者",
    email: "manager@example.com",
  } as CurrentUser,
  matches: [] as Array<{ staticData: { appShell?: { mode: "navigation" | "focused" } } }>,
  user: {
    authId: "manager-user",
    name: "管理者",
    email: "manager@example.com",
  },
}));

vi.mock("@clerk/react", () => ({
  SignOutButton: ({ children }: { children: ReactNode }) => children,
  useAuth: mocks.useAuth,
}));

vi.mock("@chakra-ui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chakra-ui/react")>()),
  Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@tanstack/react-router", () => ({
  Navigate: ({ to, search }: { to: string; search?: { redirect?: string } }) => (
    <div data-testid="navigate" data-to={to} data-redirect={search?.redirect} />
  ),
  useRouterState: mocks.useRouterState,
  useMatches: () => mocks.matches,
}));

vi.mock("convex/react", () => ({
  useQuery: mocks.useQuery,
  useAction: vi.fn(),
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtom: mocks.useAtom,
  useSetAtom: mocks.useSetAtom,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { dashboard: { queries: { getCurrentUser: mocks.currentUserQuery } } },
}));

vi.mock("@/src/components/templates/FullPageSpinner", () => ({
  FullPageSpinner: (props: { showHeader?: boolean; mobileNavigationHeight?: string }) => (
    <div
      data-testid="full-page-spinner"
      data-show-header={props.showHeader ? "true" : "false"}
      data-mobile-navigation-height={props.mobileNavigationHeight ?? ""}
    />
  ),
}));

vi.mock("@/src/components/features/AccountDeletion", () => ({
  AccountDeletion: () => <div data-testid="account-deletion-entry" />,
}));

vi.mock("@/src/components/ui/Button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("@/src/components/ui/Empty", () => ({
  Empty: ({
    title,
    description,
    secondaryDescription,
    action,
  }: {
    title: string;
    description: string;
    secondaryDescription?: string;
    action?: ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {secondaryDescription ? <p>{secondaryDescription}</p> : null}
      {action}
    </div>
  ),
}));

vi.mock("@/src/stores/shop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/stores/shop")>()),
  selectedShopAtom: mocks.selectedShopAtom,
}));

vi.mock("@/src/stores/user", () => ({
  EMPTY_USER: mocks.emptyUser,
  userAtom: mocks.userAtom,
}));

import { AuthGuard } from "./AuthGuard";

const ManagerChild = () => {
  mocks.managerChildRender();
  return <div data-testid="manager-child" />;
};

beforeEach(() => {
  mocks.useAuth.mockReset();
  mocks.useQuery.mockReset();
  mocks.useRouterState.mockReset();
  mocks.useAtom.mockReset();
  mocks.useSetAtom.mockReset();
  mocks.setSelectedShop.mockReset();
  mocks.setUser.mockReset();
  mocks.managerChildRender.mockReset();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/dashboard");

  mocks.matches = [];
  mocks.currentUser = {
    name: "管理者",
    email: "manager@example.com",
  };
  mocks.user = {
    authId: "manager-user",
    name: "管理者",
    email: "manager@example.com",
  };
  mocks.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "manager-user" });
  mocks.useRouterState.mockReturnValue({ pathname: "/dashboard", searchStr: "" });
  mocks.useQuery.mockImplementation((queryReference: unknown) => {
    if (queryReference === mocks.currentUserQuery) return mocks.currentUser;
    throw new Error("Unexpected query reference");
  });
  mocks.useAtom.mockImplementation((targetAtom: unknown) => {
    if (targetAtom === mocks.userAtom) return [mocks.user, mocks.setUser];
    throw new Error("Unexpected atom");
  });
  mocks.useSetAtom.mockImplementation((targetAtom: unknown) => {
    if (targetAtom === mocks.selectedShopAtom) return mocks.setSelectedShop;
    throw new Error("Unexpected atom");
  });
});

describe("AuthGuard", () => {
  it("navigation appの認証待機ではSP下部ナビの余白を予約する", () => {
    mocks.matches = [{ staticData: { appShell: { mode: "navigation" } } }];
    mocks.useAuth.mockReturnValue({ isLoaded: false, isSignedIn: undefined, userId: null });

    render(
      <AuthGuard>
        <ManagerChild />
      </AuthGuard>,
    );

    const spinner = screen.getByTestId("full-page-spinner");
    expect(spinner.getAttribute("data-show-header")).toBe("true");
    expect(spinner.getAttribute("data-mobile-navigation-height")).toBe("68px");
  });

  it("未認証時はrouter stateに欠けたsearchも実URLからredirectへ保持する", () => {
    window.history.replaceState({}, "", "/dashboard?org=org-a&shop=shop-a");
    mocks.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false, userId: null });

    render(
      <AuthGuard>
        <ManagerChild />
      </AuthGuard>,
    );

    const redirect = screen.getByTestId("navigate");
    expect(redirect.getAttribute("data-to")).toBe("/login");
    expect(redirect.getAttribute("data-redirect")).toBe("/dashboard?org=org-a&shop=shop-a");
    expect(screen.queryByTestId("manager-child")).toBeNull();
  });

  it("認証済みuser contextが一致したら店舗queryなしで子画面を表示する", () => {
    render(
      <AuthGuard>
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.getByTestId("manager-child")).not.toBeNull();
    expect(mocks.useQuery).toHaveBeenCalledTimes(1);
    expect(mocks.setSelectedShop).not.toHaveBeenCalled();
  });

  it("廃止したメール削除の保存状態を認証後に静かに破棄する", async () => {
    sessionStorage.setItem("account-email-cleanup-session", "invalid-retired-state");

    render(
      <AuthGuard>
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.getByTestId("manager-child")).not.toBeNull();
    await waitFor(() => expect(sessionStorage.getItem("account-email-cleanup-session")).toBeNull());
  });

  it("sessionStorageを利用できなくても認証後の画面をブロックしない", () => {
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Storage unavailable", "SecurityError");
    });

    try {
      render(
        <AuthGuard>
          <ManagerChild />
        </AuthGuard>,
      );

      expect(screen.getByTestId("manager-child")).not.toBeNull();
      expect(removeItem).toHaveBeenCalledWith("account-email-cleanup-session");
    } finally {
      removeItem.mockRestore();
    }
  });

  it("current userの取得中は子画面を描画しない", () => {
    mocks.currentUser = undefined;

    render(
      <AuthGuard>
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.getByTestId("full-page-spinner")).not.toBeNull();
    expect(screen.queryByTestId("manager-child")).toBeNull();
  });

  it("削除済みアカウントでは個人情報や管理画面を表示せず、保存contextを消す", async () => {
    mocks.currentUser = { accountDeleted: true };

    render(
      <AuthGuard>
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.getByRole("heading", { name: "シフトリの利用は終了しています" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "ログアウト" })).not.toBeNull();
    expect(screen.getByTestId("account-deletion-entry")).not.toBeNull();
    expect(screen.queryByText("管理者")).toBeNull();
    expect(screen.queryByText("manager@example.com")).toBeNull();
    expect(screen.queryByTestId("manager-child")).toBeNull();

    await waitFor(() => {
      expect(mocks.setUser).toHaveBeenCalledWith(mocks.emptyUser);
      expect(mocks.setSelectedShop).toHaveBeenCalledWith(null);
    });
  });

  it("明示的なアカウント削除受付後は受付中の状態を表示する", () => {
    mocks.currentUser = { accountDeleted: true, accountDeletionRequested: true };

    render(
      <AuthGuard>
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.getByRole("heading", { name: "アカウントの削除を受け付けました" })).not.toBeNull();
    expect(screen.queryByText(/このページを閉じても処理は続きます/)).toBeNull();
    expect(screen.queryByTestId("manager-child")).toBeNull();
  });
});
