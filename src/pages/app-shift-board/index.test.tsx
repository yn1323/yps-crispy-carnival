// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  scopeQueryRef: Symbol("getShiftBoardShopScopeForOrganization"),
  dataQueryRef: Symbol("getShiftBoardData"),
  queryResults: { scope: undefined as unknown, data: undefined as unknown },
}));

vi.mock("@chakra-ui/react", () => ({
  Box: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Flex: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("convex/react", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/convex/_generated/api", () => ({
  api: {
    shiftBoard: {
      queries: {
        getShiftBoardShopScopeForOrganization: mocks.scopeQueryRef,
        getShiftBoardData: mocks.dataQueryRef,
      },
    },
  },
}));
vi.mock("@/src/components/features/ShiftBoard", () => ({
  ShiftBoardPage: ({ data, layout }: { data: { shopId: string }; layout?: string }) => (
    <output data-testid="shop-id" data-layout={layout}>
      {data.shopId}
    </output>
  ),
}));
vi.mock("@/src/components/templates/Animation", () => ({
  Animation: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/src/components/templates/AuthenticatedAppShell", () => ({
  AUTHENTICATED_APP_CONTENT_HEIGHT: "100dvh",
}));
vi.mock("@/src/components/templates/FocusedFlowHeader", () => ({
  FocusedFlowHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/src/components/ui/Button", () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@/src/components/ui/Empty", () => ({
  Empty: ({ title, description }: { title: ReactNode; description?: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  ),
}));
vi.mock("@/src/components/ui/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/src/components/ui/ShiftoriLoading", () => ({
  ShiftoriLoading: ({ message }: { message?: ReactNode }) => <output>{message}</output>,
}));
vi.mock("@/src/pages/shift-board/useShiftBoardDayKey", () => ({
  useShiftBoardDayKey: () => "2026-08-14:test",
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
    <section data-testid="manager-shop-scope" data-shop-id={shopId} data-organization-id={expectedOrganizationId}>
      {children}
    </section>
  ),
}));

import { AppShiftBoardRoutePage } from ".";

beforeEach(() => {
  mocks.useQuery.mockReset();
  mocks.queryResults.scope = undefined;
  mocks.queryResults.data = undefined;
  mocks.useQuery.mockImplementation((reference) => {
    if (reference === mocks.scopeQueryRef) return mocks.queryResults.scope;
    if (reference === mocks.dataQueryRef) return mocks.queryResults.data;
    throw new Error("unexpected query reference");
  });
});

describe("AppShiftBoardRoutePage", () => {
  it("org欠落中はqueryを開始せず、組織scopeの確定を待つ", () => {
    render(<AppShiftBoardRoutePage recruitmentId="recruitment-1" />);

    expect(screen.getByText("組織を確認しています")).not.toBeNull();
    expect(mocks.useQuery).not.toHaveBeenCalled();
  });

  it("URLのorgと募集IDでqueryし、共通ヘッダー配下のapp layoutへ同じorg・shop scopeを渡す", () => {
    mocks.queryResults.scope = { shopId: "shop-1", shopName: "yn1323店舗" };
    mocks.queryResults.data = {
      shopId: "shop-1",
      recruitment: {
        deadline: "2026-08-12",
        periodStart: "2026-08-17",
        periodEnd: "2026-08-24",
        status: "open",
      },
      staffs: [{ isSubmitted: true }, { isSubmitted: false }, { isSubmitted: true, isRemoved: true }],
    };

    render(<AppShiftBoardRoutePage organizationId="organization-1" recruitmentId="recruitment-1" />);

    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.scopeQueryRef, {
      organizationId: "organization-1",
      recruitmentId: "recruitment-1",
    });
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.dataQueryRef, {
      shopId: "shop-1",
      expectedOrganizationId: "organization-1",
      recruitmentId: "recruitment-1",
      refreshDayKey: "2026-08-14:test",
    });
    expect(screen.getByTestId("shop-id").textContent).toBe("shop-1");
    expect(screen.getByTestId("shop-id").getAttribute("data-layout")).toBe("app");
    expect(screen.getByRole("heading", { name: "シフトを調整" })).not.toBeNull();
    const managerShopScope = screen.getByTestId("manager-shop-scope");
    expect(managerShopScope.getAttribute("data-shop-id")).toBe("shop-1");
    expect(managerShopScope.getAttribute("data-organization-id")).toBe("organization-1");
  });

  it("serverが対象外と判定した募集は空画面にせず利用不可を表示する", () => {
    mocks.queryResults.scope = null;

    render(<AppShiftBoardRoutePage organizationId="organization-1" recruitmentId="other-recruitment" />);

    expect(screen.getByRole("heading", { name: "シフト表が見つかりません" })).not.toBeNull();
    expect(screen.getByText(/この組織から閲覧できない可能性/)).not.toBeNull();
  });
});
