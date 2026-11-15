// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  getShiftSetupRef: Symbol("getShiftSetup"),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/manage">{children}</a>,
}));
vi.mock("convex/react", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/convex/_generated/api", () => ({
  api: { shiftSetup: { queries: { getShiftSetup: mocks.getShiftSetupRef } } },
}));
vi.mock("@/src/components/features/ShiftSetup", () => ({
  ShiftSetupSkeleton: () => <output>loading</output>,
  ShiftSetup: ({
    shopId,
    organizationId,
    setup,
  }: {
    shopId: string;
    organizationId: string;
    setup: { shopName: string };
  }) => (
    <div>
      <output data-testid="shop">{shopId}</output>
      <output data-testid="expected-organization">{organizationId}</output>
      <output data-testid="shop-name">{setup.shopName}</output>
    </div>
  ),
}));
vi.mock("@/src/components/templates/AuthenticatedPageContent", () => ({
  AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT: {},
  AuthenticatedPageContent: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/src/components/ui/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
  DefaultErrorFallback: () => <output>error</output>,
}));
vi.mock("@/src/components/ui/Button", () => ({
  Button: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/src/components/ui/Empty", () => ({ Empty: () => <output>empty</output> }));

import { AppShiftSetupPage } from ".";

const organizationId = "organization-a" as Id<"organizations">;

beforeEach(() => {
  mocks.useQuery.mockReset();
});

describe("AppShiftSetupPage", () => {
  it("URLのshopとexpected organizationで設定を読み、同じscopeをfeatureへ渡す", () => {
    mocks.useQuery.mockReturnValue({ shopName: "新宿店" });

    render(<AppShiftSetupPage shopId="shop-target" organizationId={organizationId} />);

    expect(mocks.useQuery).toHaveBeenCalledExactlyOnceWith(mocks.getShiftSetupRef, {
      shopId: "shop-target",
      expectedOrganizationId: "organization-a",
    });
    expect(screen.getByTestId("shop").textContent).toBe("shop-target");
    expect(screen.getByTestId("expected-organization").textContent).toBe("organization-a");
    expect(screen.getByTestId("shop-name").textContent).toBe("新宿店");
  });

  it("読み込み中はLoadingを出し、featureを描画しない", () => {
    mocks.useQuery.mockReturnValue(undefined);

    render(<AppShiftSetupPage shopId="shop-target" organizationId={organizationId} />);

    expect(screen.getByText("loading").textContent).toBe("loading");
    expect(screen.queryByTestId("shop")).toBeNull();
  });

  it("別組織の店舗や削除済みの店舗で設定を読めない場合は、Emptyへ寄せて内容を出さない", () => {
    mocks.useQuery.mockReturnValue(null);

    render(<AppShiftSetupPage shopId="shop-target" organizationId={organizationId} />);

    expect(screen.getByText("empty").textContent).toBe("empty");
    expect(screen.queryByTestId("shop")).toBeNull();
  });
});
