// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useQuery: vi.fn(),
  getUserDetailRef: Symbol("getUserDetail"),
  getBackDestination: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("convex/react", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/convex/_generated/api", () => ({
  api: { organization: { userDetailQueries: { getUserDetail: mocks.getUserDetailRef } } },
}));

vi.mock("@/src/components/features/UserDetail", () => ({
  getUserShopDetailBackDestination: mocks.getBackDestination,
}));

vi.mock("@/src/components/features/UserShopDetail", () => ({
  UserShopDetailSkeleton: () => <output>loading</output>,
  UserShopDetail: ({
    targetShopId,
    onBack,
    onMembershipRemoved,
  }: {
    targetShopId: string;
    onBack: () => void;
    onMembershipRemoved: () => void;
  }) => (
    <div>
      <output data-testid="target-shop">{targetShopId}</output>
      <button type="button" onClick={onBack}>
        戻る
      </button>
      <button type="button" onClick={onMembershipRemoved}>
        所属削除完了
      </button>
    </div>
  ),
}));

vi.mock("@/src/components/templates/AuthenticatedPageContent", () => ({
  AuthenticatedPageContent: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/src/components/templates/Header", () => ({ HEADER_HEIGHT: { base: "48px", md: "64px" } }));
vi.mock("@/src/components/ui/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
  DefaultErrorFallback: () => <output>error</output>,
}));
vi.mock("@/src/components/ui/Button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));
vi.mock("@/src/components/ui/Empty", () => ({ Empty: () => <output>empty</output> }));

import { UserShopDetailPage } from ".";

const backDestination = {
  to: "/users/$personId",
  params: { personId: "person-target" },
  search: {
    shop: "shop-source",
    returnTo: "shopDetail",
    returnShop: "shop-origin",
    returnShopTo: "dashboard",
    users: 30,
  },
};
const data = {
  person: { id: "person-target", name: "田中 花子" },
  memberships: [{ shopId: "shop-target", staffId: "staff-target" }],
};

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.useQuery.mockReset();
  mocks.getBackDestination.mockReset();
  mocks.useQuery.mockReturnValue(data);
  mocks.getBackDestination.mockReturnValue(backDestination);
});

describe("UserShopDetailPage", () => {
  it("ユーザー詳細queryへpathのtargetShopIdを明示し、出発店舗は選択に使わない", () => {
    render(
      <UserShopDetailPage
        personId="person-target"
        targetShopId="shop-target"
        selectedShopId="shop-source"
        returnTo="shopDetail"
        returnShopId="shop-origin"
        returnShopTo="dashboard"
        visibleUserCount={30}
      />,
    );

    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.getUserDetailRef, {
      shopId: "shop-target",
      personId: "person-target",
      now: expect.any(Number),
      requireTargetShopMembership: true,
    });
    expect(screen.getByTestId("target-shop").textContent).toBe("shop-target");
    expect(mocks.getBackDestination).toHaveBeenCalledWith(
      "person-target",
      "shop-source",
      "shopDetail",
      30,
      "shop-origin",
      "dashboard",
    );
  });

  it.each(["戻る", "所属削除完了"])("%sでは元の検索条件を持つユーザー詳細へreplaceで戻る", (buttonName) => {
    render(
      <UserShopDetailPage
        personId="person-target"
        targetShopId="shop-target"
        selectedShopId="shop-source"
        returnTo="shopDetail"
        returnShopId="shop-origin"
        returnShopTo="dashboard"
        visibleUserCount={30}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({ ...backDestination, replace: true });
  });
});
