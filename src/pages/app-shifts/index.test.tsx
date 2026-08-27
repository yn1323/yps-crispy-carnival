// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usePaginatedQuery: vi.fn(),
  loadMore: vi.fn(),
  navigate: vi.fn(),
  queryRef: Symbol("listOrganizationRecruitments"),
  managementProps: [] as Array<Record<string, unknown>>,
  managementMountCount: 0,
}));

vi.mock("convex/react", () => ({ usePaginatedQuery: mocks.usePaginatedQuery }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/convex/_generated/api", () => ({
  api: { appOrganization: { queries: { listOrganizationRecruitments: mocks.queryRef } } },
}));
vi.mock("@/src/components/features/OrganizationRecruitmentManagement", () => ({
  OrganizationRecruitmentManagement: (props: Record<string, unknown>) => {
    const [mountId] = useState(() => {
      mocks.managementMountCount += 1;
      return mocks.managementMountCount;
    });
    mocks.managementProps.push(props);
    const groups = props.groups as Array<{ recruitments: Array<{ _id: string }> }>;
    const firstRecruitment = groups.flatMap((group) => group.recruitments)[0];
    return (
      <section aria-label="統合シフト一覧">
        <output data-testid="management-mount-id">{mountId}</output>
        <output>{groups.flatMap((group) => group.recruitments).length}件</output>
        {firstRecruitment && (
          <button type="button" onClick={() => (props.onOpenShiftBoard as (id: string) => void)(firstRecruitment._id)}>
            シフト表を開く
          </button>
        )}
      </section>
    );
  },
}));
vi.mock("@/src/components/features/Dashboard/RecruitmentBoard", () => ({
  RecruitmentBoardSkeleton: () => <output>シフト一覧を読み込み中</output>,
}));
vi.mock("@/src/components/templates/Animation", () => ({
  Animation: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/src/components/templates/AuthenticatedPageContent", () => ({
  AuthenticatedPageContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/src/components/ui/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { APP_ORGANIZATION_RECRUITMENT_SHOP_PAGE_SIZE } from "@/convex/constants";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { ChakraProvider } from "@/src/providers/ChakraProvider";
import { AppShiftsRoutePage, buildAppShiftsOverview, type RecruitmentSection } from ".";

const renderPage = (children: ReactNode) => render(<ChakraProvider>{children}</ChakraProvider>);

const recruitment = (id: string, deadline: string): Recruitment =>
  ({
    _id: id,
    createdAt: 1,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-07",
    deadline,
    shopClosedDates: [],
    status: "open",
    confirmedAt: null,
    responseCount: 1,
    totalStaffCount: 3,
  }) as unknown as Recruitment;

const makeSection = (shopId: string, shopName: string, item: Recruitment): RecruitmentSection => ({
  shop: {
    shopId: shopId as never,
    shopName,
    operatingStatus: "active",
    regularClosedDays: [],
  },
  currentGroups: [
    {
      key: "collecting",
      title: "募集中",
      recruitments: [item],
      totalCount: 1,
    },
  ],
  hasPastRecruitments: true,
  actions: { canCreate: true },
});

const firstSection = makeSection("shop-1", "本店", recruitment("recruitment-later", "2026-08-20"));
const secondSection = makeSection("shop-2", "駅前店", recruitment("recruitment-sooner", "2026-08-10"));
const activeShops = [
  { id: "shop-1" as never, name: "本店" },
  { id: "shop-2" as never, name: "駅前店" },
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
  mocks.usePaginatedQuery.mockReset();
  mocks.loadMore.mockReset();
  mocks.navigate.mockReset();
  mocks.managementProps.length = 0;
  mocks.managementMountCount = 0;
});

describe("AppShiftsRoutePage", () => {
  it("追加pageの取得中でも取得済みの一覧を表示する", () => {
    mocks.usePaginatedQuery.mockReturnValue({
      results: [firstSection],
      status: "CanLoadMore",
      loadMore: mocks.loadMore,
    });

    renderPage(<AppShiftsRoutePage organizationId={"organization-1" as never} activeShops={activeShops} />);

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(
      mocks.queryRef,
      { organizationId: "organization-1" },
      { initialNumItems: APP_ORGANIZATION_RECRUITMENT_SHOP_PAGE_SIZE },
    );
    expect(mocks.loadMore).toHaveBeenCalledWith(APP_ORGANIZATION_RECRUITMENT_SHOP_PAGE_SIZE);
    expect(screen.getByRole("heading", { level: 1, name: "シフト" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "統合シフト一覧" })).toBeTruthy();
    expect(screen.getByText("1件")).toBeTruthy();
  });

  it("H1とdefault全店舗filterを表示し、状態別にまとめた募集へ店舗metadataを結び付ける", () => {
    mocks.usePaginatedQuery.mockReturnValue({
      results: [firstSection, secondSection],
      status: "Exhausted",
      loadMore: mocks.loadMore,
    });

    renderPage(<AppShiftsRoutePage organizationId={"organization-1" as never} activeShops={activeShops} />);

    expect(screen.getByRole("heading", { level: 1, name: "シフト" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "店舗で絞り込む（現在：すべて）" })).toBeTruthy();
    expect(screen.getByText("2件")).toBeTruthy();
    const props = mocks.managementProps[0];
    const groups = props.groups as Array<{ key: string; recruitments: Recruitment[] }>;
    expect(groups).toHaveLength(1);
    expect(groups[0]?.recruitments.map((item) => item._id)).toEqual(["recruitment-sooner", "recruitment-later"]);
    const getRecruitmentShop = props.getRecruitmentShop as (item: Recruitment) => { shopId: string; shopName: string };
    expect(getRecruitmentShop(groups[0]?.recruitments[0] as Recruitment)).toEqual({
      shopId: "shop-2",
      shopName: "駅前店",
    });
    expect(props.shops).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "シフト表を開く" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/shifts/$recruitmentId/board",
      params: { recruitmentId: "recruitment-sooner" },
      search: { org: "organization-1" },
    });
  });

  it("利用中の店舗が1つのとき店舗filterを表示しない", () => {
    mocks.usePaginatedQuery.mockReturnValue({
      results: [firstSection],
      status: "Exhausted",
      loadMore: mocks.loadMore,
    });

    renderPage(<AppShiftsRoutePage organizationId={"organization-1" as never} activeShops={activeShops.slice(0, 1)} />);

    expect(screen.queryByRole("button", { name: "店舗で絞り込む（現在：すべて）" })).toBeNull();
  });

  it("店舗filterは一覧だけへ適用し、募集作成候補には全店舗を残す", () => {
    mocks.usePaginatedQuery.mockReturnValue({
      results: [firstSection, secondSection],
      status: "Exhausted",
      loadMore: mocks.loadMore,
    });

    renderPage(
      <AppShiftsRoutePage
        organizationId={"organization-1" as never}
        activeShops={activeShops}
        requestedShopFilter="shop-2"
      />,
    );

    const props = mocks.managementProps[0];
    const groups = props.groups as Array<{ recruitments: Recruitment[] }>;
    expect(groups.flatMap((group) => group.recruitments).map((item) => item._id)).toEqual(["recruitment-sooner"]);
    expect(props.shops).toHaveLength(2);
  });

  it("店舗filterを変更しても全店舗queryのsubtreeを再mountしない", () => {
    mocks.usePaginatedQuery.mockReturnValue({
      results: [firstSection, secondSection],
      status: "Exhausted",
      loadMore: mocks.loadMore,
    });

    const view = renderPage(
      <AppShiftsRoutePage organizationId={"organization-1" as never} activeShops={activeShops} />,
    );
    expect(screen.getByTestId("management-mount-id").textContent).toBe("1");

    view.rerender(
      <ChakraProvider>
        <AppShiftsRoutePage
          organizationId={"organization-1" as never}
          activeShops={activeShops}
          requestedShopFilter="shop-2"
        />
      </ChakraProvider>,
    );

    expect(screen.getByTestId("management-mount-id").textContent).toBe("1");
    expect(mocks.managementMountCount).toBe(1);
    expect(mocks.managementProps.at(-1)?.shopFilter).toBe("shop-2");
  });

  it("利用できないshopFilterは全店舗へreplaceする", () => {
    mocks.usePaginatedQuery.mockReturnValue({
      results: [firstSection, secondSection],
      status: "Exhausted",
      loadMore: mocks.loadMore,
    });

    renderPage(
      <AppShiftsRoutePage
        organizationId={"organization-1" as never}
        activeShops={activeShops}
        requestedShopFilter="foreign-shop"
      />,
    );

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/shifts",
      search: { org: "organization-1" },
      replace: true,
    });
  });
});

describe("app shifts presentation helpers", () => {
  it("元sectionを変更せず、表示対象だけを状態別一覧へまとめる", () => {
    const source = [firstSection, secondSection];
    const snapshot = structuredClone(source);

    const overview = buildAppShiftsOverview(source, "shop-1" as never);

    expect(overview.groups.flatMap((group) => group.recruitments).map((item) => item._id)).toEqual([
      "recruitment-later",
    ]);
    expect(overview.shops.map((shop) => shop.shopName)).toEqual(["本店", "駅前店"]);
    expect(source).toEqual(snapshot);
  });
});
