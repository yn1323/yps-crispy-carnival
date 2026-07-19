// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasSelectedShop: true,
  pathname: "/settings",
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: mocks.pathname } }),
}));

vi.mock("jotai", () => ({
  useAtomValue: () => mocks.hasSelectedShop,
}));

vi.mock("@/src/components/features/FeatureRequestDialog", () => ({
  FeatureRequestAction: () => <div>要望を送る</div>,
}));

vi.mock("@/src/components/features/ShopSwitcher", () => ({
  ShopSwitcher: () => <div>店舗切替</div>,
}));

vi.mock("@/src/components/features/UserMenu", () => ({
  UserMenu: () => <div>ユーザーメニュー</div>,
}));

vi.mock("@/src/components/templates/Header", () => ({
  Header: ({ userActions }: { userActions: ReactNode }) => <header>{userActions}</header>,
}));

vi.mock("@/src/stores/shop", () => ({
  hasSelectedShopAtom: Symbol("hasSelectedShopAtom"),
}));

import { AuthenticatedHeader } from ".";

beforeEach(() => {
  mocks.hasSelectedShop = true;
  mocks.pathname = "/settings";
});

describe("AuthenticatedHeader", () => {
  it.each(["/dashboard", "/settings", "/users/person-1"])("%sでは店舗切替を表示しない", (pathname) => {
    mocks.pathname = pathname;

    render(<AuthenticatedHeader />);

    expect(screen.queryByText("店舗切替")).toBeNull();
    expect(screen.getByText("要望を送る")).not.toBeNull();
  });

  it("店舗コンテキストが必要な画面では店舗切替を表示する", () => {
    mocks.pathname = "/shift/create";

    render(<AuthenticatedHeader />);

    expect(screen.getByText("店舗切替")).not.toBeNull();
  });
});
