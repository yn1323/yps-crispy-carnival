// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentNavigate: vi.fn(),
  pathlessRouteNavigate: vi.fn(),
  useNavigate: vi.fn(),
  usePathlessRouteNavigate: vi.fn(),
  useSearch: vi.fn(),
  authGuardProps: vi.fn(),
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
  useNavigate: mocks.useNavigate,
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: mocks.pathname } }),
}));

vi.mock("@/src/components/features/AuthenticatedApp", () => ({
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
  UnauthenticatedBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
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
  mocks.pathname = "/dashboard";

  mocks.useNavigate.mockReturnValue(mocks.currentNavigate);
  mocks.usePathlessRouteNavigate.mockReturnValue(mocks.pathlessRouteNavigate);
  mocks.useSearch.mockReturnValue({});
});

describe("認証済み親route", () => {
  it("ログイン設定では店舗contextを要求せず、shopだけを除去して他のqueryを維持する", async () => {
    mocks.pathname = "/account/security";
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

    expect(mocks.useNavigate).toHaveBeenCalledTimes(1);
    expect(mocks.usePathlessRouteNavigate).not.toHaveBeenCalled();
    expect(mocks.pathlessRouteNavigate).not.toHaveBeenCalled();
    expect(mocks.currentNavigate).toHaveBeenCalledTimes(1);

    const navigation = mocks.currentNavigate.mock.calls[0]?.[0];
    expect(navigation).toMatchObject({ to: ".", replace: true });
    expect(navigation.search({ tab: "shops" })).toEqual({ tab: "shops", shop: "shop-a" });
  });
});
