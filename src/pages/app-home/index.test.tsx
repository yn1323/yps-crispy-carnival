// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@/src/providers/ChakraProvider";
import { APP_HOME_SHOP_PREFERENCE_STORAGE_KEY } from "./script";

const mocks = vi.hoisted(() => ({
  dashboardShopQuery: Symbol("getDashboardShop"),
  currentUserQuery: Symbol("getCurrentUser"),
  consentQuery: Symbol("getManagerConsentStatus"),
  navigate: vi.fn(),
  useQuery: vi.fn(),
  useShopQuery: vi.fn(),
  dashboardProps: undefined as Record<string, unknown> | undefined,
  dashboardSkeletonProps: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, search: _search, ...props }: { children: ReactNode; to: string; search?: unknown }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mocks.navigate,
}));

vi.mock("convex/react", () => ({ useQuery: mocks.useQuery }));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    dashboard: {
      queries: {
        getDashboardShop: mocks.dashboardShopQuery,
        getCurrentUser: mocks.currentUserQuery,
      },
    },
    legal: { queries: { getManagerConsentStatus: mocks.consentQuery } },
  },
}));

vi.mock("jotai", () => ({
  useAtomValue: () => ({ billing: true }),
}));

vi.mock("@/src/stores/user", () => ({
  featureVisibilityAtom: Symbol("featureVisibilityAtom"),
}));

vi.mock("@/src/hooks/useShopQuery", () => ({ useShopQuery: mocks.useShopQuery }));

vi.mock("@/src/components/features/Dashboard", () => ({
  DashboardSkeleton: (props: Record<string, unknown>) => {
    mocks.dashboardSkeletonProps = props;
    return <output data-testid="home-loading">ホームを読み込み中</output>;
  },
  Dashboard: (props: Record<string, unknown>) => {
    mocks.dashboardProps = props;
    const navigation = props.navigation as {
      onOpenShiftBoard: (recruitmentId: string) => void;
      onOpenStaffDetail: (personId: string) => void;
    };
    return (
      <section
        aria-label="接続済みホーム"
        data-read-only={String(props.isReadOnly)}
        data-organization-id={String(props.expectedOrganizationId)}
      >
        <button type="button" onClick={() => navigation.onOpenShiftBoard("recruitment-1")}>
          シフトを開く
        </button>
        <button type="button" onClick={() => navigation.onOpenStaffDetail("person-1")}>
          スタッフを開く
        </button>
      </section>
    );
  },
}));

vi.mock("@/src/components/templates/Animation", () => ({
  Animation: ({ children }: { children: ReactNode }) => <div data-testid="home-animation">{children}</div>,
}));

vi.mock("@/src/components/templates/AuthenticatedPageContent", () => ({
  AuthenticatedPageContent: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("@/src/providers/ManagerShopScopeProvider", () => ({
  ManagerShopScopeProvider: ({
    children,
    shopId,
    expectedOrganizationId,
  }: {
    children: ReactNode;
    shopId: string;
    expectedOrganizationId: string;
  }) => (
    <div data-testid="manager-scope" data-shop-id={shopId} data-organization-id={expectedOrganizationId}>
      {children}
    </div>
  ),
}));

import { AppHomeRoutePage } from ".";

const shop = {
  name: "A店舗",
  regularClosedDays: [],
  submissionPattern: { kind: "dateOnly" },
  canWriteBusinessData: true,
  businessWriteBlockReason: null,
  planStatus: null,
  trialEndingNotice: null,
};

const activeShops = [
  { id: "shop-a", name: "A店舗" },
  { id: "shop-b", name: "B店舗" },
];
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  mocks.navigate.mockReset();
  window.localStorage.clear();
  mocks.dashboardProps = undefined;
  mocks.dashboardSkeletonProps = undefined;
  mocks.useShopQuery.mockReset();
  mocks.useShopQuery.mockReturnValue(shop);
  mocks.useQuery.mockReset();
  mocks.useQuery.mockImplementation((reference) => {
    if (reference === mocks.currentUserQuery) {
      return { isNewUser: false, name: "管理者", email: "manager@example.com" };
    }
    if (reference === mocks.consentQuery) {
      return {
        required: false,
        documents: {
          terms: { title: "利用規約", path: "/terms" },
          privacy: { title: "プライバシーポリシー", path: "/privacy" },
        },
      };
    }
    throw new Error("unexpected query");
  });
});

const renderPage = (overrides: Partial<ComponentProps<typeof AppHomeRoutePage>> = {}) =>
  render(
    <ChakraProvider>
      <AppHomeRoutePage
        organizationId={"organization-a" as never}
        organizationName="Aグループ"
        memberStatus="active"
        activeShops={activeShops}
        requestedShopId="shop-b"
        {...overrides}
      />
    </ChakraProvider>,
  );

describe("AppHomeRoutePage", () => {
  it("ホームでは組織・プランのコンテキストを表示しない", () => {
    renderPage();

    expect(mocks.dashboardProps?.showOrganizationContext).toBe(false);
  });

  it("active店舗の全cursor読込中は店舗queryを開始せずDashboard skeletonを表示する", () => {
    renderPage({ activeShops: null });

    expect(screen.getByText("ホームを読み込み中")).not.toBeNull();
    expect(mocks.dashboardSkeletonProps?.showOrganizationContext).toBe(false);
    expect(mocks.useShopQuery).not.toHaveBeenCalled();
  });

  it("店舗とDashboard queryを順に解決してもfade境界を再マウントしない", () => {
    mocks.useShopQuery.mockReturnValue(undefined);
    mocks.useQuery.mockReturnValue(undefined);
    const view = renderPage({ activeShops: null });
    const initialAnimation = screen.getByTestId("home-animation");

    view.rerender(
      <ChakraProvider>
        <AppHomeRoutePage
          organizationId={"organization-a" as never}
          organizationName="Aグループ"
          memberStatus="active"
          activeShops={activeShops}
          requestedShopId="shop-b"
        />
      </ChakraProvider>,
    );

    expect(screen.getByTestId("home-animation")).toBe(initialAnimation);
    expect(screen.getByTestId("home-loading")).not.toBeNull();

    mocks.useShopQuery.mockReturnValue(shop);
    mocks.useQuery.mockImplementation((reference) => {
      if (reference === mocks.currentUserQuery) {
        return { isNewUser: false, name: "管理者", email: "manager@example.com" };
      }
      if (reference === mocks.consentQuery) return undefined;
      throw new Error("unexpected query");
    });
    view.rerender(
      <ChakraProvider>
        <AppHomeRoutePage
          organizationId={"organization-a" as never}
          organizationName="Aグループ"
          memberStatus="active"
          activeShops={activeShops}
          requestedShopId="shop-b"
        />
      </ChakraProvider>,
    );

    expect(screen.getByTestId("home-animation")).toBe(initialAnimation);
    expect(screen.getByTestId("home-loading")).not.toBeNull();

    mocks.useQuery.mockImplementation((reference) => {
      if (reference === mocks.currentUserQuery) {
        return { isNewUser: false, name: "管理者", email: "manager@example.com" };
      }
      if (reference === mocks.consentQuery) {
        return {
          required: false,
          documents: {
            terms: { title: "利用規約", path: "/terms" },
            privacy: { title: "プライバシーポリシー", path: "/privacy" },
          },
        };
      }
      throw new Error("unexpected query");
    });
    view.rerender(
      <ChakraProvider>
        <AppHomeRoutePage
          organizationId={"organization-a" as never}
          organizationName="Aグループ"
          memberStatus="active"
          activeShops={activeShops}
          requestedShopId="shop-b"
        />
      </ChakraProvider>,
    );

    expect(screen.getByTestId("home-animation")).toBe(initialAnimation);
    expect(screen.queryByTestId("home-loading")).toBeNull();
    expect(screen.getByRole("region", { name: "接続済みホーム" })).not.toBeNull();
  });

  it("候補外shopをcanonical先頭店舗へreplaceし、同じorg・shop scopeでDashboardを接続する", async () => {
    renderPage({ requestedShopId: "another-organization-shop" });

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/app/home",
        search: { org: "organization-a", shop: "shop-a" },
        replace: true,
      }),
    );
    expect(mocks.useShopQuery).toHaveBeenCalledWith(mocks.dashboardShopQuery, {});
    const scope = screen.getByTestId("manager-scope");
    expect(scope.getAttribute("data-shop-id")).toBe("shop-a");
    expect(scope.getAttribute("data-organization-id")).toBe("organization-a");
    expect(screen.getByRole("region", { name: "接続済みホーム" }).getAttribute("data-organization-id")).toBe(
      "organization-a",
    );
  });

  it("active organization切替時は旧shopを描画せず、新しい組織のcanonical店舗へscopeを差し替える", async () => {
    const view = renderPage({ requestedShopId: "shop-a" });

    view.rerender(
      <ChakraProvider>
        <AppHomeRoutePage
          organizationId={"organization-b" as never}
          organizationName="Bグループ"
          memberStatus="active"
          activeShops={[{ id: "shop-c", name: "C店舗" }]}
          requestedShopId="shop-a"
        />
      </ChakraProvider>,
    );

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenLastCalledWith({
        to: "/app/home",
        search: { org: "organization-b", shop: "shop-c" },
        replace: true,
      }),
    );
    const scope = screen.getByTestId("manager-scope");
    expect(scope.getAttribute("data-shop-id")).toBe("shop-c");
    expect(scope.getAttribute("data-organization-id")).toBe("organization-b");
    const operationContext = mocks.dashboardProps?.operationContextData as {
      selectedShop: { organizationId: string; shopId: string };
    };
    expect(operationContext.selectedShop).toMatchObject({
      organizationId: "organization-b",
      shopId: "shop-c",
    });
  });

  it("readOnly memberでは既存Dashboardの操作を無効化し、閲覧理由を表示する", () => {
    renderPage({ memberStatus: "readOnly" });

    expect(screen.getByText("この店舗は閲覧のみです")).not.toBeNull();
    expect(screen.getByRole("region", { name: "接続済みホーム" }).getAttribute("data-read-only")).toBe("true");
  });

  it("Dashboardからの主要遷移へorganization scopeを引き継ぐ", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "シフトを開く" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/app/shifts/$recruitmentId/board",
      params: { recruitmentId: "recruitment-1" },
      search: { org: "organization-a" },
    });

    fireEvent.click(screen.getByRole("button", { name: "スタッフを開く" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/app/staff/$personId",
      params: { personId: "person-1" },
      search: { org: "organization-a" },
    });
  });

  it("URLに店舗がなければ組織別の保存hintをactive店舗一覧で検証して復元する", async () => {
    window.localStorage.setItem(
      APP_HOME_SHOP_PREFERENCE_STORAGE_KEY,
      JSON.stringify({ "organization-a": "shop-b", "organization-b": "shop-c" }),
    );

    renderPage({ requestedShopId: undefined });

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/app/home",
        search: { org: "organization-a", shop: "shop-b" },
        replace: true,
      }),
    );
    expect(screen.getByTestId("manager-scope").getAttribute("data-shop-id")).toBe("shop-b");
  });

  it("active店舗がなければsetup mutationを開かず、管理画面への回復導線を表示する", () => {
    renderPage({ activeShops: [], requestedShopId: undefined });

    fireEvent.click(screen.getByRole("button", { name: "管理を開く" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/app/manage",
      search: { org: "organization-a" },
    });
    expect(mocks.useShopQuery).not.toHaveBeenCalled();
  });

  it("canonical一覧確定後に店舗queryがnullなら旧Setupへfallbackせず利用不可を表示する", () => {
    mocks.useShopQuery.mockReturnValue(null);
    renderPage();

    expect(screen.getByRole("heading", { name: "この店舗を開けません" })).not.toBeNull();
    expect(mocks.dashboardProps).toBeUndefined();
  });
});
