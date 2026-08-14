// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentNavigate: vi.fn(),
  pathlessRouteNavigate: vi.fn(),
  useNavigate: vi.fn(),
  usePathlessRouteNavigate: vi.fn(),
  useSearch: vi.fn(),
  authGuardProps: vi.fn(),
  organizationProviderProps: vi.fn(),
  authenticatedAppShellProps: vi.fn(),
  focusedFlowHeaderProps: vi.fn(),
  featureRequestActionProps: vi.fn(),
  appShell: null as
    | null
    | {
        mode: "navigation";
        activeKey: "home" | "shifts" | "staff" | "actions" | "manage" | null;
      }
    | {
        mode: "focused";
        title: string;
        backTo: "/app/shifts" | "/app/manage/managers";
        backLabel: string;
      },
  pathname: "/dashboard",
}));

vi.mock("@chakra-ui/react", () => ({
  Box: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useNavigate: mocks.usePathlessRouteNavigate,
    useSearch: mocks.useSearch,
  }),
  Outlet: () => <div data-testid="outlet" />,
  useMatches: () => [],
  useNavigate: mocks.useNavigate,
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: mocks.pathname } }),
}));

vi.mock("@/src/components/features/AuthenticatedApp", () => ({
  AppOrganizationScopeProvider: ({
    children,
    requestedOrganizationId,
  }: {
    children: ReactNode;
    requestedOrganizationId?: string;
  }) => {
    mocks.organizationProviderProps({ requestedOrganizationId });
    return children;
  },
  AppOrganizationStateView: () => <div data-testid="organization-state" />,
  AppOrganizationSwitcher: ({
    options,
    onSelect,
  }: {
    options: { id: string; name: string }[] | null;
    onSelect: (organizationId: string) => void;
  }) =>
    options?.map((organization) => (
      <button key={organization.id} type="button" onClick={() => onSelect(organization.id)}>
        {organization.name}へ切り替える
      </button>
    )),
  AuthenticatedHeader: () => null,
  AuthGuard: ({
    children,
    onNormalizeShopUrl,
    requiresShopContext,
    requestedShopId,
  }: {
    children: ReactNode;
    onNormalizeShopUrl: (shopId: string) => void;
    requiresShopContext: boolean;
    requestedShopId?: string;
  }) => {
    mocks.authGuardProps({ requiresShopContext, requestedShopId });
    return (
      <>
        <button type="button" onClick={() => onNormalizeShopUrl("shop-a")}>
          店舗URLを補う
        </button>
        {children}
      </>
    );
  },
  getCanonicalAppHref: () => null,
  isAppPath: (pathname: string) => pathname === "/app" || pathname.startsWith("/app/"),
  resolveAppFeatureRequestScope: () => ({ kind: "organization" }),
  resolveAppOrganizationSwitchTarget: (pathname: string, organizationId: string) => {
    const parentPath = pathname.startsWith("/app/staff/") ? "/app/staff" : pathname;
    return { to: parentPath, search: { org: organizationId } };
  },
  resolveAppShellRouteData: () => mocks.appShell,
  UnauthenticatedBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAppOrganizationScope: () => ({
    organizationId: "organization-a",
    organizationName: "A組織",
    memberStatus: "active",
    organizations: [
      { id: "organization-a", name: "A組織", memberStatus: "active" },
      { id: "organization-b", name: "B組織", memberStatus: "readOnly" },
    ],
    activeShops: [],
  }),
}));

vi.mock("@/src/components/features/FeatureRequestDialog", () => ({
  AppFeatureRequestAction: (props: { expectedOrganizationId: string; scope: { kind: "organization" } }) => {
    mocks.featureRequestActionProps(props);
    return <button type="button">要望を送る</button>;
  },
}));

vi.mock("@/src/components/templates/AuthenticatedAppShell", () => ({
  AuthenticatedAppShell: ({
    children,
    organizationSwitcher,
    featureRequest,
  }: {
    children: ReactNode;
    organizationSwitcher?: ReactNode;
    featureRequest?: { expectedOrganizationId: string; scope: { kind: "organization" } };
  }) => {
    mocks.authenticatedAppShellProps({ featureRequest });
    return (
      <div data-testid="app-shell">
        {organizationSwitcher}
        {children}
      </div>
    );
  },
}));

vi.mock("@/src/components/templates/FocusedFlowHeader", () => ({
  FocusedFlowHeader: ({ action }: { action?: ReactNode }) => {
    mocks.focusedFlowHeaderProps({ action });
    return <header data-testid="focused-header">{action}</header>;
  },
}));

vi.mock("@/src/components/templates/Header", () => ({
  HEADER_HEIGHT: { base: "0px", md: "0px" },
}));

vi.mock("@/src/providers/AuthProviders", () => ({
  AuthProviders: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { Route } from "./_auth";

beforeEach(() => {
  mocks.currentNavigate.mockReset();
  mocks.pathlessRouteNavigate.mockReset();
  mocks.useNavigate.mockReset();
  mocks.usePathlessRouteNavigate.mockReset();
  mocks.useSearch.mockReset();
  mocks.authGuardProps.mockReset();
  mocks.organizationProviderProps.mockReset();
  mocks.authenticatedAppShellProps.mockReset();
  mocks.focusedFlowHeaderProps.mockReset();
  mocks.featureRequestActionProps.mockReset();
  mocks.appShell = null;
  mocks.pathname = "/dashboard";

  mocks.useNavigate.mockReturnValue(mocks.currentNavigate);
  mocks.usePathlessRouteNavigate.mockReturnValue(mocks.pathlessRouteNavigate);
  mocks.useSearch.mockReturnValue({});
});

describe("認証済み親route", () => {
  it("アカウント設定では店舗contextを要求せず、shopだけを除去して他のqueryを維持する", async () => {
    mocks.pathname = "/account";
    mocks.useSearch.mockReturnValue({ shop: "shop-a" });
    const RouteComponent = Route.options.component;
    if (!RouteComponent) throw new Error("Route component is required");

    render(<RouteComponent />);

    expect(mocks.authGuardProps).toHaveBeenCalledWith({ requiresShopContext: false, requestedShopId: undefined });
    await waitFor(() => expect(mocks.currentNavigate).toHaveBeenCalledTimes(1));

    const navigation = mocks.currentNavigate.mock.calls[0]?.[0];
    expect(navigation).toMatchObject({ to: ".", replace: true });
    expect(navigation.search({ shop: "shop-a", callback: "keep" })).toEqual({
      shop: undefined,
      callback: "keep",
    });
  });

  it("店舗URLの補完では現在画面基準のnavigateを使い、pathless親route基準へ戻さない", () => {
    const RouteComponent = Route.options.component;
    if (!RouteComponent) throw new Error("Route component is required");
    render(<RouteComponent />);

    fireEvent.click(screen.getByRole("button", { name: "店舗URLを補う" }));

    expect(mocks.useNavigate).toHaveBeenCalledTimes(2);
    expect(mocks.usePathlessRouteNavigate).not.toHaveBeenCalled();
    expect(mocks.pathlessRouteNavigate).not.toHaveBeenCalled();
    expect(mocks.currentNavigate).toHaveBeenCalledTimes(1);

    const navigation = mocks.currentNavigate.mock.calls[0]?.[0];
    expect(navigation).toMatchObject({ to: ".", replace: true });
    expect(navigation.search({ tab: "shops" })).toEqual({ tab: "shops", shop: "shop-a" });
  });

  it("app Homeのshopは旧店舗contextとして除去せず、org providerへ接続する", () => {
    mocks.pathname = "/app/home";
    mocks.appShell = { mode: "navigation", activeKey: "home" };
    mocks.useSearch.mockReturnValue({ org: "organization-a", shop: "home-shop" });
    const RouteComponent = Route.options.component;
    if (!RouteComponent) throw new Error("Route component is required");

    render(<RouteComponent />);

    expect(mocks.authGuardProps).toHaveBeenCalledWith({ requiresShopContext: false, requestedShopId: undefined });
    expect(mocks.organizationProviderProps).toHaveBeenCalledWith({ requestedOrganizationId: "organization-a" });
    expect(mocks.authenticatedAppShellProps).toHaveBeenCalledWith({
      featureRequest: {
        expectedOrganizationId: "organization-a",
        scope: { kind: "organization" },
      },
    });
    expect(mocks.currentNavigate).not.toHaveBeenCalled();
  });

  it("app Accountはorganization providerと要望送信を利用しない", () => {
    mocks.pathname = "/app/account";
    mocks.appShell = { mode: "navigation", activeKey: null };
    mocks.useSearch.mockReturnValue({ flow: "overview", oauth: "success" });
    const RouteComponent = Route.options.component;
    if (!RouteComponent) throw new Error("Route component is required");

    render(<RouteComponent />);

    expect(screen.getByTestId("app-shell")).toBeTruthy();
    expect(mocks.organizationProviderProps).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "B組織へ切り替える" })).toBeNull();
    expect(screen.queryByRole("button", { name: "要望を送る" })).toBeNull();
    expect(mocks.authenticatedAppShellProps).toHaveBeenCalledWith({ featureRequest: undefined });
    expect(mocks.featureRequestActionProps).not.toHaveBeenCalled();
  });

  it("詳細画面で組織を変更すると旧entityを持ち越さず同じ主タブへ移動する", () => {
    mocks.pathname = "/app/staff/person-a";
    mocks.appShell = { mode: "navigation", activeKey: "staff" };
    mocks.useSearch.mockReturnValue({ org: "organization-a" });
    const RouteComponent = Route.options.component;
    if (!RouteComponent) throw new Error("Route component is required");

    render(<RouteComponent />);
    fireEvent.click(screen.getByRole("button", { name: "B組織へ切り替える" }));

    expect(mocks.currentNavigate).toHaveBeenCalledWith({
      to: "/app/staff",
      search: { org: "organization-b" },
    });
  });

  it("シフト調整画面は共通appヘッダーと組織切替を表示する", () => {
    mocks.pathname = "/app/shifts/recruitment-a/board";
    mocks.appShell = { mode: "navigation", activeKey: "shifts" };
    mocks.useSearch.mockReturnValue({ org: "organization-a" });
    const RouteComponent = Route.options.component;
    if (!RouteComponent) throw new Error("Route component is required");

    render(<RouteComponent />);

    expect(screen.getByTestId("app-shell")).toBeTruthy();
    expect(screen.getByRole("button", { name: "B組織へ切り替える" })).toBeTruthy();
    expect(mocks.focusedFlowHeaderProps).not.toHaveBeenCalled();
    expect(mocks.authenticatedAppShellProps).toHaveBeenCalledWith({
      featureRequest: {
        expectedOrganizationId: "organization-a",
        scope: { kind: "organization" },
      },
    });
  });

  it("管理者招待の集中フローでは組織切替を表示しない", () => {
    mocks.pathname = "/app/manage/managers/invite-staff";
    mocks.appShell = {
      mode: "focused",
      title: "既存スタッフを招待",
      backTo: "/app/manage/managers",
      backLabel: "管理者と権限へ戻る",
    };
    mocks.useSearch.mockReturnValue({ org: "organization-a" });
    const RouteComponent = Route.options.component;
    if (!RouteComponent) throw new Error("Route component is required");

    render(<RouteComponent />);

    const focusedHeader = screen.getByTestId("focused-header");
    expect(focusedHeader).toBeTruthy();
    expect(mocks.focusedFlowHeaderProps).toHaveBeenCalledWith({ action: expect.anything() });
    expect(within(focusedHeader).getByRole("button", { name: "要望を送る" })).toBeTruthy();
    expect(mocks.featureRequestActionProps).toHaveBeenCalledWith({
      expectedOrganizationId: "organization-a",
      scope: { kind: "organization" },
    });
    expect(screen.queryByRole("button", { name: "B組織へ切り替える" })).toBeNull();
  });
});
