// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  historyBack: vi.fn(),
  useQuery: vi.fn(),
  getUserDetailRef: Symbol("getUserDetail"),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { back: mocks.historyBack } }),
}));
vi.mock("convex/react", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/convex/_generated/api", () => ({
  api: { organization: { userDetailQueries: { getUserDetail: mocks.getUserDetailRef } } },
}));

vi.mock("@/src/components/features/UserShopDetail", () => ({
  UserShopDetailSkeleton: () => <output>loading</output>,
  UserShopDetail: ({
    targetShopId,
    expectedOrganizationId,
    onBack,
  }: {
    targetShopId: string;
    expectedOrganizationId?: string;
    onBack: () => void;
  }) => (
    <div>
      <output data-testid="target-shop">{targetShopId}</output>
      <output data-testid="expected-organization">{expectedOrganizationId}</output>
      <button type="button" onClick={onBack}>
        戻る
      </button>
    </div>
  ),
}));

vi.mock("@/src/components/templates/AuthenticatedPageContent", () => ({
  AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT: {},
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

const data = {
  person: { id: "person-target", name: "田中 花子" },
  memberships: [{ shopId: "shop-target", staffId: "staff-target" }],
};

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.historyBack.mockReset();
  mocks.useQuery.mockReset();
  mocks.useQuery.mockReturnValue(data);
});

describe("UserShopDetailPage", () => {
  it("pathのshopとcanonical organizationをread/write controllerへ渡す", () => {
    render(
      <UserShopDetailPage
        personId="person-target"
        targetShopId="shop-target"
        appOrganizationId={"organization-a" as Id<"organizations">}
      />,
    );

    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.getUserDetailRef, {
      shopId: "shop-target",
      personId: "person-target",
      now: expect.any(Number),
      requireTargetShopMembership: true,
      expectedOrganizationId: "organization-a",
    });
    expect(screen.getByTestId("target-shop").textContent).toBe("shop-target");
    expect(screen.getByTestId("expected-organization").textContent).toBe("organization-a");
  });

  it("戻るではブラウザ履歴へ戻る", () => {
    render(
      <UserShopDetailPage
        personId="person-target"
        targetShopId="shop-target"
        appOrganizationId={"organization-a" as Id<"organizations">}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "戻る" }));

    expect(mocks.historyBack).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
