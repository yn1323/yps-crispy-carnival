// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentNavigate: vi.fn(),
  pathlessRouteNavigate: vi.fn(),
  redirect: vi.fn(),
  useNavigate: vi.fn(),
  usePathlessRouteNavigate: vi.fn(),
  useSearch: vi.fn(),
  authGuardProps: vi.fn(),
  organizationProviderProps: vi.fn(),
  authenticatedAppShellProps: vi.fn(),
  focusedFlowHeaderProps: vi.fn(),
  featureRequestActionProps: vi.fn(),
  fullPageSpinnerProps: vi.fn(),
  getCanonicalAppHref: vi.fn(),
  appShell: null as
    | null
    | {
        mode: "navigation";
        activeKey: "home" | "shifts" | "staff" | "actions" | "manage" | null;
      }
    | {
        mode: "focused";
        title: string;
        backLabel: string;
      },
  pathname: "/dashboard",
  organizationState: null as null | { kind: "empty" | "loading" },
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
  redirect: mocks.redirect,
  useMatches: () => [],
  useNavigate: mocks.useNavigate,
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: mocks.pathname } }),
}));

vi.mock("@/src/components/features/AuthenticatedApp", () => ({
  AppOrganizationScopeProvider: ({
    children,
    requestedOrganizationId,
    renderState,
  }: {
    children: ReactNode;
    requestedOrganizationId?: string;
    renderState: (state: { kind: "empty" | "loading" }) => ReactNode;
  }) => {
    mocks.organizationProviderProps({ requestedOrganizationId });
    return mocks.organizationState ? renderState(mocks.organizationState) : children;
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
  AuthGuard: ({ children }: { children: ReactNode }) => {
    mocks.authGuardProps();
    return children;
  },
  getCanonicalAppHref: mocks.getCanonicalAppHref,
  isAppOrganizationScopedPath: (pathname: string) => {
    const normalized = (pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname).toLowerCase();
    return (
      normalized === "/dashboard" ||
      normalized === "/actions" ||
      normalized === "/shifts" ||
      normalized.startsWith("/shifts/") ||
      normalized === "/staff" ||
      (normalized.startsWith("/staff/") && normalized !== "/staff/register") ||
      normalized === "/manage" ||
      normalized.startsWith("/manage/") ||
      normalized === "/app" ||
      normalized.startsWith("/app/")
    );
  },
  resolveAppFeatureRequestScope: () => ({ kind: "organization" }),
  resolveAppOrganizationSwitchTarget: (pathname: string, organizationId: string) => {
    const parentPath = pathname.startsWith("/staff/") ? "/staff" : pathname;
    return { to: parentPath, search: { org: organizationId } };
  },
  resolveAppShellRouteData: () => mocks.appShell,
  UnauthenticatedBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAppOrganizationScope: () => ({
    organizationId: "organization-a",
    organizationName: "A組織",
    organizations: [
      { id: "organization-a", name: "A組織" },
      { id: "organization-b", name: "B組織" },
    ],
    shops: [],
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
    showPrimaryNavigation,
  }: {
    children: ReactNode;
    organizationSwitcher?: ReactNode;
    featureRequest?: { expectedOrganizationId: string; scope: { kind: "organization" } };
    showPrimaryNavigation?: boolean;
  }) => {
    mocks.authenticatedAppShellProps({
      featureRequest,
      ...(showPrimaryNavigation === undefined ? {} : { showPrimaryNavigation }),
    });
    return (
      <div data-testid="app-shell">
        {organizationSwitcher}
        {featureRequest && <button type="button">要望を送る</button>}
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

vi.mock("@/src/components/templates/FullPageSpinner", () => ({
  FullPageSpinner: (props: { reserveHeaderSpace?: boolean; mobileNavigationHeight?: string }) => {
    mocks.fullPageSpinnerProps(props);
    return <div data-testid="full-page-spinner" />;
  },
}));

vi.mock("@/src/components/templates/Header", () => ({
  HEADER_HEIGHT: { base: "0px", md: "0px" },
}));

vi.mock("@/src/providers/AuthProviders", () => ({
  AuthProviders: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/src/pages/dashboard", () => ({
  DashboardSetupPage: () => <main data-testid="dashboard-setup">初回設定</main>,
}));

import { Route } from "./_auth";

beforeEach(() => {
  mocks.currentNavigate.mockReset();
  mocks.pathlessRouteNavigate.mockReset();
  mocks.redirect.mockReset();
  mocks.useNavigate.mockReset();
  mocks.usePathlessRouteNavigate.mockReset();
  mocks.useSearch.mockReset();
  mocks.authGuardProps.mockReset();
  mocks.organizationProviderProps.mockReset();
  mocks.authenticatedAppShellProps.mockReset();
  mocks.focusedFlowHeaderProps.mockReset();
  mocks.featureRequestActionProps.mockReset();
  mocks.fullPageSpinnerProps.mockReset();
  mocks.getCanonicalAppHref.mockReset();
  mocks.appShell = null;
  mocks.pathname = "/dashboard";
  mocks.organizationState = null;

  mocks.useNavigate.mockReturnValue(mocks.currentNavigate);
  mocks.usePathlessRouteNavigate.mockReturnValue(mocks.pathlessRouteNavigate);
  mocks.useSearch.mockReturnValue({});
  mocks.redirect.mockImplementation(() => new Error("redirect"));
  mocks.getCanonicalAppHref.mockReturnValue(null);
});

function callBeforeLoad(pathname: string, searchStr: string) {
  const beforeLoad = Route.options.beforeLoad;
  if (!beforeLoad) throw new Error("beforeLoad is required");
  return beforeLoad({ location: { pathname, searchStr } } as never);
}

describe("認証済み親route", () => {
  it("未認証判定前にcanonical protected routeのcredential・PII候補を復帰先から除去する", () => {
    mocks.getCanonicalAppHref.mockReturnValue("/staff/person-a?org=org-a");

    expect(() => callBeforeLoad("/staff/person-a", "?org=org-a&token=secret&email=manager%40example.com")).toThrow(
      "redirect",
    );

    expect(mocks.getCanonicalAppHref).toHaveBeenCalledWith(
      "/staff/person-a",
      "?org=org-a&token=secret&email=manager%40example.com",
    );
    expect(mocks.redirect).toHaveBeenCalledWith({
      href: "/staff/person-a?org=org-a",
      replace: true,
    });
    expect(mocks.authGuardProps).not.toHaveBeenCalled();
  });

  it.each(["/staff/register", "/shifts/submit"])(
    "公開route %s は認証routeのcanonicalization対象にしない",
    (pathname) => {
      expect(() => callBeforeLoad(pathname, "?token=public-capability")).not.toThrow();
      expect(mocks.getCanonicalAppHref).toHaveBeenLastCalledWith(pathname, "?token=public-capability");
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it.each(["/account", "/Account", "/account/"])(
    "未認証判定前に%sの未知値とcredential・PII候補を復帰先から除去する",
    (pathname) => {
      expect(() =>
        callBeforeLoad(
          pathname,
          "?flow=connect-google&oauth=google&token=secret&code=oauth-code&email=manager%40example.com&unknown=value",
        ),
      ).toThrow("redirect");

      expect(mocks.redirect).toHaveBeenCalledWith({
        href: "/account?flow=connect-google&oauth=google",
        replace: true,
      });
    },
  );

  it("accountの許可済みflowとOAuth markerだけならbeforeLoadで置換しない", () => {
    expect(() => callBeforeLoad("/account", "?flow=connect-google&oauth=google")).not.toThrow();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("認証後routeのpendingではヘッダー分の余白を予約する", () => {
    mocks.appShell = { mode: "navigation", activeKey: "home" };
    const PendingComponent = Route.options.pendingComponent as ComponentType;

    render(<PendingComponent />);

    expect(mocks.fullPageSpinnerProps).toHaveBeenCalledWith({
      reserveHeaderSpace: true,
      mobileNavigationHeight: "68px",
    });
  });

  it("アカウント設定は本文を組織scopeに依存させず、canonical組織の要望送信を表示する", () => {
    mocks.pathname = "/Account/";
    mocks.appShell = { mode: "navigation", activeKey: null };
    mocks.useSearch.mockReturnValue({ org: "organization-a", flow: "connect-google", oauth: "google" });
    const RouteComponent = Route.options.component;
    if (!RouteComponent) throw new Error("Route component is required");

    render(<RouteComponent />);

    expect(screen.getByTestId("app-shell")).toBeTruthy();
    expect(mocks.organizationProviderProps).toHaveBeenCalledWith({ requestedOrganizationId: "organization-a" });
    expect(screen.queryByRole("button", { name: "B組織へ切り替える" })).toBeNull();
    expect(screen.getByRole("button", { name: "要望を送る" })).toBeTruthy();
    expect(mocks.authenticatedAppShellProps).toHaveBeenCalledWith({
      featureRequest: {
        expectedOrganizationId: "organization-a",
        scope: { kind: "organization" },
      },
    });
  });

  it("組織に所属していないアカウント設定は本文を表示し、要望送信を表示しない", () => {
    mocks.pathname = "/account";
    mocks.appShell = { mode: "navigation", activeKey: null };
    mocks.organizationState = { kind: "empty" };
    const RouteComponent = Route.options.component;
    if (!RouteComponent) throw new Error("Route component is required");

    render(<RouteComponent />);

    expect(screen.getByTestId("app-shell")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "要望を送る" })).toBeNull();
    expect(mocks.authenticatedAppShellProps).toHaveBeenCalledWith({ featureRequest: undefined });
  });

  it("Dashboardのorg・shopを新しい組織scopeとapp shellへ接続する", () => {
    mocks.pathname = "/Dashboard/";
    mocks.appShell = { mode: "navigation", activeKey: "home" };
    mocks.useSearch.mockReturnValue({ org: "organization-a", shop: "home-shop" });
    const RouteComponent = Route.options.component;
    if (!RouteComponent) throw new Error("Route component is required");

    render(<RouteComponent />);

    expect(mocks.organizationProviderProps).toHaveBeenCalledWith({ requestedOrganizationId: "organization-a" });
    expect(mocks.authenticatedAppShellProps).toHaveBeenCalledWith({
      featureRequest: {
        expectedOrganizationId: "organization-a",
        scope: { kind: "organization" },
      },
    });
    expect(mocks.currentNavigate).not.toHaveBeenCalled();
  });

  it("組織が未作成ならDashboardの初回Setupを新shell内に表示する", () => {
    mocks.pathname = "/Dashboard/";
    mocks.appShell = { mode: "navigation", activeKey: "home" };
    mocks.organizationState = { kind: "empty" };
    const RouteComponent = Route.options.component;
    if (!RouteComponent) throw new Error("Route component is required");

    render(<RouteComponent />);

    expect(screen.getByTestId("app-shell")).toBeTruthy();
    expect(screen.getByTestId("dashboard-setup")).toBeTruthy();
    expect(screen.queryByTestId("organization-state")).toBeNull();
    expect(mocks.authenticatedAppShellProps).toHaveBeenCalledWith({
      featureRequest: undefined,
      showPrimaryNavigation: false,
    });
  });

  it("詳細画面で組織を変更すると旧entityを持ち越さず同じ主タブへ移動する", () => {
    mocks.pathname = "/staff/person-a";
    mocks.appShell = { mode: "navigation", activeKey: "staff" };
    mocks.useSearch.mockReturnValue({ org: "organization-a" });
    const RouteComponent = Route.options.component;
    if (!RouteComponent) throw new Error("Route component is required");

    render(<RouteComponent />);
    fireEvent.click(screen.getByRole("button", { name: "B組織へ切り替える" }));

    expect(mocks.currentNavigate).toHaveBeenCalledWith({
      to: "/staff",
      search: { org: "organization-b" },
    });
  });

  it("シフト調整画面は共通appヘッダーと組織切替を表示する", () => {
    mocks.pathname = "/shifts/recruitment-a/board";
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
    mocks.pathname = "/manage/managers/invite-staff";
    mocks.appShell = {
      mode: "focused",
      title: "既存スタッフを招待",
      backLabel: "前の画面へ戻る",
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
