// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  getSettingsRef: Symbol("getSettings"),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/manage">{children}</a>,
}));
vi.mock("convex/react", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/convex/_generated/api", () => ({
  api: { organization: { queries: { getSettings: mocks.getSettingsRef } } },
}));
vi.mock("@/src/components/features/ShopDetail", () => ({
  ShopDetailSkeleton: () => <output>loading</output>,
  ShopDetail: ({ shop, organizationId }: { shop: { id: string }; organizationId: string }) => (
    <div>
      <output data-testid="shop">{shop.id}</output>
      <output data-testid="expected-organization">{organizationId}</output>
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
  Button: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/src/components/ui/Empty", () => ({ Empty: () => <output>empty</output> }));

import { AppShopDetailPage } from ".";

beforeEach(() => {
  mocks.useQuery.mockReset();
});

describe("AppShopDetailPage", () => {
  it("URLのshopとexpected organizationで詳細を読み、同じ組織scopeをcontrollerへ渡す", () => {
    mocks.useQuery.mockReturnValue({
      shops: [{ id: "shop-target" }, { id: "shop-return" }],
      people: [],
    });

    render(<AppShopDetailPage shopId="shop-target" organizationId={"organization-a" as Id<"organizations">} />);

    expect(mocks.useQuery).toHaveBeenCalledExactlyOnceWith(mocks.getSettingsRef, {
      shopId: "shop-target",
      expectedOrganizationId: "organization-a",
      planIdVersion: 2,
    });
    expect(screen.getByTestId("shop").textContent).toBe("shop-target");
    expect(screen.getByTestId("expected-organization").textContent).toBe("organization-a");
  });

  it("対象店舗がexpected organizationの結果にない場合はEmptyへ寄せる", () => {
    mocks.useQuery.mockReturnValue({ shops: [{ id: "shop-other" }], people: [] });

    render(<AppShopDetailPage shopId="shop-target" organizationId={"organization-a" as Id<"organizations">} />);

    expect(screen.getByText("empty").textContent).toBe("empty");
  });
});
