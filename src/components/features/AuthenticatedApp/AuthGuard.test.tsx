// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SelectedShop = {
  shopId: string;
  shopName: string;
  shopStatus: "active" | "archived" | "planSuspended";
  organizationId: string | null;
  organizationName: string | null;
  organizationPlan: "trial" | "free" | "pro" | null;
  memberStatus: "active" | "readOnly" | "removed";
} | null;

type ShopRow = {
  shopId: string;
  shopName: string;
  shopStatus?: "active" | "archived" | "planSuspended";
  organizationId?: string;
  organizationName?: string;
  organizationPlan?: "trial" | "free" | "pro";
  memberStatus?: "active" | "readOnly" | "removed";
};

type CurrentUser =
  | { name: string; email: string; featureVisibility?: unknown }
  | { accountDeleted: true; accountDeletionRequested?: boolean }
  | undefined;

const mocks = vi.hoisted(() => ({
  currentUserQuery: Symbol("getCurrentUser"),
  myShopsQuery: Symbol("getMyShops"),
  selectedShopAtom: Symbol("selectedShopAtom"),
  userAtom: Symbol("userAtom"),
  useAuth: vi.fn(),
  useUser: vi.fn(),
  useQuery: vi.fn(),
  useRouterState: vi.fn(),
  navigate: vi.fn(),
  useAtom: vi.fn(),
  setSelectedShop: vi.fn(),
  setUser: vi.fn(),
  managerChildRender: vi.fn(),
  emptyUser: {
    authId: "",
    name: "",
    email: "",
    featureVisibility: {
      organizationSettingsNavigation: false,
      billing: false,
      shopMembershipAddition: false,
    },
  },
  currentUser: { name: "管理者", email: "manager@example.com" } as CurrentUser,
  myShops: [{ shopId: "active-shop", shopName: "所属店舗" }] as ShopRow[],
  selectedShop: null as SelectedShop,
  user: {
    authId: "manager-user",
    name: "管理者",
    email: "manager@example.com",
    featureVisibility: {
      organizationSettingsNavigation: false,
      billing: false,
      shopMembershipAddition: false,
    },
  },
}));

vi.mock("@clerk/react", () => ({
  SignOutButton: ({ children }: { children: ReactNode }) => children,
  useAuth: mocks.useAuth,
  useUser: mocks.useUser,
}));

vi.mock("@chakra-ui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chakra-ui/react")>()),
  Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@tanstack/react-router", () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
  useRouterState: mocks.useRouterState,
}));

vi.mock("convex/react", () => ({
  useQuery: mocks.useQuery,
  useAction: vi.fn(),
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtom: mocks.useAtom,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    dashboard: {
      queries: {
        getCurrentUser: mocks.currentUserQuery,
        getMyShops: mocks.myShopsQuery,
      },
    },
  },
}));

vi.mock("@/src/components/templates/FullPageSpinner", () => ({
  FullPageSpinner: () => <div data-testid="full-page-spinner" />,
}));

vi.mock("@/src/components/features/AccountDeletion", () => ({
  AccountDeletion: () => <div data-testid="account-deletion-entry" />,
}));

vi.mock("@/src/components/ui/Button", () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/src/components/ui/Empty", () => ({
  Empty: ({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {action}
    </main>
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
  mocks.useUser.mockReset();
  mocks.useQuery.mockReset();
  mocks.useRouterState.mockReset();
  mocks.navigate.mockReset();
  mocks.useAtom.mockReset();
  mocks.setSelectedShop.mockReset();
  mocks.setUser.mockReset();
  mocks.managerChildRender.mockReset();
  sessionStorage.clear();

  mocks.myShops = [{ shopId: "active-shop", shopName: "所属店舗" }];
  mocks.currentUser = { name: "管理者", email: "manager@example.com" };
  mocks.selectedShop = {
    shopId: "stale-shop",
    shopName: "過去の所属店舗",
    shopStatus: "active",
    organizationId: null,
    organizationName: null,
    organizationPlan: null,
    memberStatus: "active",
  };
  mocks.user = {
    authId: "manager-user",
    name: "管理者",
    email: "manager@example.com",
    featureVisibility: {
      organizationSettingsNavigation: false,
      billing: false,
      shopMembershipAddition: false,
    },
  };

  mocks.useAuth.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: "manager-user",
  });
  mocks.useUser.mockReturnValue({
    isLoaded: true,
    user: {
      primaryEmailAddress: {
        emailAddress: "manager@example.com",
        verification: { status: "verified" },
      },
    },
  });
  mocks.useRouterState.mockReturnValue({ pathname: "/dashboard", searchStr: "" });
  mocks.useQuery.mockImplementation((queryReference: unknown) => {
    if (queryReference === mocks.currentUserQuery) return mocks.currentUser;
    if (queryReference === mocks.myShopsQuery) return mocks.myShops;
    throw new Error("Unexpected query reference");
  });
  mocks.useAtom.mockImplementation((targetAtom: unknown) => {
    if (targetAtom === mocks.userAtom) return [mocks.user, mocks.setUser];
    if (targetAtom === mocks.selectedShopAtom) return [mocks.selectedShop, mocks.setSelectedShop];
    throw new Error("Unexpected atom");
  });
});

describe("AuthGuard", () => {
  it("店舗非依存画面では店舗queryと店舗整合を行わず、保存済み店舗を維持して表示する", () => {
    render(
      <AuthGuard requiresShopContext={false} requestedShopId="unknown-shop">
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.queryByTestId("manager-child")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "この店舗を開けません" })).toBeNull();
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.myShopsQuery, "skip");
    expect(mocks.setSelectedShop).not.toHaveBeenCalled();
  });

  it("ClerkのログインメールとConvexの連絡先が異なっても通常画面を表示する", () => {
    mocks.currentUser = { name: "管理者", email: "convex@example.com" };
    mocks.useUser.mockReturnValue({
      isLoaded: true,
      user: {
        primaryEmailAddress: {
          emailAddress: "login@example.com",
          verification: { status: "verified" },
        },
      },
    });
    mocks.selectedShop = {
      shopId: "active-shop",
      shopName: "所属店舗",
      shopStatus: "active",
      organizationId: null,
      organizationName: null,
      organizationPlan: null,
      memberStatus: "active",
    };

    render(
      <AuthGuard requestedShopId="active-shop">
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.queryByTestId("manager-child")).not.toBeNull();
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.myShopsQuery, {});
    expect(mocks.useUser).not.toHaveBeenCalled();
  });

  it("廃止したメール削除の保存状態は再開せず、認証後に静かに破棄する", async () => {
    sessionStorage.setItem("account-email-cleanup-session", "invalid-retired-state");
    mocks.selectedShop = {
      shopId: "active-shop",
      shopName: "所属店舗",
      shopStatus: "active",
      organizationId: null,
      organizationName: null,
      organizationPlan: null,
      memberStatus: "active",
    };

    render(
      <AuthGuard requestedShopId="active-shop">
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.queryByTestId("manager-child")).not.toBeNull();
    await waitFor(() => expect(sessionStorage.getItem("account-email-cleanup-session")).toBeNull());
  });

  it("sessionStorageを利用できなくても認証後の画面をブロックしない", () => {
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Storage unavailable", "SecurityError");
    });
    mocks.selectedShop = {
      shopId: "active-shop",
      shopName: "所属店舗",
      shopStatus: "active",
      organizationId: null,
      organizationName: null,
      organizationPlan: null,
      memberStatus: "active",
    };

    try {
      render(
        <AuthGuard requestedShopId="active-shop">
          <ManagerChild />
        </AuthGuard>,
      );

      expect(screen.queryByTestId("manager-child")).not.toBeNull();
      expect(removeItem).toHaveBeenCalledWith("account-email-cleanup-session");
    } finally {
      removeItem.mockRestore();
    }
  });

  it("古いbackendが公開状態を返さない場合は全機能を閉じてatomの同期完了まで子画面を描画しない", async () => {
    mocks.selectedShop = {
      shopId: "active-shop",
      shopName: "所属店舗",
      shopStatus: "active",
      organizationId: null,
      organizationName: null,
      organizationPlan: null,
      memberStatus: "active",
    };
    mocks.user.featureVisibility = {
      organizationSettingsNavigation: true,
      billing: true,
      shopMembershipAddition: true,
    };

    const { rerender } = render(
      <AuthGuard requestedShopId="active-shop">
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.queryByTestId("manager-child")).toBeNull();
    expect(screen.queryByTestId("full-page-spinner")).not.toBeNull();
    await waitFor(() => {
      expect(mocks.setUser).toHaveBeenCalledWith({
        authId: "manager-user",
        name: "管理者",
        email: "manager@example.com",
        featureVisibility: {
          organizationSettingsNavigation: false,
          billing: false,
          shopMembershipAddition: false,
        },
      });
    });

    mocks.user.featureVisibility = {
      organizationSettingsNavigation: false,
      billing: false,
      shopMembershipAddition: false,
    };
    rerender(
      <AuthGuard requestedShopId="active-shop">
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.queryByTestId("manager-child")).not.toBeNull();
    expect(screen.queryByTestId("full-page-spinner")).toBeNull();
  });

  it("backendの公開状態をatomへ同期するまでは子画面を描画しない", async () => {
    mocks.currentUser = {
      name: "管理者",
      email: "manager@example.com",
      featureVisibility: {
        organizationSettingsNavigation: true,
        billing: true,
        shopMembershipAddition: false,
      },
    };
    mocks.selectedShop = {
      shopId: "active-shop",
      shopName: "所属店舗",
      shopStatus: "active",
      organizationId: null,
      organizationName: null,
      organizationPlan: null,
      memberStatus: "active",
    };

    const { rerender } = render(
      <AuthGuard requestedShopId="active-shop">
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.queryByTestId("manager-child")).toBeNull();
    await waitFor(() => {
      expect(mocks.setUser).toHaveBeenCalledWith({
        authId: "manager-user",
        name: "管理者",
        email: "manager@example.com",
        featureVisibility: {
          organizationSettingsNavigation: true,
          billing: true,
          shopMembershipAddition: false,
        },
      });
    });

    mocks.user.featureVisibility = {
      organizationSettingsNavigation: true,
      billing: true,
      shopMembershipAddition: false,
    };
    rerender(
      <AuthGuard requestedShopId="active-shop">
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.queryByTestId("manager-child")).not.toBeNull();
  });

  it("保存済みの不所属店舗を整合するまではmanager子画面を描画しない", async () => {
    const { rerender } = render(
      <AuthGuard requestedShopId="active-shop">
        <ManagerChild />
      </AuthGuard>,
    );

    expect(mocks.managerChildRender).not.toHaveBeenCalled();
    expect(screen.queryByTestId("manager-child")).toBeNull();
    expect(screen.queryByTestId("full-page-spinner")).not.toBeNull();
    await waitFor(() => {
      expect(mocks.setSelectedShop).toHaveBeenCalledWith({
        shopId: "active-shop",
        shopName: "所属店舗",
        shopStatus: "active",
        organizationId: null,
        organizationName: null,
        organizationPlan: null,
        memberStatus: "active",
      });
    });

    mocks.selectedShop = {
      shopId: "active-shop",
      shopName: "所属店舗",
      shopStatus: "active",
      organizationId: null,
      organizationName: null,
      organizationPlan: null,
      memberStatus: "active",
    };
    rerender(
      <AuthGuard requestedShopId="active-shop">
        <ManagerChild />
      </AuthGuard>,
    );

    expect(mocks.managerChildRender).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("manager-child")).not.toBeNull();
    expect(screen.queryByTestId("full-page-spinner")).toBeNull();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("URLがなく保存値も無効なら複数候補の先頭を保存してURLをreplace正規化する", async () => {
    mocks.myShops = [
      { shopId: "shop-a", shopName: "A店", organizationId: "org-a", organizationName: "A社" },
      { shopId: "shop-b", shopName: "B店", organizationId: "org-b", organizationName: "B社" },
    ];

    const { rerender } = render(
      <AuthGuard onNormalizeShopUrl={mocks.navigate}>
        <ManagerChild />
      </AuthGuard>,
    );

    await waitFor(() => {
      expect(mocks.setSelectedShop).toHaveBeenCalledWith({
        shopId: "shop-a",
        shopName: "A店",
        shopStatus: "active",
        organizationId: "org-a",
        organizationName: "A社",
        organizationPlan: null,
        memberStatus: "active",
      });
    });
    expect(mocks.managerChildRender).not.toHaveBeenCalled();

    mocks.selectedShop = {
      shopId: "shop-a",
      shopName: "A店",
      shopStatus: "active",
      organizationId: "org-a",
      organizationName: "A社",
      organizationPlan: null,
      memberStatus: "active",
    };
    rerender(
      <AuthGuard onNormalizeShopUrl={mocks.navigate}>
        <ManagerChild />
      </AuthGuard>,
    );

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("shop-a"));

    rerender(
      <AuthGuard requestedShopId="shop-a" onNormalizeShopUrl={mocks.navigate}>
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.queryByTestId("manager-child")).not.toBeNull();
  });

  it("同じ店舗でも契約プランが変わったら選択コンテキストを最新化する", async () => {
    mocks.myShops = [
      {
        shopId: "active-shop",
        shopName: "所属店舗",
        organizationId: "organization-a",
        organizationName: "A社",
        organizationPlan: "pro",
      },
    ];
    mocks.selectedShop = {
      shopId: "active-shop",
      shopName: "所属店舗",
      shopStatus: "active",
      organizationId: "organization-a",
      organizationName: "A社",
      organizationPlan: "free",
      memberStatus: "active",
    };

    render(
      <AuthGuard requestedShopId="active-shop">
        <ManagerChild />
      </AuthGuard>,
    );

    expect(mocks.managerChildRender).not.toHaveBeenCalled();
    expect(screen.queryByTestId("full-page-spinner")).not.toBeNull();
    await waitFor(() => {
      expect(mocks.setSelectedShop).toHaveBeenCalledWith({
        ...mocks.selectedShop,
        organizationPlan: "pro",
      });
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("所属店舗がなくなったら古い選択を消すまで子画面を描画せず、ログアウトせずに続行する", async () => {
    mocks.myShops = [];
    mocks.selectedShop = {
      shopId: "removed-shop",
      shopName: "権限を失った店舗",
      shopStatus: "active",
      organizationId: "removed-organization",
      organizationName: "権限を失ったグループ",
      organizationPlan: "free",
      memberStatus: "active",
    };
    const { rerender } = render(
      <AuthGuard>
        <ManagerChild />
      </AuthGuard>,
    );

    expect(mocks.managerChildRender).not.toHaveBeenCalled();
    expect(screen.queryByTestId("manager-child")).toBeNull();
    expect(screen.queryByTestId("full-page-spinner")).not.toBeNull();
    expect(screen.queryByText("権限を失った店舗")).toBeNull();
    expect(screen.queryByText("権限を失ったグループ")).toBeNull();
    await waitFor(() => expect(mocks.setSelectedShop).toHaveBeenCalledWith(null));

    mocks.selectedShop = null;
    rerender(
      <AuthGuard>
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.queryByTestId("full-page-spinner")).toBeNull();
    expect(screen.queryByTestId("manager-child")).not.toBeNull();
    expect(screen.queryByTestId("navigate")).toBeNull();
    expect(mocks.useAuth).toHaveReturnedWith(expect.objectContaining({ isSignedIn: true, userId: "manager-user" }));
  });

  it("明示されたURL店舗が候補外ならfallbackせず汎用エラーを表示する", () => {
    mocks.myShops = [
      { shopId: "shop-a", shopName: "A店" },
      { shopId: "shop-b", shopName: "B店" },
    ];
    mocks.selectedShop = {
      shopId: "shop-a",
      shopName: "A店",
      shopStatus: "active",
      organizationId: null,
      organizationName: null,
      organizationPlan: null,
      memberStatus: "active",
    };

    render(
      <AuthGuard requestedShopId="unknown-shop" onReturnToDashboard={mocks.navigate}>
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.queryByTestId("manager-child")).toBeNull();
    expect(screen.getByRole("heading", { name: "この店舗を開けません" })).not.toBeNull();
    expect(screen.queryByText("unknown-shop")).toBeNull();
    expect(mocks.setSelectedShop).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "ダッシュボードへ戻る" }));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it("削除済みアカウントではClerk由来の個人情報や管理画面を表示せず、店舗queryも実行しない", async () => {
    mocks.currentUser = { accountDeleted: true };

    render(
      <AuthGuard requestedShopId="stale-shop">
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.getByRole("heading", { name: "シフトリの利用は終了しています" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "ログアウト" })).not.toBeNull();
    expect(screen.getByTestId("account-deletion-entry")).not.toBeNull();
    expect(screen.queryByText("管理者")).toBeNull();
    expect(screen.queryByText("manager@example.com")).toBeNull();
    expect(screen.queryByTestId("manager-child")).toBeNull();
    expect(mocks.managerChildRender).not.toHaveBeenCalled();
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.myShopsQuery, "skip");

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
    expect(screen.getByText(/ログイン用アカウントの削除は、通常は数分以内に完了します/)).not.toBeNull();
    expect(screen.getByText(/このページを閉じても処理は続きます/)).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "シフトリの利用は終了しています" })).toBeNull();
    expect(screen.queryByTestId("account-deletion-entry")).toBeNull();
    expect(screen.queryByTestId("manager-child")).toBeNull();
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.myShopsQuery, "skip");
  });
});
