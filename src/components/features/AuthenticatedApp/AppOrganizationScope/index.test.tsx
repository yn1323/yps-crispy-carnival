// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  organizationListRef: Symbol("listMyOrganizationContexts"),
  organizationContextRef: Symbol("getOrganizationContext"),
  activeShopsRef: Symbol("listOrganizationActiveShops"),
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
  loadOrganizations: vi.fn(),
  loadShops: vi.fn(),
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: mocks.usePaginatedQuery,
  useQuery: mocks.useQuery,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    appOrganization: {
      queries: {
        listMyOrganizationContexts: mocks.organizationListRef,
        getOrganizationContext: mocks.organizationContextRef,
        listOrganizationActiveShops: mocks.activeShopsRef,
      },
    },
  },
}));

import { AppOrganizationScopeProvider, resolveAppOrganizationErrorReason, useAppOrganizationScope } from ".";

const renderState = (state: { kind: string; reason?: string }) => (
  <div data-testid="organization-state">{state.reason ?? state.kind}</div>
);

function ScopeConsumer() {
  const scope = useAppOrganizationScope();
  return (
    <div data-testid="scope">
      {scope.organizationName}:{scope.activeShops?.map((shop) => shop.name).join(",") ?? "shops-loading"};orgs:
      {scope.organizations?.map((organization) => organization.name).join(",") ?? "organizations-loading"}
    </div>
  );
}

beforeEach(() => {
  mocks.usePaginatedQuery.mockReset();
  mocks.useQuery.mockReset();
  mocks.loadOrganizations.mockReset();
  mocks.loadShops.mockReset();
});

describe("AppOrganizationScopeProvider", () => {
  it("org未指定時はcanonicalな先頭組織を通知し、URL正規化を待つ", async () => {
    const onResolved = vi.fn();
    mocks.usePaginatedQuery.mockReturnValue({
      results: [
        {
          organizationId: "organization-a",
          organizationName: "A組織",
        },
      ],
      status: "Exhausted",
      loadMore: mocks.loadOrganizations,
    });

    render(
      <AppOrganizationScopeProvider onCanonicalOrganizationResolved={onResolved} renderState={renderState}>
        <ScopeConsumer />
      </AppOrganizationScopeProvider>,
    );

    expect(screen.getByTestId("organization-state").textContent).toBe("loading");
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith("organization-a"));
    expect(mocks.useQuery).not.toHaveBeenCalled();
  });

  it("有効なcanonical所属が0件ならemptyを表示する", () => {
    mocks.usePaginatedQuery.mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: mocks.loadOrganizations,
    });

    render(
      <AppOrganizationScopeProvider onCanonicalOrganizationResolved={vi.fn()} renderState={renderState}>
        <ScopeConsumer />
      </AppOrganizationScopeProvider>,
    );

    expect(screen.getByTestId("organization-state").textContent).toBe("empty");
  });

  it("所属pageが空でもcursorが残る間はcanonical組織を探し続ける", async () => {
    mocks.usePaginatedQuery.mockReturnValue({
      results: [],
      status: "CanLoadMore",
      loadMore: mocks.loadOrganizations,
    });

    render(
      <AppOrganizationScopeProvider onCanonicalOrganizationResolved={vi.fn()} renderState={renderState}>
        <ScopeConsumer />
      </AppOrganizationScopeProvider>,
    );

    expect(screen.getByTestId("organization-state").textContent).toBe("loading");
    await waitFor(() => expect(mocks.loadOrganizations).toHaveBeenCalledWith(50));
  });

  it("明示orgをdirect queryで検証し、active店舗の全page完了後だけ一覧を公開する", () => {
    mocks.useQuery.mockReturnValue({
      organizationId: "organization-a",
      organizationName: "A組織",
    });
    mocks.usePaginatedQuery.mockImplementation((reference) =>
      reference === mocks.organizationListRef
        ? {
            results: [
              { organizationId: "organization-a", organizationName: "A組織" },
              { organizationId: "organization-b", organizationName: "B組織" },
            ],
            status: "Exhausted",
            loadMore: mocks.loadOrganizations,
          }
        : {
            results: [
              { shopId: "shop-a", shopName: "A店" },
              { shopId: "shop-b", shopName: "B店" },
            ],
            status: "Exhausted",
            loadMore: mocks.loadShops,
          },
    );

    render(
      <AppOrganizationScopeProvider
        requestedOrganizationId="organization-a"
        onCanonicalOrganizationResolved={vi.fn()}
        renderState={renderState}
      >
        <ScopeConsumer />
      </AppOrganizationScopeProvider>,
    );

    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.organizationContextRef, {
      organizationId: "organization-a",
    });
    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(
      mocks.activeShopsRef,
      { organizationId: "organization-a" },
      { initialNumItems: 50 },
    );
    expect(screen.getByTestId("scope").textContent).toBe("A組織:A店,B店;orgs:A組織,B組織");
  });

  it("組織contextの確定前はactive店舗queryを開始せず、所属失効時は子treeを閉じる", () => {
    let organization:
      | {
          organizationId: string;
          organizationName: string;
        }
      | null
      | undefined;
    mocks.useQuery.mockImplementation(() => organization);
    mocks.usePaginatedQuery.mockImplementation((reference) => ({
      results:
        reference === mocks.organizationListRef
          ? [{ organizationId: "organization-a", organizationName: "A組織" }]
          : [{ shopId: "shop-a", shopName: "A店" }],
      status: "Exhausted",
      loadMore: reference === mocks.organizationListRef ? mocks.loadOrganizations : mocks.loadShops,
    }));

    const view = () => (
      <AppOrganizationScopeProvider
        requestedOrganizationId="organization-a"
        onCanonicalOrganizationResolved={vi.fn()}
        renderState={renderState}
      >
        <ScopeConsumer />
      </AppOrganizationScopeProvider>
    );
    const { rerender } = render(view());

    expect(screen.getByTestId("organization-state").textContent).toBe("loading");
    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(mocks.activeShopsRef, "skip", { initialNumItems: 50 });
    expect(screen.queryByTestId("scope")).toBeNull();

    organization = {
      organizationId: "organization-a",
      organizationName: "A組織",
    };
    rerender(view());
    expect(screen.getByTestId("scope").textContent).toBe("A組織:A店;orgs:A組織");

    organization = null;
    rerender(view());
    expect(screen.getByTestId("organization-state").textContent).toBe("inaccessible");
    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(mocks.activeShopsRef, "skip", { initialNumItems: 50 });
    expect(screen.queryByTestId("scope")).toBeNull();
  });

  it("active店舗に次pageがあれば継続取得し、部分pageをscopeへ公開しない", async () => {
    mocks.useQuery.mockReturnValue({
      organizationId: "organization-a",
      organizationName: "A組織",
    });
    mocks.usePaginatedQuery.mockImplementation((reference) =>
      reference === mocks.organizationListRef
        ? {
            results: [{ organizationId: "organization-a", organizationName: "A組織" }],
            status: "Exhausted",
            loadMore: mocks.loadOrganizations,
          }
        : {
            results: [{ shopId: "shop-a", shopName: "A店" }],
            status: "CanLoadMore",
            loadMore: mocks.loadShops,
          },
    );

    render(
      <AppOrganizationScopeProvider
        requestedOrganizationId="organization-a"
        onCanonicalOrganizationResolved={vi.fn()}
        renderState={renderState}
      >
        <ScopeConsumer />
      </AppOrganizationScopeProvider>,
    );

    expect(screen.getByTestId("scope").textContent).toBe("A組織:shops-loading;orgs:A組織");
    await waitFor(() => expect(mocks.loadShops).toHaveBeenCalledWith(50));
  });

  it("canonical組織一覧は全page完了までHeaderの切替候補へ公開しない", async () => {
    mocks.useQuery.mockReturnValue({
      organizationId: "organization-a",
      organizationName: "A組織",
    });
    mocks.usePaginatedQuery.mockImplementation((reference) =>
      reference === mocks.organizationListRef
        ? {
            results: [{ organizationId: "organization-a", organizationName: "A組織" }],
            status: "CanLoadMore",
            loadMore: mocks.loadOrganizations,
          }
        : {
            results: [{ shopId: "shop-a", shopName: "A店" }],
            status: "Exhausted",
            loadMore: mocks.loadShops,
          },
    );

    render(
      <AppOrganizationScopeProvider
        requestedOrganizationId="organization-a"
        onCanonicalOrganizationResolved={vi.fn()}
        renderState={renderState}
      >
        <ScopeConsumer />
      </AppOrganizationScopeProvider>,
    );

    expect(screen.getByTestId("scope").textContent).toBe("A組織:A店;orgs:organizations-loading");
    await waitFor(() => expect(mocks.loadOrganizations).toHaveBeenCalledWith(50));
  });
});

describe("resolveAppOrganizationErrorReason", () => {
  it("明示orgのNot foundだけを権限・存在エラーとして扱う", () => {
    expect(resolveAppOrganizationErrorReason(new Error("Not found"), true)).toBe("inaccessible");
    expect(resolveAppOrganizationErrorReason(new Error("Network timeout"), true)).toBe("query");
    expect(resolveAppOrganizationErrorReason(new Error("Not found"), false)).toBe("query");
  });
});
