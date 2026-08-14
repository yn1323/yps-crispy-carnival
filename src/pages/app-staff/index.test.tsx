// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
  navigate: vi.fn(),
  loadMore: vi.fn(),
  invitationOpen: vi.fn(),
  peopleQueryRef: Symbol("listOrganizationPeople"),
  summaryQueryRef: Symbol("getOrganizationPeopleSummary"),
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: mocks.usePaginatedQuery,
  useQuery: mocks.useQuery,
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => undefined,
}));
vi.mock("@/convex/_generated/api", () => ({
  api: {
    appOrganization: {
      queries: {
        listOrganizationPeople: mocks.peopleQueryRef,
        getOrganizationPeopleSummary: mocks.summaryQueryRef,
      },
    },
  },
}));
vi.mock("@/src/components/features/AuthenticatedApp/ShopFilterMenu", () => ({
  ShopFilterMenu: ({ onChange }: { onChange: (value: string | null) => void }) => (
    <button type="button" onClick={() => onChange("shop-1")}>
      店舗を選択
    </button>
  ),
}));
vi.mock("@/src/components/features/OrganizationSettings", () => ({
  PeopleSectionSkeleton: () => <section aria-hidden />,
  PeopleSection: ({
    people,
    peopleUsage,
    peopleUsageHasOverflow,
    filterResultCount,
    filterResultCountHasOverflow,
    onLoadMorePeople,
    onAddStaff,
    canAddStaff,
    addStaffDisabledReason,
  }: {
    people: Array<{ id: string; name: string }>;
    peopleUsage: { current: number; max: number };
    peopleUsageHasOverflow?: boolean;
    filterResultCount?: number;
    filterResultCountHasOverflow?: boolean;
    onLoadMorePeople: () => void;
    onAddStaff: () => void;
    canAddStaff: boolean;
    addStaffDisabledReason?: string;
  }) => (
    <section>
      <output data-testid="people-counts">
        {peopleUsageHasOverflow
          ? `${peopleUsage.current}+/${peopleUsage.max}`
          : `${peopleUsage.current}/${peopleUsage.max}`}
        {filterResultCount === undefined ? "" : `:${filterResultCount}${filterResultCountHasOverflow ? "+" : ""}`}
      </output>
      {people.map((person) => (
        <output key={person.id}>{person.name}</output>
      ))}
      <button type="button" onClick={onLoadMorePeople}>
        もっと見る
      </button>
      <button type="button" onClick={onAddStaff} disabled={!canAddStaff} title={addStaffDisabledReason}>
        スタッフを追加
      </button>
    </section>
  ),
}));
vi.mock("@/src/components/features/Dashboard/StaffManagement/useStaffInvitation", () => ({
  useStaffInvitation: () => ({
    onOpen: mocks.invitationOpen,
    dialog: { isOpen: true },
  }),
}));
vi.mock("@/src/components/features/Dashboard/StaffManagement/StaffInvitationDialog", () => ({
  StaffInvitationDialog: () => <output>既存スタッフ追加Dialog</output>,
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
    <section data-testid="shop-scope" data-shop-id={shopId} data-organization-id={expectedOrganizationId}>
      {children}
    </section>
  ),
}));

import { ChakraProvider } from "@/src/providers/ChakraProvider";
import { AppStaffRoutePage } from ".";

const renderPage = (children: ReactNode) => render(<ChakraProvider>{children}</ChakraProvider>);

const shops = [{ id: "shop-1", name: "本店" }] as never;
const multipleShops = [
  { id: "shop-1", name: "本店" },
  { id: "shop-2", name: "駅前店" },
] as never;

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
  mocks.useQuery.mockReset();
  mocks.navigate.mockReset();
  mocks.loadMore.mockReset();
  mocks.invitationOpen.mockReset();
  mocks.usePaginatedQuery.mockImplementation((_reference, args: { shopFilter: string }) => ({
    results:
      args.shopFilter === "all"
        ? [{ id: "person-all", name: "全体の人物" }]
        : [{ id: "person-shop", name: "店舗の人物" }],
    status: "CanLoadMore",
    loadMore: mocks.loadMore,
  }));
  mocks.useQuery.mockReturnValue({
    totalCount: 12,
    totalCountHasOverflow: false,
    visibleCount: 1,
    visibleCountHasOverflow: false,
    maxPeople: 5,
    canAddStaff: true,
  });
});

describe("AppStaffRoutePage", () => {
  it("filterをserver query argsへ渡し、filter変更時は別query identityへ切り替えて旧pageを残さない", () => {
    const { rerender } = renderPage(
      <AppStaffRoutePage organizationId={"organization-1" as never} memberStatus="active" activeShops={shops} />,
    );

    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(
      mocks.peopleQueryRef,
      { organizationId: "organization-1", shopFilter: "all" },
      { initialNumItems: 10 },
    );
    expect(screen.getByText("全体の人物")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "店舗を選択" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/app/staff",
      search: { org: "organization-1", shopFilter: "shop-1" },
    });

    rerender(
      <ChakraProvider>
        <AppStaffRoutePage
          organizationId={"organization-1" as never}
          memberStatus="active"
          activeShops={shops}
          requestedShopFilter="shop-1"
        />
      </ChakraProvider>,
    );
    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(
      mocks.peopleQueryRef,
      { organizationId: "organization-1", shopFilter: "shop-1" },
      { initialNumItems: 10 },
    );
    expect(screen.queryByText("全体の人物")).toBeNull();
    expect(screen.getByText("店舗の人物")).not.toBeNull();
  });

  it("利用中の店舗にないshopFilterはqueryへ渡さず、すべてへreplaceする", () => {
    renderPage(
      <AppStaffRoutePage
        organizationId={"organization-1" as never}
        memberStatus="active"
        activeShops={shops}
        requestedShopFilter="outside-shop"
      />,
    );

    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(
      mocks.peopleQueryRef,
      { organizationId: "organization-1", shopFilter: "all" },
      { initialNumItems: 10 },
    );
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/app/staff",
      search: { org: "organization-1" },
      replace: true,
    });
    expect(screen.getByText("全体の人物")).not.toBeNull();
  });

  it("店舗候補の全pageが揃うまでは人物queryを開始しない", () => {
    renderPage(
      <AppStaffRoutePage
        organizationId={"organization-1" as never}
        memberStatus="active"
        activeShops={null}
        requestedShopFilter="shop-1"
      />,
    );

    expect(mocks.usePaginatedQuery).not.toHaveBeenCalled();
    expect(mocks.useQuery).not.toHaveBeenCalled();
    expect(screen.getByLabelText("スタッフ一覧を読み込み中")).not.toBeNull();
  });

  it("bounded summaryのoverflowを正確な件数として表示しない", () => {
    mocks.useQuery.mockReturnValue({
      totalCount: 1000,
      totalCountHasOverflow: true,
      visibleCount: 1000,
      visibleCountHasOverflow: true,
      maxPeople: 40,
      canAddStaff: false,
    });

    renderPage(
      <AppStaffRoutePage
        organizationId={"organization-1" as never}
        memberStatus="active"
        activeShops={shops}
        requestedShopFilter="shop-1"
      />,
    );

    expect(screen.getByTestId("people-counts").textContent).toBe("1000+/40:1000+");
  });

  it("追加pageと、選択済み店舗＋expected orgの既存スタッフ追加Dialogへ接続する", () => {
    renderPage(
      <AppStaffRoutePage
        organizationId={"organization-1" as never}
        memberStatus="active"
        activeShops={shops}
        requestedShopFilter="shop-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "もっと見る" }));
    expect(mocks.loadMore).toHaveBeenCalledWith(10);
    fireEvent.click(screen.getByRole("button", { name: "スタッフを追加" }));
    const scope = screen.getByTestId("shop-scope");
    expect(scope.getAttribute("data-shop-id")).toBe("shop-1");
    expect(scope.getAttribute("data-organization-id")).toBe("organization-1");
    expect(screen.getByText("既存スタッフ追加Dialog")).not.toBeNull();
    expect(mocks.invitationOpen).toHaveBeenCalledOnce();
  });

  it("すべて表示では対象店舗を1件選び、shopIdとexpected organizationを既存追加Dialogへ渡す", async () => {
    renderPage(
      <AppStaffRoutePage
        organizationId={"organization-1" as never}
        memberStatus="active"
        activeShops={multipleShops}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "スタッフを追加" }));

    const selectionDialog = await screen.findByRole("dialog", { name: "スタッフを追加する店舗を選択" });
    expect(selectionDialog).not.toBeNull();
    expect(screen.getByRole("button", { name: "本店をスタッフ追加の対象店舗として選択" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "駅前店をスタッフ追加の対象店舗として選択" }));

    const scope = screen.getByTestId("shop-scope");
    expect(scope.getAttribute("data-shop-id")).toBe("shop-2");
    expect(scope.getAttribute("data-organization-id")).toBe("organization-1");
    expect(screen.getByText("既存スタッフ追加Dialog")).not.toBeNull();
    expect(mocks.invitationOpen).toHaveBeenCalledOnce();
  });

  it("readOnlyでは一覧を表示したままスタッフ追加を無効にする", () => {
    renderPage(
      <AppStaffRoutePage
        organizationId={"organization-1" as never}
        memberStatus="readOnly"
        activeShops={shops}
        requestedShopFilter="shop-1"
      />,
    );

    expect(screen.getByText("店舗の人物")).not.toBeNull();
    const addButton = screen.getByRole("button", { name: "スタッフを追加" }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);
    expect(addButton.title).toBe("閲覧のみの管理者は、スタッフを追加できません。");
  });
});
