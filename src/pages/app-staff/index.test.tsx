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
  reorder: vi.fn(),
  useStaffOrderReorder: vi.fn(),
  peopleQueryRef: Symbol("listOrganizationPeople"),
  summaryQueryRef: Symbol("getOrganizationPeopleSummary"),
  orderScopeQueryRef: Symbol("getOrganizationStaffOrderScope"),
  orderEditorQueryRef: Symbol("getOrganizationStaffOrderEditor"),
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
      staffOrderQueries: {
        getOrganizationStaffOrderScope: mocks.orderScopeQueryRef,
        getOrganizationStaffOrderEditor: mocks.orderEditorQueryRef,
      },
    },
  },
}));
vi.mock("@/src/components/features/AuthenticatedApp/ShopFilterMenu", () => ({
  ShopFilterMenu: ({ options, onChange }: { options: readonly unknown[]; onChange: (value: string | null) => void }) =>
    options.length < 2 ? null : (
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
    initialVisibleUserCount,
    onLoadMorePeople,
    staffOrder,
    onAddStaff,
    canAddStaff,
    addStaffDisabledReason,
    onManageManagers,
  }: {
    people: Array<{ id: string; name: string }>;
    peopleUsage: { current: number; max: number };
    peopleUsageHasOverflow?: boolean;
    filterResultCount?: number;
    filterResultCountHasOverflow?: boolean;
    initialVisibleUserCount?: number;
    onLoadMorePeople: () => void;
    staffOrder?: {
      disabled: boolean;
      disabledReason?: string;
      isSaving: boolean;
      onReorder: (activePersonId: string, overPersonId: string) => void;
    };
    onAddStaff: () => void;
    canAddStaff: boolean;
    addStaffDisabledReason?: string;
    onManageManagers: () => void;
  }) => (
    <section>
      <output data-testid="people-counts">
        {peopleUsageHasOverflow
          ? `${peopleUsage.current}+/${peopleUsage.max}`
          : `${peopleUsage.current}/${peopleUsage.max}`}
        {filterResultCount === undefined ? "" : `:${filterResultCount}${filterResultCountHasOverflow ? "+" : ""}`}
      </output>
      <output data-testid="initial-visible-user-count">{initialVisibleUserCount}</output>
      {people.map((person) => (
        <output key={person.id}>{person.name}</output>
      ))}
      <button type="button" onClick={onLoadMorePeople}>
        もっと見る
      </button>
      {staffOrder &&
        people.map((person) => (
          <button
            key={`${person.id}-order`}
            type="button"
            disabled={staffOrder.disabled}
            title={staffOrder.disabled ? staffOrder.disabledReason : undefined}
            onClick={() => staffOrder.onReorder(person.id, people[0]?.id ?? person.id)}
          >
            {person.name}の並び替え
          </button>
        ))}
      <button type="button" onClick={onAddStaff} disabled={!canAddStaff} title={addStaffDisabledReason}>
        スタッフを追加
      </button>
      <button type="button" onClick={onManageManagers}>
        管理者を設定
      </button>
    </section>
  ),
  useStaffOrderReorder: mocks.useStaffOrderReorder,
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

let orderScopeResult: { mode: "legacy" } | { mode: "ordered"; revision: number } | undefined;
let orderEditorResult: Record<string, unknown> | undefined;
let summaryResult: Record<string, unknown>;
let peopleStatus: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
let allPeopleResult: Array<{ id: string; name: string }>;
let shopPeopleResult: Array<{ id: string; name: string }>;

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
  mocks.reorder.mockReset();
  mocks.useStaffOrderReorder.mockReset();
  allPeopleResult = [
    { id: "person-all-1", name: "全体の人物1" },
    { id: "person-all-2", name: "全体の人物2" },
  ];
  shopPeopleResult = [{ id: "person-shop", name: "店舗の人物" }];
  peopleStatus = "Exhausted";
  mocks.usePaginatedQuery.mockImplementation((_reference, args: "skip" | { shopFilter: string }) => ({
    results: args === "skip" ? [] : args.shopFilter === "all" ? allPeopleResult : shopPeopleResult,
    status: args === "skip" ? "LoadingFirstPage" : peopleStatus,
    loadMore: mocks.loadMore,
  }));
  orderScopeResult = { mode: "legacy" };
  orderEditorResult = {
    people: [
      { personId: "person-all-1", name: "全体の人物1", email: "one@example.com", shopNames: ["本店"] },
      { personId: "person-all-2", name: "全体の人物2", email: "two@example.com", shopNames: ["本店"] },
    ],
    orderFingerprint: "fingerprint-1",
    canWrite: true,
    availability: "ready",
  };
  summaryResult = {
    totalCount: 2,
    totalCountHasOverflow: false,
    visibleCount: 1,
    visibleCountHasOverflow: false,
    maxPeople: 5,
    canAddStaff: true,
    canChangeStaffOrder: true,
  };
  mocks.useQuery.mockImplementation((reference, args) => {
    if (reference === mocks.orderScopeQueryRef) return orderScopeResult;
    if (reference === mocks.orderEditorQueryRef) return args === "skip" ? undefined : orderEditorResult;
    return summaryResult;
  });
  mocks.useStaffOrderReorder.mockImplementation(
    (people: Array<{ id: string; name: string }>, source?: { canReorder: boolean; disabledReason?: string }) => ({
      people,
      staffOrder: source
        ? {
            disabled: !source.canReorder,
            disabledReason: source.disabledReason,
            isSaving: false,
            onReorder: mocks.reorder,
          }
        : undefined,
    }),
  );
});

describe("AppStaffRoutePage", () => {
  it("すべて表示では並び替えeditorと全スタッフを読み、D&D設定を一覧へ渡す", () => {
    renderPage(<AppStaffRoutePage organizationId={"organization-1" as never} activeShops={shops} />);

    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.orderEditorQueryRef, {
      organizationId: "organization-1",
    });
    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(
      mocks.peopleQueryRef,
      { organizationId: "organization-1", shopFilter: "all", orderRevision: null },
      { initialNumItems: 50 },
    );
    expect(mocks.useStaffOrderReorder).toHaveBeenLastCalledWith(allPeopleResult, {
      organizationId: "organization-1",
      orderedPersonIds: ["person-all-1", "person-all-2"],
      orderFingerprint: "fingerprint-1",
      canReorder: true,
      disabledReason: undefined,
    });
    expect(screen.getByTestId("initial-visible-user-count").textContent).toBe("50");
    expect(screen.getAllByRole("button", { name: /の並び替え$/ })).toHaveLength(2);
  });

  it("filterをserver query argsへ渡し、filter変更時は別query identityへ切り替えて旧pageを残さない", () => {
    const { rerender } = renderPage(
      <AppStaffRoutePage organizationId={"organization-1" as never} activeShops={multipleShops} />,
    );

    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(
      mocks.peopleQueryRef,
      { organizationId: "organization-1", shopFilter: "all", orderRevision: null },
      { initialNumItems: 50 },
    );
    expect(screen.getByText("全体の人物1")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "店舗を選択" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/staff",
      search: { org: "organization-1", shopFilter: "shop-1" },
    });

    rerender(
      <ChakraProvider>
        <AppStaffRoutePage
          organizationId={"organization-1" as never}
          activeShops={multipleShops}
          requestedShopFilter="shop-1"
        />
      </ChakraProvider>,
    );
    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(
      mocks.peopleQueryRef,
      { organizationId: "organization-1", shopFilter: "shop-1", orderRevision: null },
      { initialNumItems: 10 },
    );
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.orderEditorQueryRef, "skip");
    expect(mocks.useStaffOrderReorder).toHaveBeenLastCalledWith(shopPeopleResult, undefined);
    expect(screen.getByTestId("initial-visible-user-count").textContent).toBe("10");
    expect(screen.queryByText("全体の人物1")).toBeNull();
    expect(screen.getByText("店舗の人物")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /の並び替え$/ })).toBeNull();
  });

  it("利用中の店舗が1つのとき店舗filterを表示しない", () => {
    renderPage(<AppStaffRoutePage organizationId={"organization-1" as never} activeShops={shops} />);

    expect(screen.queryByRole("button", { name: "店舗を選択" })).toBeNull();
  });

  it("利用中の店舗にないshopFilterはqueryへ渡さず、すべてへreplaceする", () => {
    renderPage(
      <AppStaffRoutePage
        organizationId={"organization-1" as never}
        activeShops={shops}
        requestedShopFilter="outside-shop"
      />,
    );

    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(
      mocks.peopleQueryRef,
      { organizationId: "organization-1", shopFilter: "all", orderRevision: null },
      { initialNumItems: 50 },
    );
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/staff",
      search: { org: "organization-1" },
      replace: true,
    });
    expect(screen.getByText("全体の人物1")).not.toBeNull();
  });

  it("店舗候補の全pageが揃うまでは人物queryを開始しない", () => {
    renderPage(
      <AppStaffRoutePage organizationId={"organization-1" as never} activeShops={null} requestedShopFilter="shop-1" />,
    );

    expect(mocks.usePaginatedQuery).not.toHaveBeenCalled();
    expect(mocks.useQuery).not.toHaveBeenCalled();
    expect(screen.getByLabelText("スタッフ一覧を読み込み中")).not.toBeNull();
  });

  it("bounded summaryのoverflowを正確な件数として表示しない", () => {
    summaryResult = {
      totalCount: 1000,
      totalCountHasOverflow: true,
      visibleCount: 1000,
      visibleCountHasOverflow: true,
      maxPeople: 50,
      canAddStaff: false,
      canChangeStaffOrder: true,
    };

    renderPage(
      <AppStaffRoutePage organizationId={"organization-1" as never} activeShops={shops} requestedShopFilter="shop-1" />,
    );

    expect(screen.getByTestId("people-counts").textContent).toBe("1000+/50:1000+");
  });

  it("追加pageと、選択済み店舗＋expected orgの既存スタッフ追加Dialogへ接続する", () => {
    peopleStatus = "CanLoadMore";
    renderPage(
      <AppStaffRoutePage organizationId={"organization-1" as never} activeShops={shops} requestedShopFilter="shop-1" />,
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

  it("店舗別では並び順scopeの取得完了までpaginationを開始せず、ordered revisionでcursor identityを分ける", () => {
    orderScopeResult = undefined;
    const { rerender } = renderPage(
      <AppStaffRoutePage organizationId={"organization-1" as never} activeShops={shops} requestedShopFilter="shop-1" />,
    );

    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(mocks.peopleQueryRef, "skip", { initialNumItems: 10 });

    orderScopeResult = { mode: "ordered", revision: 7 };
    rerender(
      <ChakraProvider>
        <AppStaffRoutePage
          organizationId={"organization-1" as never}
          activeShops={shops}
          requestedShopFilter="shop-1"
        />
      </ChakraProvider>,
    );

    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(
      mocks.peopleQueryRef,
      { organizationId: "organization-1", shopFilter: "shop-1", orderRevision: 7 },
      { initialNumItems: 10 },
    );
  });

  it("すべて表示ではeditorで並べるため、保存済みrevisionをpagination identityへ含めない", () => {
    orderScopeResult = { mode: "ordered", revision: 7 };

    renderPage(<AppStaffRoutePage organizationId={"organization-1" as never} activeShops={shops} />);

    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(
      mocks.peopleQueryRef,
      { organizationId: "organization-1", shopFilter: "all", orderRevision: null },
      { initialNumItems: 50 },
    );
  });

  it("すべて表示では対象店舗を1件選び、shopIdとexpected organizationを既存追加Dialogへ渡す", async () => {
    renderPage(<AppStaffRoutePage organizationId={"organization-1" as never} activeShops={multipleShops} />);

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

  it("業務操作を制限中でも一覧を表示し、server capabilityの理由で追加と並び替えを無効にする", () => {
    summaryResult = {
      ...summaryResult,
      canAddStaff: false,
      addStaffDisabledReason: "プラン上限を超えているため、スタッフを追加できません。",
      canChangeStaffOrder: false,
      changeStaffOrderDisabledReason: "プラン上限を超えているため、スタッフの並び順を変更できません。",
    };

    renderPage(<AppStaffRoutePage organizationId={"organization-1" as never} activeShops={shops} />);

    expect(screen.getByText("全体の人物1")).not.toBeNull();
    const addButton = screen.getByRole("button", { name: "スタッフを追加" }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);
    expect(addButton.title).toBe("プラン上限を超えているため、スタッフを追加できません。");
    const orderHandles = screen.getAllByRole("button", { name: /の並び替え$/ }) as HTMLButtonElement[];
    expect(orderHandles).toHaveLength(2);
    for (const handle of orderHandles) {
      expect(handle.disabled).toBe(true);
      expect(handle.title).toBe("プラン上限を超えているため、スタッフの並び順を変更できません。");
    }
  });

  it("すべて表示でスタッフが1名なら並び替えハンドルを無効にする", () => {
    allPeopleResult = [{ id: "person-all-1", name: "全体の人物1" }];
    orderEditorResult = {
      ...orderEditorResult,
      people: [{ personId: "person-all-1", name: "全体の人物1", email: "one@example.com", shopNames: ["本店"] }],
    };
    summaryResult = {
      ...summaryResult,
      totalCount: 1,
      canChangeStaffOrder: true,
    };

    renderPage(<AppStaffRoutePage organizationId={"organization-1" as never} activeShops={shops} />);

    const orderHandle = screen.getByRole("button", { name: "全体の人物1の並び替え" }) as HTMLButtonElement;
    expect(orderHandle.disabled).toBe(true);
    expect(orderHandle.title).toBe("2名以上のスタッフがいると並び替えできます。");
  });

  it("business write制限時は人数よりserver capabilityの理由を優先する", () => {
    summaryResult = {
      ...summaryResult,
      totalCount: 1,
      canChangeStaffOrder: false,
      changeStaffOrderDisabledReason: "プラン上限を超えているため、並び順を変更できません。",
    };

    renderPage(<AppStaffRoutePage organizationId={"organization-1" as never} activeShops={shops} />);

    const orderHandle = screen.getByRole("button", { name: "全体の人物1の並び替え" }) as HTMLButtonElement;
    expect(orderHandle.disabled).toBe(true);
    expect(orderHandle.title).toBe("プラン上限を超えているため、並び順を変更できません。");
  });

  it("50名ちょうどなら並び替えハンドルを有効にする", () => {
    allPeopleResult = Array.from({ length: 50 }, (_, index) => ({
      id: `person-all-${index + 1}`,
      name: `全体の人物${index + 1}`,
    }));
    orderEditorResult = {
      ...orderEditorResult,
      people: allPeopleResult.map((person) => ({
        personId: person.id,
        name: person.name,
        email: `${person.id}@example.com`,
        shopNames: ["本店"],
      })),
    };
    summaryResult = {
      ...summaryResult,
      totalCount: 50,
      totalCountHasOverflow: false,
      canChangeStaffOrder: true,
    };

    renderPage(<AppStaffRoutePage organizationId={"organization-1" as never} activeShops={shops} />);

    const orderHandle = screen.getByRole("button", { name: "全体の人物1の並び替え" }) as HTMLButtonElement;
    expect(orderHandle.disabled).toBe(false);
    expect(orderHandle.title).toBe("");
  });

  it("51名では並び替えハンドルを無効にする", () => {
    summaryResult = {
      ...summaryResult,
      totalCount: 51,
      totalCountHasOverflow: false,
      canChangeStaffOrder: true,
    };

    renderPage(<AppStaffRoutePage organizationId={"organization-1" as never} activeShops={shops} />);

    const orderHandle = screen.getByRole("button", { name: "全体の人物1の並び替え" }) as HTMLButtonElement;
    expect(orderHandle.disabled).toBe(true);
    expect(orderHandle.title).toBe("利用人数が50名を超えているため、並び順を変更できません。");
  });

  it("件数overflowでは並び替えハンドルを無効にする", () => {
    summaryResult = {
      ...summaryResult,
      totalCount: 50,
      totalCountHasOverflow: true,
      canChangeStaffOrder: true,
    };

    renderPage(<AppStaffRoutePage organizationId={"organization-1" as never} activeShops={shops} />);

    const orderHandle = screen.getByRole("button", { name: "全体の人物1の並び替え" }) as HTMLButtonElement;
    expect(orderHandle.disabled).toBe(true);
    expect(orderHandle.title).toBe("利用人数が50名を超えているため、並び順を変更できません。");
  });

  it("稼働中の店舗が5店舗を超えると並び替えハンドルを無効にする", () => {
    const sixShops = Array.from({ length: 6 }, (_, index) => ({
      id: `shop-${index + 1}`,
      name: `店舗${index + 1}`,
    })) as never;

    renderPage(<AppStaffRoutePage organizationId={"organization-1" as never} activeShops={sixShops} />);

    const orderHandle = screen.getByRole("button", { name: "全体の人物1の並び替え" }) as HTMLButtonElement;
    expect(orderHandle.disabled).toBe(true);
    expect(orderHandle.title).toBe("稼働中の店舗が5店舗を超えているため、並び順を変更できません。");
  });
});
