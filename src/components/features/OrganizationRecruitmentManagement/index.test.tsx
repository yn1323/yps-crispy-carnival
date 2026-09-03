// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { CreateRecruitmentData, CreateRecruitmentShop } from "@/src/components/features/CreateRecruitmentForm";
import type { DashboardRecruitmentGroup, Recruitment } from "@/src/components/features/Dashboard/types";
import type { OrganizationRecruitmentShop } from "./types";

const mocks = vi.hoisted(() => ({
  createRef: Symbol("createRecruitment"),
  deleteRef: Symbol("deleteRecruitment"),
  pastRef: Symbol("getDashboardPastRecruitments"),
  organizationPastPreviewRef: Symbol("listOrganizationPastRecruitmentPreviews"),
  createRecruitment: vi.fn(),
  deleteRecruitment: vi.fn(),
  usePaginatedQuery: vi.fn(),
  useShopPaginatedQuery: vi.fn(),
  loadMoreOrganizationPastPreviews: vi.fn(),
  loadMorePast: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  boardProps: undefined as Record<string, unknown> | undefined,
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: symbol) =>
    reference === mocks.createRef ? mocks.createRecruitment : mocks.deleteRecruitment,
  usePaginatedQuery: mocks.usePaginatedQuery,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    recruitment: {
      mutations: {
        createRecruitment: mocks.createRef,
        deleteRecruitment: mocks.deleteRef,
      },
    },
    dashboard: {
      queries: {
        getDashboardPastRecruitments: mocks.pastRef,
      },
    },
    appOrganization: {
      queries: {
        listOrganizationPastRecruitmentPreviews: mocks.organizationPastPreviewRef,
      },
    },
  },
}));

vi.mock("@/src/hooks/useShopPaginatedQuery", () => ({ useShopPaginatedQuery: mocks.useShopPaginatedQuery }));
vi.mock("@/src/providers/ManagerShopScopeProvider", () => ({
  ManagerShopScopeProvider: ({
    shopId,
    expectedOrganizationId,
    children,
  }: {
    shopId: string;
    expectedOrganizationId: string;
    children: ReactNode;
  }) => (
    <div data-testid="manager-shop-scope" data-shop-id={shopId} data-organization-id={expectedOrganizationId}>
      {children}
    </div>
  ),
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

vi.mock("@/src/components/features/Dashboard/RecruitmentBoard", () => ({
  RecruitmentBoard: (props: Record<string, unknown>) => {
    mocks.boardProps = props;
    const groups = props.groups as DashboardRecruitmentGroup[];
    const recruitments = groups.flatMap((group) => group.recruitments);
    const getShopName = props.getRecruitmentShopName as (recruitment: Recruitment) => string | undefined;
    const onOpenShiftBoard = props.onOpenShiftBoard as (recruitmentId: string) => void;
    const onDeleteRecruitment = props.onDeleteRecruitment as (recruitment: Recruitment) => void;
    const onShowPastRecruitments = props.onShowPastRecruitments as () => void;
    const onLoadMorePastRecruitments = props.onLoadMorePastRecruitments as () => void;
    const canCreate = (props.canCreateRecruitments as boolean | undefined) ?? !props.isReadOnly;
    const createDisabledReason = props.createRecruitmentDisabledReason as string | undefined;
    const emptyState = props.emptyState as { title: string; description: string; actionLabel: string } | undefined;

    return (
      <section aria-label={String(props.title)}>
        <button
          type="button"
          onClick={props.onCreateClick as () => void}
          disabled={!canCreate}
          title={createDisabledReason}
        >
          新しい募集をつくる
        </button>
        {createDisabledReason && <span>{createDisabledReason}</span>}
        {recruitments.length === 0 && !props.hasPastRecruitments && emptyState && (
          <div>
            <span>{emptyState.title}</span>
            <span>{emptyState.description}</span>
          </div>
        )}
        {recruitments.map((recruitment) => (
          <div key={recruitment._id}>
            <span>{getShopName(recruitment)}</span>
            <button type="button" onClick={() => onOpenShiftBoard(recruitment._id)}>
              {recruitment._id}を開く
            </button>
            <button type="button" onClick={() => onDeleteRecruitment(recruitment)}>
              {recruitment._id}を削除
            </button>
          </div>
        ))}
        {Boolean(props.hasPastRecruitments) && !props.isPastRecruitmentsVisible && (
          <button type="button" onClick={onShowPastRecruitments}>
            過去のシフトを見る
          </button>
        )}
        {Boolean(props.canLoadMorePastRecruitments) && (
          <button type="button" onClick={onLoadMorePastRecruitments}>
            もっと見る
          </button>
        )}
      </section>
    );
  },
}));

vi.mock("@/src/components/features/CreateRecruitmentForm", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/src/components/features/CreateRecruitmentForm")>();
  return {
    ...original,
    CreateRecruitmentForm: ({
      shopTarget,
      onSubmit,
      onCancel,
    }: {
      shopTarget?: {
        mode: "select";
        shops: Array<CreateRecruitmentShop & { regularClosedDays: string[] }>;
      };
      onSubmit: (data: CreateRecruitmentData, selectedShop?: CreateRecruitmentShop) => void | Promise<void>;
      onCancel?: () => void;
    }) => {
      const [draft, setDraft] = useState("");
      const data: CreateRecruitmentData = {
        periodStart: "2026-09-01",
        periodEnd: "2026-09-07",
        deadline: "2026-08-31",
        shopClosedDates: [],
      };
      return (
        <div>
          <input aria-label="入力中の募集" value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
          {shopTarget?.shops.map((shop) => (
            <span key={shop.shopId}>{shop.shopName}</span>
          ))}
          <button type="button" onClick={() => onSubmit(data, shopTarget?.shops[0])}>
            募集を作成
          </button>
          <button type="button" onClick={() => onSubmit(data, { shopId: "stale-shop", shopName: "古い店舗" })}>
            古い店舗で作成
          </button>
          <button type="button" onClick={onCancel}>
            キャンセル
          </button>
        </div>
      );
    },
  };
});

vi.mock("@/src/components/ui/StepperDialog", () => ({
  StepperDialog: ({ title, isOpen, children }: { title: string; isOpen: boolean; children: ReactNode }) =>
    isOpen ? <section aria-label={title}>{children}</section> : null,
}));

vi.mock("@/src/components/ui/Dialog", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/src/components/ui/Dialog")>();
  return {
    ...original,
    Dialog: ({
      title,
      isOpen,
      children,
      onSubmit,
      submitLabel,
    }: {
      title: string;
      isOpen: boolean;
      children: ReactNode;
      onSubmit?: () => void | Promise<void>;
      submitLabel?: string;
    }) =>
      isOpen ? (
        <section aria-label={title}>
          {children}
          {onSubmit && (
            <button type="button" onClick={onSubmit}>
              {submitLabel}
            </button>
          )}
        </section>
      ) : null,
  };
});

import { ChakraProvider } from "@/src/providers/ChakraProvider";
import { OrganizationRecruitmentManagement } from ".";

const recruitmentA: Recruitment = {
  _id: "recruitment-a" as Id<"recruitments">,
  createdAt: 1,
  periodStart: "2026-09-01",
  periodEnd: "2026-09-07",
  deadline: "2026-08-31",
  shopClosedDates: [],
  status: "open",
  confirmedAt: null,
  responseCount: 1,
  totalStaffCount: 3,
};

const recruitmentB: Recruitment = {
  ...recruitmentA,
  _id: "recruitment-b" as Id<"recruitments">,
  periodStart: "2026-09-08",
  periodEnd: "2026-09-14",
};

const pastRecruitment: Recruitment = {
  ...recruitmentA,
  _id: "recruitment-past" as Id<"recruitments">,
  periodStart: "2026-07-01",
  periodEnd: "2026-07-07",
};

const pastRecruitmentForPreview = (id: string, periodEnd: string, createdAt: number): Recruitment => ({
  ...pastRecruitment,
  _id: id as Id<"recruitments">,
  createdAt,
  periodEnd,
});

const organizationPastPreviewSections = [
  {
    shop: { shopId: "shop-a" as Id<"shops">, shopName: "本店" },
    recruitments: [
      pastRecruitmentForPreview("past-a-recent", "2026-08-13", 6),
      pastRecruitmentForPreview("past-a-middle", "2026-08-10", 3),
      pastRecruitmentForPreview("past-a-oldest", "2026-08-07", 1),
    ],
    hasMoreRecruitments: false,
  },
  {
    shop: { shopId: "shop-b" as Id<"shops">, shopName: "休止中の店舗" },
    recruitments: [
      pastRecruitmentForPreview("past-b-recent", "2026-08-12", 5),
      pastRecruitmentForPreview("past-b-middle", "2026-08-11", 4),
      pastRecruitmentForPreview("past-b-older", "2026-08-09", 2),
    ],
    hasMoreRecruitments: false,
  },
];

const groups: DashboardRecruitmentGroup[] = [
  { key: "collecting", title: "募集中", recruitments: [recruitmentA, recruitmentB], totalCount: 2 },
];

const shops: OrganizationRecruitmentShop[] = [
  {
    shopId: "shop-a" as Id<"shops">,
    shopName: "本店",
    regularClosedDays: ["mon"],
    hasPastRecruitments: true,
    canCreate: true,
  },
  {
    shopId: "shop-b" as Id<"shops">,
    shopName: "休止中の店舗",
    regularClosedDays: [],
    hasPastRecruitments: false,
    canCreate: false,
    createDisabledReason: "この店舗では募集を作成できません。",
  },
];

const recruitmentShopById = new Map<Recruitment["_id"], OrganizationRecruitmentShop>([
  [recruitmentA._id, shops[0]],
  [recruitmentB._id, shops[1]],
]);

const buildFeature = (props?: {
  organizationId?: Id<"organizations">;
  shopFilter?: "all" | Id<"shops">;
  isSingleShop?: boolean;
  groups?: DashboardRecruitmentGroup[];
  shops?: OrganizationRecruitmentShop[];
}) => (
  <ChakraProvider>
    <OrganizationRecruitmentManagement
      organizationId={props?.organizationId ?? ("organization-a" as Id<"organizations">)}
      shopFilter={props?.shopFilter ?? "all"}
      isSingleShop={props?.isSingleShop ?? (props?.shops ?? shops).length === 1}
      groups={props?.groups ?? groups}
      shops={props?.shops ?? shops}
      getRecruitmentShop={(recruitment) => recruitmentShopById.get(recruitment._id)}
      onOpenShiftBoard={vi.fn()}
    />
  </ChakraProvider>
);

const renderFeature = (props?: Parameters<typeof buildFeature>[0]) => render(buildFeature(props));

beforeEach(() => {
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
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  mocks.createRecruitment.mockReset().mockResolvedValue("recruitment-created");
  mocks.deleteRecruitment.mockReset().mockResolvedValue(null);
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.loadMoreOrganizationPastPreviews.mockReset();
  mocks.loadMorePast.mockReset();
  mocks.usePaginatedQuery.mockReset().mockImplementation((_reference, args) =>
    args === "skip"
      ? { results: [], status: "LoadingFirstPage", loadMore: mocks.loadMoreOrganizationPastPreviews }
      : {
          results: organizationPastPreviewSections,
          status: "Exhausted",
          loadMore: mocks.loadMoreOrganizationPastPreviews,
        },
  );
  mocks.useShopPaginatedQuery
    .mockReset()
    .mockImplementation((_reference, args) =>
      args === "skip"
        ? { results: [], status: "LoadingFirstPage", loadMore: mocks.loadMorePast }
        : { results: [pastRecruitment], status: "CanLoadMore", loadMore: mocks.loadMorePast },
    );
  mocks.boardProps = undefined;
  recruitmentShopById.set(recruitmentA._id, shops[0]);
  recruitmentShopById.set(recruitmentB._id, shops[1]);
});

describe("OrganizationRecruitmentManagement", () => {
  it("作成可能な1店舗を選択候補にし、shopIdとexpectedOrganizationIdを明示して作成する", async () => {
    renderFeature();

    expect(screen.getByText("本店")).not.toBeNull();
    expect(screen.getByText("休止中の店舗")).not.toBeNull();
    expect(mocks.boardProps).toMatchObject({
      canCreateRecruitments: true,
      canDeleteRecruitments: false,
      deleteRecruitmentDisabledReason: "この店舗では募集を作成できません。",
    });
    fireEvent.click(screen.getByRole("button", { name: "新しい募集をつくる" }));

    const createDialog = screen.getByRole("region", { name: "新しい募集をつくる" });
    expect(createDialog.textContent).toContain("本店");
    expect(createDialog.textContent).not.toContain("休止中の店舗");
    fireEvent.click(screen.getByRole("button", { name: "募集を作成" }));

    await waitFor(() =>
      expect(mocks.createRecruitment).toHaveBeenCalledExactlyOnceWith({
        periodStart: "2026-09-01",
        periodEnd: "2026-09-07",
        deadline: "2026-08-31",
        shopClosedDates: [],
        shopId: "shop-a",
        expectedOrganizationId: "organization-a",
      }),
    );
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "シフト提出依頼をスタッフに送りました",
    });
  });

  it("削除対象カードの店舗scopeと組織scopeを明示し、別店舗のscopeを流用しない", async () => {
    const writableShopB = { ...shops[1], canCreate: true, createDisabledReason: undefined };
    recruitmentShopById.set(recruitmentB._id, writableShopB);
    renderFeature({ shops: [shops[0], writableShopB] });

    fireEvent.click(screen.getByRole("button", { name: "recruitment-bを削除" }));
    fireEvent.click(screen.getByRole("button", { name: "この募集を削除" }));

    await waitFor(() =>
      expect(mocks.deleteRecruitment).toHaveBeenCalledExactlyOnceWith({
        recruitmentId: "recruitment-b",
        shopId: "shop-b",
        expectedOrganizationId: "organization-a",
      }),
    );
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "シフト募集を削除しました" });
  });

  it("Formから古い店舗が返ってもmutationを呼ばずfail closedにする", async () => {
    renderFeature();
    fireEvent.click(screen.getByRole("button", { name: "新しい募集をつくる" }));
    fireEvent.click(screen.getByRole("button", { name: "古い店舗で作成" }));

    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalledOnce());
    expect(mocks.createRecruitment).not.toHaveBeenCalled();
  });

  it("Dialogを開き直すと入力sessionを破棄する", () => {
    renderFeature();
    fireEvent.click(screen.getByRole("button", { name: "新しい募集をつくる" }));
    fireEvent.change(screen.getByRole("textbox", { name: "入力中の募集" }), { target: { value: "入力途中" } });
    expect((screen.getByRole("textbox", { name: "入力中の募集" }) as HTMLInputElement).value).toBe("入力途中");

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    fireEvent.click(screen.getByRole("button", { name: "新しい募集をつくる" }));

    expect((screen.getByRole("textbox", { name: "入力中の募集" }) as HTMLInputElement).value).toBe("");
  });

  it("全店舗では操作後に組織scopeで過去募集を読み、店舗横断の直近5件を表示する", () => {
    renderFeature();
    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(mocks.organizationPastPreviewRef, "skip", {
      initialNumItems: 1,
    });
    expect(mocks.useShopPaginatedQuery).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "past-a-recentを開く" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "過去のシフトを見る" }));

    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(
      mocks.organizationPastPreviewRef,
      { organizationId: "organization-a" },
      { initialNumItems: 1 },
    );
    expect(screen.getAllByRole("button", { name: /past-.*を開く/ }).map((button) => button.textContent)).toEqual([
      "past-a-recentを開く",
      "past-b-recentを開く",
      "past-b-middleを開く",
      "past-a-middleを開く",
      "past-b-olderを開く",
    ]);
    expect(screen.queryByRole("button", { name: "past-a-oldestを開く" })).toBeNull();
    expect(
      screen.getByText("直近5件を表示しています。さらに過去を見るには、店舗で絞り込んでください。"),
    ).not.toBeNull();
    expect(screen.getAllByText("本店").length).toBeGreaterThan(0);
    expect(screen.getAllByText("休止中の店舗").length).toBeGreaterThan(0);
  });

  it("全店舗previewの追加店舗pageを最後まで自動取得する", async () => {
    mocks.usePaginatedQuery.mockImplementation((_reference, args) =>
      args === "skip"
        ? { results: [], status: "LoadingFirstPage", loadMore: mocks.loadMoreOrganizationPastPreviews }
        : { results: [], status: "CanLoadMore", loadMore: mocks.loadMoreOrganizationPastPreviews },
    );
    renderFeature();

    fireEvent.click(screen.getByRole("button", { name: "過去のシフトを見る" }));

    await waitFor(() => expect(mocks.loadMoreOrganizationPastPreviews).toHaveBeenCalledExactlyOnceWith(1));
  });

  it("店舗filter時は明示した店舗scopeで過去募集を5件ずつ読む", () => {
    renderFeature({ shopFilter: "shop-a" as Id<"shops"> });

    const scope = screen.getByTestId("manager-shop-scope");
    expect(scope.getAttribute("data-shop-id")).toBe("shop-a");
    expect(scope.getAttribute("data-organization-id")).toBe("organization-a");
    expect(mocks.useShopPaginatedQuery).toHaveBeenLastCalledWith(mocks.pastRef, "skip", { initialNumItems: 5 });
    fireEvent.click(screen.getByRole("button", { name: "過去のシフトを見る" }));

    expect(screen.getByRole("button", { name: "recruitment-pastを開く" })).not.toBeNull();
    expect(screen.getAllByText("本店").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "もっと見る" }));
    expect(mocks.loadMorePast).toHaveBeenCalledExactlyOnceWith(5);
    expect(mocks.useShopPaginatedQuery).toHaveBeenLastCalledWith(mocks.pastRef, {}, { initialNumItems: 5 });
  });

  it("店舗が1つならfilter未指定でも店舗scopeの過去募集を5件ずつ読める", () => {
    renderFeature({ groups: [], shops: [shops[0]] });

    const scope = screen.getByTestId("manager-shop-scope");
    expect(scope.getAttribute("data-shop-id")).toBe("shop-a");
    expect(mocks.usePaginatedQuery).not.toHaveBeenCalled();
    expect(mocks.useShopPaginatedQuery).toHaveBeenLastCalledWith(mocks.pastRef, "skip", { initialNumItems: 5 });

    fireEvent.click(screen.getByRole("button", { name: "過去のシフトを見る" }));
    expect(screen.getByRole("button", { name: "recruitment-pastを開く" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "もっと見る" }));
    expect(mocks.loadMorePast).toHaveBeenCalledExactlyOnceWith(5);
  });

  it("全店舗previewの過去募集を、その募集の店舗scopeで削除する", async () => {
    const writableShopB = { ...shops[1], canCreate: true, createDisabledReason: undefined };
    renderFeature({
      groups: [{ ...groups[0], recruitments: [recruitmentA], totalCount: 1 }],
      shops: [shops[0], writableShopB],
    });
    fireEvent.click(screen.getByRole("button", { name: "過去のシフトを見る" }));
    fireEvent.click(screen.getByRole("button", { name: "past-b-recentを削除" }));
    fireEvent.click(screen.getByRole("button", { name: "この募集を削除" }));

    await waitFor(() =>
      expect(mocks.deleteRecruitment).toHaveBeenCalledExactlyOnceWith({
        recruitmentId: "past-b-recent",
        shopId: "shop-b",
        expectedOrganizationId: "organization-a",
      }),
    );
  });

  it("作成不可なら店舗の作成不可理由を表示する", () => {
    const createDisabledReason = "支払い結果を確認中のため、新しい募集を作成できません。";
    renderFeature({
      shops: shops.map((shop) => ({ ...shop, canCreate: false, createDisabledReason })),
    });

    expect((screen.getByRole("button", { name: "新しい募集をつくる" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(createDisabledReason)).not.toBeNull();
    expect(mocks.boardProps).toMatchObject({
      canCreateRecruitments: false,
      createRecruitmentDisabledReason: createDisabledReason,
    });
    expect(screen.queryByText("現在、募集を作成できません")).toBeNull();
  });

  it("作成中に組織が変わると古いsessionを閉じ、完了後も新しい組織のDialogを変更しない", async () => {
    let resolveCreate: ((value: string) => void) | undefined;
    mocks.createRecruitment.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const view = renderFeature();
    fireEvent.click(screen.getByRole("button", { name: "新しい募集をつくる" }));
    fireEvent.change(screen.getByRole("textbox", { name: "入力中の募集" }), { target: { value: "入力途中" } });
    fireEvent.click(screen.getByRole("button", { name: "募集を作成" }));
    await waitFor(() => expect(mocks.createRecruitment).toHaveBeenCalledOnce());

    view.rerender(buildFeature({ organizationId: "organization-b" as Id<"organizations"> }));
    expect(screen.queryByRole("region", { name: "新しい募集をつくる" })).toBeNull();
    await act(async () => {
      resolveCreate?.("recruitment-created");
      await Promise.resolve();
    });
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "新しい募集をつくる" }));
    expect((screen.getByRole("textbox", { name: "入力中の募集" }) as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "募集を作成" }));
    await waitFor(() => expect(mocks.createRecruitment).toHaveBeenCalledTimes(2));
    expect(mocks.createRecruitment.mock.calls[1]?.[0]).toMatchObject({
      shopId: "shop-a",
      expectedOrganizationId: "organization-b",
    });
  });

  it("作成中に店舗filterが変わっても古い完了結果で新しいDialogを閉じない", async () => {
    let resolveCreate: ((value: string) => void) | undefined;
    mocks.createRecruitment.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const view = renderFeature();
    fireEvent.click(screen.getByRole("button", { name: "新しい募集をつくる" }));
    fireEvent.click(screen.getByRole("button", { name: "募集を作成" }));
    await waitFor(() => expect(mocks.createRecruitment).toHaveBeenCalledOnce());

    view.rerender(buildFeature({ shopFilter: "shop-a" as Id<"shops"> }));
    expect(screen.queryByRole("region", { name: "新しい募集をつくる" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "新しい募集をつくる" }));
    expect(screen.getByRole("region", { name: "新しい募集をつくる" })).not.toBeNull();

    await act(async () => {
      resolveCreate?.("recruitment-created");
      await Promise.resolve();
    });

    expect(screen.getByRole("region", { name: "新しい募集をつくる" })).not.toBeNull();
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("削除中に店舗filterが変わっても古い完了結果で新しい削除Dialogを閉じない", async () => {
    let resolveDelete: (() => void) | undefined;
    mocks.deleteRecruitment.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
    );
    const writableShopB = { ...shops[1], canCreate: true, createDisabledReason: undefined };
    recruitmentShopById.set(recruitmentB._id, writableShopB);
    const view = renderFeature({ shops: [shops[0], writableShopB] });
    fireEvent.click(screen.getByRole("button", { name: "recruitment-aを削除" }));
    fireEvent.click(screen.getByRole("button", { name: "この募集を削除" }));
    await waitFor(() => expect(mocks.deleteRecruitment).toHaveBeenCalledOnce());

    view.rerender(
      buildFeature({
        shopFilter: "shop-b" as Id<"shops">,
        shops: [shops[0], writableShopB],
      }),
    );
    expect(screen.queryByRole("region", { name: /9\/1.*シフト募集を削除/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "recruitment-bを削除" }));
    expect(screen.getByRole("region", { name: /9\/8.*シフト募集を削除/ })).not.toBeNull();

    await act(async () => {
      resolveDelete?.();
      await Promise.resolve();
    });

    expect(screen.getByRole("region", { name: /9\/8.*シフト募集を削除/ })).not.toBeNull();
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });
});
